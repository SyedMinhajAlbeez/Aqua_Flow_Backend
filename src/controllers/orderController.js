// ==================== ORDER CONTROLLER ====================
// src/controllers/orderController.js
// FIXED: ProductInventory Model + Composite Key - NOV 23, 2025
// UPDATED: Flexible Deposit Handling - NOV 24, 2025
// FIXED: Lost Calculation & Logging for Debug - NOV 24, 2025
// FIXED: Increment Product Stock on Return (Sync with Global Pool) - NOV 24, 2025
// ✅ FIXED: Global Pool Update for ALL Reusables - NOV 25, 2025
// ✅ MODIFIED: Driver Optional in Create (Pending Flow + Assign Later) - NOV 25, 2025
// ✅ ADDED: Customer Support in CreateOrder (Auto Customer ID from Token) - NOV 25, 2025
// ✅ FIXED: Transaction Timeout (15s) for Neon Latency - NOV 27, 2025

const prisma = require("../prisma/client");

exports.createOrder = async (req, res) => {
  try {
    const {
      customerId,
      items,
      deliveryDate,
      driverId, // Optional – ab create time pe nahi denge
      paymentMethod = "cash_on_delivery",
      acceptableDepositAmount = 0,
    } = req.body;

    const tenantId = req.derivedTenantId;
    let createdById = req.user.id;
    const userRole = req.user.role;

    // === AUTH & CUSTOMER ID LOGIC ===
    let effectiveCustomerId = customerId;
    let isCustomerOrder = false;

    if (userRole === "customer") {
      isCustomerOrder = true;
      effectiveCustomerId = req.user.id;
      if (driverId) {
        return res.status(400).json({
          error: "Customers cannot assign drivers during order creation",
        });
      }
      createdById = null;
    } else if (!["company_admin", "super_admin"].includes(userRole)) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // === BASIC VALIDATION ===
    if (!effectiveCustomerId || !items?.length || !deliveryDate) {
      return res.status(400).json({
        error: "customerId, items, and deliveryDate are required",
      });
    }
    if (acceptableDepositAmount < 0) {
      return res.status(400).json({ error: "Deposit cannot be negative" });
    }

    // === FETCH CUSTOMER WITH ZONE ===
    const customer = await prisma.customer.findUnique({
      where: { id: effectiveCustomerId, tenantId },
      include: { zone: true },
    });
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    if (!customer.zoneId)
      return res.status(400).json({ error: "Customer has no zone assigned" });

    // === DRIVER VALIDATION (only if provided) ===
    let initialStatus = "pending";
    if (driverId) {
      const driver = await prisma.driver.findUnique({
        where: { id: driverId, tenantId },
        include: { zone: true },
      });
      if (!driver) return res.status(404).json({ error: "Driver not found" });
      if (driver.status !== "active")
        return res.status(400).json({ error: "Driver is not active" });
      if (driver.zoneId !== customer.zoneId)
        return res.status(400).json({ error: "Driver must be from same zone" });

      initialStatus = "in_progress";
    }

    // === PROCESS ITEMS ===
    let totalProductPrice = 0;
    let totalRequiredDeposit = 0;
    const orderItems = [];
    let totalReusableDelivered = 0;
    let circulatingReusableDelivered = 0;
    let expectedEmpties = 0;

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId, tenantId },
      });
      if (!product || product.status !== "active") {
        return res
          .status(400)
          .json({ error: `Product not available: ${item.productId}` });
      }

      const quantity = parseInt(item.quantity) || 1;

      const inventory = await prisma.productInventory.findUnique({
        where: { productId_tenantId: { productId: product.id, tenantId } },
      });
      if (!inventory || inventory.currentStock < quantity) {
        return res.status(400).json({
          error: `${product.name} out of stock! Available: ${
            inventory?.currentStock || 0
          }`,
        });
      }

      const itemTotal = quantity * product.price;
      totalProductPrice += itemTotal;

      if (product.isReusable) {
        totalRequiredDeposit += quantity * product.depositAmount;
      }

      orderItems.push({
        productId: product.id,
        quantity,
        unitPrice: product.price,
        depositAmount: product.isReusable ? product.depositAmount : 0,
        totalPrice: itemTotal,
      });

      if (product.isReusable) {
        totalReusableDelivered += quantity;
        if (product.requiresEmptyReturn) {
          circulatingReusableDelivered += quantity;
          expectedEmpties += quantity;
        }
      }
    }

    if (acceptableDepositAmount > totalRequiredDeposit) {
      return res.status(400).json({
        error: `Acceptable deposit cannot exceed required deposit (${totalRequiredDeposit})`,
      });
    }

    const totalAmount = totalProductPrice + acceptableDepositAmount;

    // === ORDER NUMBER ===
    const orderCount = await prisma.order.count({ where: { tenantId } });
    const orderNumberDisplay = `#${1000 + orderCount + 1}`;

    // === MAIN TRANSACTION ===
    const order = await prisma.$transaction(
      async (tx) => {
        // 1. Create Order
        const newOrder = await tx.order.create({
          data: {
            orderNumberDisplay,
            customerId: effectiveCustomerId,
            driverId: driverId || null,
            zoneId: customer.zoneId,
            deliveryDate: new Date(deliveryDate),
            deliveryAddress: customer.address,
            totalAmount,
            acceptableDepositAmount,
            paymentMethod,
            status: initialStatus,
            tenantId,
            createdById,
            items: { create: orderItems },
          },
        });

        // 2. Update Customer Security Deposit
        await tx.customer.update({
          where: { id: effectiveCustomerId },
          data: { securityDeposit: { increment: acceptableDepositAmount } },
        });

        // 3. Decrement Product Stock
        for (const item of items) {
          await tx.productInventory.update({
            where: {
              productId_tenantId: { productId: item.productId, tenantId },
            },
            data: {
              currentStock: { decrement: parseInt(item.quantity) || 1 },
              totalSold: { increment: parseInt(item.quantity) || 1 },
            },
          });
        }

        // 4. Global Bottle Pool Update (only reusables)
        if (totalReusableDelivered > 0) {
          await tx.bottleInventory.upsert({
            where: { tenantId },
            update: {
              inStock: { decrement: totalReusableDelivered },
              withCustomers: { increment: totalReusableDelivered },
            },
            create: {
              tenantId,
              inStock: Math.max(0, -totalReusableDelivered),
              withCustomers: totalReusableDelivered,
            },
          });
        }

        // 5. Customer empties tracking
        if (circulatingReusableDelivered > 0) {
          await tx.customer.update({
            where: { id: effectiveCustomerId },
            data: {
              empties: { increment: expectedEmpties },
              bottlesGiven: { increment: circulatingReusableDelivered },
            },
          });
        }

        // FINAL FETCH – FIXED: driver null issue solved with conditional spread
        return await tx.order.findUnique({
          where: { id: newOrder.id },
          include: {
            customer: { select: { name: true, phone: true, address: true } },
            ...(driverId && {
              driver: {
                select: {
                  name: true,
                  phone: true,
                  vehicleNumber: true,
                  vehicleType: true,
                },
              },
            }),
            zone: { select: { name: true } },
            items: {
              include: {
                product: {
                  select: {
                    name: true,
                    size: true,
                    price: true,
                    depositAmount: true,
                    isReusable: true,
                  },
                },
              },
            },
          },
        });
      },
      { timeout: 15000 }
    ); // ✅ FIXED: 15s timeout for Neon latency

    res.status(201).json({
      message: isCustomerOrder
        ? "Order placed successfully! Driver will be assigned soon."
        : "Order created (pending driver assignment)",
      totalRequiredDeposit,
      acceptableDepositAmount,
      reusableBottlesDelivered: totalReusableDelivered,
      expectedEmpties,
      initialStatus,
      isCustomerOrder,
      order,
    });
  } catch (err) {
    console.error("Create Order Error:", err);
    res.status(500).json({
      error: "Failed to create order",
      details: err.message, // dev mein helpful hai
    });
  }
};

