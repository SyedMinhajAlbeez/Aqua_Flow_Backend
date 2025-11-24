// ==================== ORDER CONTROLLER ====================
// src/controllers/orderController.js
// FIXED: ProductInventory Model + Composite Key - NOV 23, 2025
// UPDATED: Flexible Deposit Handling - NOV 24, 2025
// FIXED: Lost Calculation & Logging for Debug - NOV 24, 2025
// FIXED: Increment Product Stock on Return (Sync with Global Pool) - NOV 24, 2025
// ✅ FIXED: Global Pool Update for ALL Reusables - NOV 25, 2025

const prisma = require("../prisma/client");

exports.createOrder = async (req, res) => {
  try {
    const {
      customerId,
      items, // [{ productId, quantity }]
      deliveryDate,
      driverId,
      paymentMethod = "cash_on_delivery",
      acceptableDepositAmount = 0, // ← NAYA: Customer jitna deposit dena chahe
    } = req.body;

    const tenantId = req.derivedTenantId;
    const createdById = req.user.id;

    // === VALIDATION ===
    if (
      !customerId ||
      !items ||
      items.length === 0 ||
      !deliveryDate ||
      !driverId
    ) {
      return res.status(400).json({
        error: "Customer, items, delivery date, and driver are required",
      });
    }

    // Acceptable deposit validation (non-negative)
    if (acceptableDepositAmount < 0) {
      return res.status(400).json({
        error: "Acceptable deposit amount cannot be negative",
      });
    }

    // === CUSTOMER + ZONE ===
    const customer = await prisma.customer.findUnique({
      where: { id: customerId, tenantId },
      include: { zone: true },
    });
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    if (!customer.zoneId)
      return res.status(400).json({ error: "Customer has no zone assigned" });

    // === DRIVER VALIDATION ===
    const driver = await prisma.driver.findUnique({
      where: { id: driverId, tenantId },
      include: { zone: true },
    });
    if (!driver) return res.status(404).json({ error: "Driver not found" });
    if (driver.status !== "active")
      return res.status(400).json({ error: "Driver is not active" });
    if (driver.zoneId !== customer.zoneId)
      return res
        .status(400)
        .json({ error: "Driver must be from customer's zone" });

    // === PROCESS ITEMS + STOCK CHECK + CALCULATE TOTALS ===
    let totalProductPrice = 0;
    let totalRequiredDeposit = 0;
    const orderItems = [];
    let totalReusableDelivered = 0; // All reusables (for info/deposit)
    let circulatingReusableDelivered = 0; // FIXED: Only return-required reusables (for withCustomers & empties)
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

      // === STOCK CHECK (Product-Wise Inventory) ===
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

      // === PRICE CALCULATION (Base Price Only - Deposits Handled Separately) ===
      const itemTotal = quantity * product.price;
      totalProductPrice += itemTotal;

      // === REQUIRED DEPOSIT CALCULATION (For All Reusables) ===
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

      // === COUNT FOR REUSABLE/EMPTY LOGIC ===
      if (product.isReusable) {
        totalReusableDelivered += quantity;
        if (product.requiresEmptyReturn) {
          // FIXED: Only if return required
          circulatingReusableDelivered += quantity;
          expectedEmpties += quantity;
        }
      }
    }

    // === DEPOSIT VALIDATION ===
    if (acceptableDepositAmount > totalRequiredDeposit) {
      return res.status(400).json({
        error: `Acceptable deposit cannot exceed total required deposit: ${totalRequiredDeposit}`,
      });
    }

    // === FINAL TOTAL AMOUNT (Products + Acceptable Deposit) ===
    const totalAmount = totalProductPrice + acceptableDepositAmount;

    // === AUTO ORDER NUMBER ===
    const orderCount = await prisma.order.count({ where: { tenantId } });
    const orderNumberDisplay = `#${1000 + orderCount + 1}`;

    // === TRANSACTION — SAB KUCH EK SAATH ===
    const order = await prisma.$transaction(async (tx) => {
      // 1. Create Order with Acceptable Deposit
      const newOrder = await tx.order.create({
        data: {
          orderNumberDisplay,
          customerId,
          driverId,
          zoneId: customer.zoneId,
          deliveryDate: new Date(deliveryDate),
          deliveryAddress: customer.address,
          totalAmount,
          acceptableDepositAmount, // ← NAYA FIELD
          paymentMethod,
          status: "in_progress",
          tenantId,
          createdById,
          items: { create: orderItems },
        },
      });

      // 2. Update Customer Security Deposit
      await tx.customer.update({
        where: { id: customerId },
        data: {
          securityDeposit: { increment: acceptableDepositAmount },
        },
      });

      // 3. Update Product-Wise Inventory (All Products)
      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        await tx.productInventory.update({
          where: { productId_tenantId: { productId: product.id, tenantId } },
          data: {
            currentStock: { decrement: parseInt(item.quantity) || 1 },
            totalSold: { increment: parseInt(item.quantity) || 1 },
          },
        });
      }

      // 4. ✅ FIXED: Reusable Bottles Global Pool Update - HAR REUSABLE KE LIYE
      // Update for ALL reusables (not just requiresEmptyReturn)
      if (totalReusableDelivered > 0) {
        // Company reusable bottles pool - SAB reusable products ke liye
        await tx.bottleInventory.upsert({
          where: { tenantId },
          update: {
            inStock: { decrement: totalReusableDelivered }, // ✅ SAB REUSABLES
            withCustomers: { increment: totalReusableDelivered }, // ✅ SAB REUSABLES
          },
          create: {
            tenantId,
            inStock: Math.max(0, -totalReusableDelivered),
            withCustomers: totalReusableDelivered,
          },
        });

        console.log(
          `Order Create Debug: Total Reusable Delivered=${totalReusableDelivered}, Circulating (requiresReturn)=${circulatingReusableDelivered}, Expected Empties=${expectedEmpties}`
        );
      } else {
        console.log(`Order Create Debug: No reusables (no pool update)`);
      }

      // 5. Customer Tracking (Sirf requiresEmptyReturn=true products ke liye empties track karo)
      if (circulatingReusableDelivered > 0) {
        await tx.customer.update({
          where: { id: customerId },
          data: {
            empties: { increment: expectedEmpties },
            bottlesGiven: { increment: circulatingReusableDelivered },
          },
        });
      }

      // Return full order with details
      return await tx.order.findUnique({
        where: { id: newOrder.id },
        include: {
          customer: { select: { name: true, phone: true, address: true } },
          driver: {
            select: {
              name: true,
              phone: true,
              vehicleNumber: true,
              vehicleType: true,
            },
          },
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
    });

    res.status(201).json({
      message: "Order created successfully",
      totalRequiredDeposit, // ← FRONTEND KE LIYE: Total deposit show karne ke liye
      acceptableDepositAmount, // ← Customer ne jitna diya
      reusableBottlesDelivered: totalReusableDelivered,
      circulatingReusableDelivered, // Sirf return-required
      expectedEmpties,
      order,
    });
  } catch (err) {
    console.error("Create Order Error:", err);
    res.status(500).json({ error: "Failed to create order" });
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
    });

    res.json({ message: "Order marked as delivered", order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ==================== COMPLETE ORDER WITH EMPTIES ====================
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

    // Calculate expected empties per reusable product (for proportional return)
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

    console.log(
      `Complete Order Debug: Expected=${totalExpectedEmpties}, Collected=${collectedEmpties}, Good=${goodReturned}, Lost=${lostEmpties}`
    );

    await prisma.$transaction(async (tx) => {
      // 1. Update customer empties
      const updatedCustomer = await tx.customer.update({
        where: { id: order.customerId },
        data: { empties: { decrement: collectedEmpties } },
        select: { empties: true },
      });

      // 2. Update global bottle pool
      const updatedBottle = await tx.bottleInventory.update({
        where: { tenantId },
        data: {
          withCustomers: { decrement: collectedEmpties },
          inStock: { increment: goodReturned },
          repairable: { increment: damagedEmpties },
          leaked: { increment: leakedEmpties },
          lost: { increment: lostEmpties },
        },
        select: { withCustomers: true, inStock: true },
      });

      // 3. Add back goodReturned to per-product stock (proportional for reusables)
      if (goodReturned > 0 && reusableItems.length > 0) {
        for (const item of reusableItems) {
          const expectedForThisProduct = item.quantity;
          const proportion = expectedForThisProduct / totalExpectedEmpties;
          const returnForThisProduct = Math.round(goodReturned * proportion);

          await tx.productInventory.update({
            where: {
              productId_tenantId: { productId: item.product.id, tenantId },
            },
            data: { currentStock: { increment: returnForThisProduct } },
          });

          console.log(
            `Returned to Product ${item.product.id}: +${returnForThisProduct} (proportion ${proportion})`
          );
        }
      }

      // 4. Update order status
      await tx.order.update({
        where: { id },
        data: { status: "completed" },
      });

      console.log(
        `Post-Update Debug: Customer Empties=${updatedCustomer.empties}, Bottle WithCustomers=${updatedBottle.withCustomers}, InStock=${updatedBottle.inStock}`
      );
    });

    res.json({
      message: "Order completed!",
      expectedEmpties: totalExpectedEmpties,
      collectedEmpties,
      goodReturned,
      damaged: damagedEmpties,
      leaked: leakedEmpties,
      lost: lostEmpties,
    });
  } catch (err) {
    console.error("Complete Order Error:", err);
    res.status(500).json({ error: "Failed to complete order" });
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