// ==================== ASSIGN DRIVER TO PENDING ORDER ====================
// Admin-only: Assign driver to a pending order, update to in_progress
exports.assignDriverToOrder = async (req, res) => {
  try {
    const { id } = req.params; // Order ID
    const { driverId } = req.body;
    const tenantId = req.derivedTenantId;

    if (!driverId) {
      return res.status(400).json({ error: "Driver ID is required" });
    }

    // Fetch order with customer
    const order = await prisma.order.findUnique({
      where: { id, tenantId },
      include: { customer: { include: { zone: true } } },
    });
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status !== "pending") {
      return res
        .status(400)
        .json({ error: "Only pending orders can have driver assigned" });
    }
    if (order.driverId) {
      return res.status(400).json({ error: "Driver already assigned" });
    }

    // Driver validation
    const driver = await prisma.driver.findUnique({
      where: { id: driverId, tenantId },
      include: { zone: true },
    });
    if (!driver) return res.status(404).json({ error: "Driver not found" });
    if (driver.status !== "active") {
      return res.status(400).json({ error: "Driver is not active" });
    }
    if (driver.zoneId !== order.customer.zoneId) {
      return res
        .status(400)
        .json({ error: "Driver must be from customer's zone" });
    }

    // Update order
    const updatedOrder = await prisma.order.update({
      where: { id, tenantId },
      data: {
        driverId,
        status: "in_progress",
      },
      include: {
        customer: { select: { name: true } },
        driver: { select: { name: true, vehicleNumber: true } },
      },
    });

    // Optional: Update driver todayDeliveries
    await prisma.driver.update({
      where: { id: driverId },
      data: { todayDeliveries: { increment: 1 } },
    });

    res.json({
      message: "Driver assigned successfully",
      order: updatedOrder,
    });
  } catch (err) {
    console.error("Assign Driver Error:", err);
    res.status(500).json({ error: "Failed to assign driver" });
  }
};

// ==================== GET ALL ORDERS ====================
exports.getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 15;
    const skip = (page - 1) * limit;
    const tenantId = req.derivedTenantId;
    const [orders, total, stats] = await Promise.all([
      prisma.order.findMany({
        where: { tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          customer: { select: { name: true, phone: true } },
          driver: {
            select: {
              name: true,
              vehicleNumber: true,
              vehicleType: true,
            },
          },
          zone: { select: { name: true } },
          items: {
            include: { product: { select: { name: true, size: true } } },
          },
        },
      }),
      prisma.order.count({ where: { tenantId } }),
      prisma.order.groupBy({
        by: ["status"],
        where: { tenantId },
        _count: { status: true },
      }),
    ]);
    const statusCount = stats.reduce((acc, curr) => {
      acc[curr.status] = curr._count.status;
      return acc;
    }, {});
    res.json({
      orders,
      stats: {
        totalOrders: total,
        pending: statusCount.pending || 0,
        in_progress: statusCount.in_progress || 0,
        delivered: statusCount.delivered || 0,
        completed: statusCount.completed || 0,
        cancelled: statusCount.cancelled || 0,
        failed: statusCount.failed || 0,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Get Orders Error:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
};

// ==================== MARK AS DELIVERED ====================
exports.markAsDelivered = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.derivedTenantId;
    const order = await prisma.order.update({
      where: { id, tenantId },
      data: { status: "delivered" },
      include: { driver: true }, // For logging if needed
    });

    // Optional: Increment driver totalDeliveries
    if (order.driverId) {
      await prisma.driver.update({
        where: { id: order.driverId },
        data: { totalDeliveries: { increment: 1 } },
      });
    }

    res.json({ message: "Order marked as delivered", order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ==================== COMPLETE ORDER WITH EMPTIES ====================
// REPLACE ONLY THIS FUNCTION IN orderController.js

exports.completeOrderWithEmpties = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      collectedEmpties,
      damagedEmpties = 0,
      leakedEmpties = 0,
    } = req.body;

    const tenantId = req.derivedTenantId;

    if (collectedEmpties === undefined) {
      return res.status(400).json({ error: "collectedEmpties required" });
    }

    const order = await prisma.order.findUnique({
      where: { id, tenantId },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, isReusable: true, requiresEmptyReturn: true },
            },
          },
        },
        customer: true,
      },
    });

    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status !== "delivered") {
      return res.status(400).json({ error: "Order must be delivered first" });
    }

    // Check if this order had ANY reusable product
    const hasReusableProduct = order.items.some(
      (item) => item.product.isReusable
    );

    // Calculate empties logic
    const reusableItems = order.items.filter(
      (i) => i.product.isReusable && i.product.requiresEmptyReturn
    );
    const totalExpectedEmpties = reusableItems.reduce(
      (sum, i) => sum + i.quantity,
      0
    );
    const goodReturned = collectedEmpties - damagedEmpties - leakedEmpties;
    if (goodReturned < 0)
      return res.status(400).json({ error: "Invalid count" });

    const lostEmpties = Math.max(0, totalExpectedEmpties - collectedEmpties);

    await prisma.$transaction(
      async (tx) => {
        // 1. Update customer empties
        await tx.customer.update({
          where: { id: order.customerId },
          data: { empties: { decrement: collectedEmpties } },
        });

        // 2. Update global bottle pool
        await tx.bottleInventory.upsert({
          where: { tenantId },
          update: {
            withCustomers: { decrement: collectedEmpties },
            inStock: { increment: goodReturned },
            repairable: { increment: damagedEmpties },
            leaked: { increment: leakedEmpties },
            lost: { increment: lostEmpties },
          },
          create: {
            tenantId,
            withCustomers: Math.max(0, -collectedEmpties),
            inStock: goodReturned,
            repairable: damagedEmpties,
            leaked: leakedEmpties,
            lost: lostEmpties,
          },
        });

        // 3. Return stock to products (proportional)
        if (goodReturned > 0 && reusableItems.length > 0) {
          for (const item of reusableItems) {
            const proportion = item.quantity / totalExpectedEmpties;
            const returnQty = Math.round(goodReturned * proportion);
            if (returnQty > 0) {
              await tx.productInventory.update({
                where: {
                  productId_tenantId: { productId: item.product.id, tenantId },
                },
                data: { currentStock: { increment: returnQty } },
              });
            }
          }
        }

        // 4. Update order status
        await tx.order.update({
          where: { id },
          data: { status: "completed" },
        });

        // ✅ FIXED: 7 days eligibility
        if (hasReusableProduct) {
          await tx.customer.update({
            where: { id: order.customerId },
            data: {
              lastOrderDate: new Date(),
              nextEligibleDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // ✅ +7 days
            },
          });
        }
      },
      { timeout: 15000 }
    ); // ✅ FIXED: 15s timeout for Neon latency

    res.json({
      success: true,
      message: "Order completed successfully!",
      expectedEmpties: totalExpectedEmpties,
      collected: collectedEmpties,
      goodReturned,
      damaged: damagedEmpties,
      leaked: leakedEmpties,
      lost: lostEmpties,
      recurringBlocked: hasReusableProduct ? "7 days" : "Immediately eligible", // ✅ Updated
    });
  } catch (err) {
    console.error("Complete Order Error:", err);
    res
      .status(500)
      .json({ error: "Failed to complete order", details: err.message });
  }
};

// ==================== UPDATE ORDER STATUS ====================
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const tenantId = req.derivedTenantId;
    const validStatuses = [
      "pending",
      "confirmed",
      "in_progress",
      "out_for_delivery",
      "delivered",
      "completed",
      "cancelled",
      "failed",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    // For cancel: Add revert logic if needed (stock + pool rollback)
    const order = await prisma.order.update({
      where: { id, tenantId },
      data: { status },
      include: {
        customer: { select: { name: true } },
        driver: { select: { name: true, vehicleNumber: true } },
      },
    });
    res.json({ message: "Status updated", order });
  } catch (err) {
    res.status(500).json({ error: "Failed to update status" });
  }
};
