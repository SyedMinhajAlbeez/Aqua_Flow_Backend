// src/controllers/customerOrderController.js
const prisma = require("../../prisma/client");

// CREATE ORDER - CUSTOMER APP (EXACTLY SAME LOGIC AS ADMIN)
exports.createCustomerOrder = async (req, res) => {
  try {
    const {
      items,
      deliveryDate,
      paymentMethod = "cash_on_delivery",
      acceptableDepositAmount = 0,
      isRecurring = false,
      recurrence = "NONE",
      preferredTime = null,
      withBottles = true, // Original parameter
    } = req.body;

    const tenantId = req.derivedTenantId;
    const customerId = req.user.id; // Customer khud hai
    const userRole = req.user.role;

    // ✅ Only customers can use this API
    if (userRole !== "customer") {
      return res
        .status(403)
        .json({ error: "Only customers can create orders through this API" });
    }

    // ✅ Basic validation (EXACTLY LIKE ADMIN)
    if (!items?.length || !deliveryDate) {
      return res.status(400).json({
        error: "items and deliveryDate are required",
      });
    }
    if (acceptableDepositAmount < 0) {
      return res.status(400).json({ error: "Deposit cannot be negative" });
    }

    // ✅ Fetch customer with zone (EXACTLY LIKE ADMIN)
    const customer = await prisma.customer.findUnique({
      where: { id: customerId, tenantId },
      include: { zone: true },
    });
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    if (!customer.zoneId)
      return res.status(400).json({ error: "Customer has no zone assigned" });

    // ✅ Process items first to determine product types (EXACTLY LIKE ADMIN)
    const products = [];
    let hasReusableProduct = false;
    let hasNonReusableProduct = false;
    let nonReusableProductNames = [];

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId, tenantId },
      });
      if (!product || product.status !== "active") {
        return res
          .status(400)
          .json({ error: `Product not available: ${item.productId}` });
      }

      products.push({
        ...product,
        quantity: parseInt(item.quantity) || 1,
      });

      if (product.isReusable) {
        hasReusableProduct = true;
      } else {
        hasNonReusableProduct = true;
        nonReusableProductNames.push(product.name);
      }
    }

    // ✅ EFFECTIVE WITHBOTTLES LOGIC (EXACTLY LIKE ADMIN)
    let effectiveWithBottles = withBottles;

    // WITHBOTTLES VALIDATION - ONLY FOR REUSABLE PRODUCTS
    if (hasReusableProduct) {
      if (effectiveWithBottles === false || effectiveWithBottles === "false") {
        const hasPreviousReusableOrders = await prisma.order.findFirst({
          where: {
            customerId: customerId,
            tenantId,
            items: {
              some: {
                product: {
                  isReusable: true,
                },
              },
            },
            status: { in: ["completed", "delivered"] },
          },
        });

        if (!hasPreviousReusableOrders) {
          return res.status(400).json({
            error:
              "You must have received bottles before to order without bottles",
            solution: "Set withBottles to true for first-time bottle delivery",
          });
        }
      }
    } else {
      // Agar sirf non-reusable products hain, to withBottles always true
      effectiveWithBottles = true;
    }

    // ✅ RECURRING ORDER REQUIREMENTS (EXACTLY LIKE ADMIN)
    if (isRecurring) {
      // 1. Must have at least one reusable product
      if (!hasReusableProduct) {
        return res.status(400).json({
          error: "Recurring orders must include at least one reusable product",
        });
      }

      // 2. Must NOT have any non-reusable products
      if (hasNonReusableProduct) {
        return res.status(400).json({
          error: "Recurring orders can only contain reusable products.",
          nonReusableItems: nonReusableProductNames,
          solution:
            "Please remove non-reusable items or create as one-time order.",
        });
      }

      // 3. Validate recurrence type
      const validRecurrences = ["WEEKLY", "BI_WEEKLY", "MONTHLY"];
      if (!validRecurrences.includes(recurrence)) {
        return res.status(400).json({
          error: `Invalid recurrence. Must be one of: ${validRecurrences.join(
            ", "
          )}`,
        });
      }

      // 4. Validate recurrence is provided
      if (recurrence === "NONE") {
        return res.status(400).json({
          error:
            "Recurrence is required for recurring orders (WEEKLY, BI_WEEKLY, MONTHLY)",
        });
      }
    }

    // ✅ Check bottle inventory for withBottles true - ONLY FOR REUSABLE PRODUCTS (EXACTLY LIKE ADMIN)
    if (
      hasReusableProduct &&
      (effectiveWithBottles === true || effectiveWithBottles === "true")
    ) {
      const bottleInventory = await prisma.bottleInventory.findUnique({
        where: { tenantId },
      });

      for (const productData of products) {
        const product = productData;
        const quantity = productData.quantity;

        if (product.isReusable) {
          if (bottleInventory && bottleInventory.inStock < quantity) {
            return res.status(400).json({
              error: `Not enough bottles in stock for ${product.name}. Available: ${bottleInventory.inStock}, Required: ${quantity}`,
            });
          }
        }
      }
    }

    // ✅ PROCESS ITEMS FOR CALCULATIONS (EXACTLY LIKE ADMIN)
    let totalProductPrice = 0;
    let totalRequiredDeposit = 0;
    const orderItems = [];
    let totalReusableDelivered = 0;
    let circulatingReusableDelivered = 0;
    let expectedEmpties = 0;

    for (const productData of products) {
      const product = productData;
      const quantity = productData.quantity;

      // Stock check
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

      // DEPOSIT CALCULATION BASED ON WITHBOTTLES
      if (
        product.isReusable &&
        (effectiveWithBottles === true || effectiveWithBottles === "true")
      ) {
        totalRequiredDeposit += quantity * product.depositAmount;
      }

      orderItems.push({
        productId: product.id,
        quantity,
        unitPrice: product.price,
        depositAmount:
          product.isReusable &&
          (effectiveWithBottles === true || effectiveWithBottles === "true")
            ? product.depositAmount
            : 0,
        totalPrice: itemTotal,
      });

      // BOTTLE TRACKING BASED ON WITHBOTTLES
      if (product.isReusable) {
        if (effectiveWithBottles === true || effectiveWithBottles === "true") {
          totalReusableDelivered += quantity;
          if (product.requiresEmptyReturn) {
            circulatingReusableDelivered += quantity;
            expectedEmpties += quantity;
          }
        }
      }
    }

    // ✅ Deposit validation (EXACTLY LIKE ADMIN)
    if (
      hasReusableProduct &&
      (effectiveWithBottles === false || effectiveWithBottles === "false") &&
      acceptableDepositAmount > 0
    ) {
      return res.status(400).json({
        error: "Cannot accept deposit when withBottles is false",
      });
    }

    if (acceptableDepositAmount > totalRequiredDeposit) {
      return res.status(400).json({
        error: `Acceptable deposit cannot exceed required deposit (${totalRequiredDeposit})`,
      });
    }

    const totalAmount = totalProductPrice + acceptableDepositAmount;

    // ✅ ORDER NUMBER (EXACTLY LIKE ADMIN)
    const orderCount = await prisma.order.count({ where: { tenantId } });
    const orderNumberDisplay = `#${1000 + orderCount + 1}`;

    // ✅ CALCULATE NEXT RECURRING DATE (EXACTLY LIKE ADMIN)
    let nextRecurringDate = null;
    if (isRecurring) {
      const deliveryDateObj = new Date(deliveryDate);
      nextRecurringDate = new Date(deliveryDateObj);

      switch (recurrence) {
        case "WEEKLY":
          nextRecurringDate.setDate(deliveryDateObj.getDate() + 7);
          break;
        case "BI_WEEKLY":
          nextRecurringDate.setDate(deliveryDateObj.getDate() + 14);
          break;
        case "MONTHLY":
          nextRecurringDate.setMonth(deliveryDateObj.getMonth() + 1);
          break;
      }
    }

    // ✅ MAIN TRANSACTION (EXACTLY LIKE ADMIN)
    const result = await prisma.$transaction(
      async (tx) => {
        // 1. Create Order
        const newOrder = await tx.order.create({
          data: {
            orderNumberDisplay,
            customerId,
            zoneId: customer.zoneId,
            deliveryDate: new Date(deliveryDate),
            deliveryAddress: customer.address,
            totalAmount,
            acceptableDepositAmount,
            paymentMethod,
            status: "pending", // Customer orders always start as pending
            tenantId,
            createdById: null, // Customer self-order
            isRecurring,
            recurrence: isRecurring ? recurrence : "NONE",
            nextRecurringDate,
            withBottles: hasReusableProduct
              ? effectiveWithBottles === true || effectiveWithBottles === "true"
              : true,
            items: { create: orderItems },
          },
        });

        // 2. Update Customer Security Deposit
        if (acceptableDepositAmount > 0) {
          await tx.customer.update({
            where: { id: customerId },
            data: { securityDeposit: { increment: acceptableDepositAmount } },
          });
        }

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

        // 4. Global Bottle Pool Update
        if (
          hasReusableProduct &&
          totalReusableDelivered > 0 &&
          (effectiveWithBottles === true || effectiveWithBottles === "true")
        ) {
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
        if (
          hasReusableProduct &&
          circulatingReusableDelivered > 0 &&
          (effectiveWithBottles === true || effectiveWithBottles === "true")
        ) {
          await tx.customer.update({
            where: { id: customerId },
            data: {
              empties: { increment: expectedEmpties },
              bottlesGiven: { increment: circulatingReusableDelivered },
            },
          });
        }

        // 6. CREATE SUBSCRIPTION IF RECURRING
        let subscription = null;
        if (
          isRecurring &&
          hasReusableProduct &&
          (effectiveWithBottles === true || effectiveWithBottles === "true")
        ) {
          // For each reusable product, create a subscription
          for (const orderItem of orderItems) {
            const product = await tx.product.findUnique({
              where: { id: orderItem.productId },
            });

            if (product.isReusable) {
              subscription = await tx.subscription.create({
                data: {
                  customerId,
                  tenantId,
                  productId: product.id,
                  quantity: orderItem.quantity,
                  recurrence,
                  deliveryDayOfWeek: new Date(deliveryDate).getDay(),
                  nextDeliveryDate: nextRecurringDate,
                  preferredTime,
                  status: "ACTIVE",
                },
              });

              // Link subscription to order
              await tx.order.update({
                where: { id: newOrder.id },
                data: { subscriptionId: subscription.id },
              });

              break;
            }
          }
        }

        // FINAL FETCH WITH ALL DETAILS
        const finalOrder = await tx.order.findUnique({
          where: { id: newOrder.id },
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
                address: true,
              },
            },
            zone: { select: { id: true, name: true } },
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    size: true,
                    price: true,
                    depositAmount: true,
                    isReusable: true,
                    requiresEmptyReturn: true,
                  },
                },
              },
            },
            subscription: isRecurring
              ? {
                  select: {
                    id: true,
                    recurrence: true,
                    nextDeliveryDate: true,
                    status: true,
                  },
                }
              : false,
          },
        });

        return {
          order: finalOrder,
          subscription: subscription,
        };
      },
      { timeout: 20000 }
    );

    // ✅ RESPONSE (EXACTLY LIKE ADMIN)
    res.status(201).json({
      success: true,
      message: isRecurring
        ? `Recurring order created successfully! ${
            hasReusableProduct
              ? effectiveWithBottles === true || effectiveWithBottles === "true"
                ? "With bottles"
                : "Refill only"
              : ""
          }.`
        : `Order created successfully! ${
            hasReusableProduct
              ? effectiveWithBottles === true || effectiveWithBottles === "true"
                ? "With bottles"
                : "Refill only"
              : ""
          }.`,
      order: {
        ...result.order,
        isRecurring,
        recurrence: isRecurring ? recurrence : "NONE",
        nextRecurringDate: result.order.nextRecurringDate,
        withBottles: hasReusableProduct
          ? effectiveWithBottles === true || effectiveWithBottles === "true"
          : true,
      },
      subscription: result.subscription,
      details: {
        withBottles: hasReusableProduct
          ? effectiveWithBottles === true || effectiveWithBottles === "true"
          : true,
        hasReusableProduct,
        hasNonReusableProduct,
        totalRequiredDeposit,
        acceptableDepositAmount,
        reusableBottlesDelivered: totalReusableDelivered,
        expectedEmpties,
        initialStatus: "pending",
        isCustomerOrder: true,
        nextDelivery: isRecurring ? nextRecurringDate : null,
      },
    });
  } catch (err) {
    console.error("Create Customer Order Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to create order",
      details: err.message,
    });
  }
};

// GET CUSTOMER'S PAYMENT HISTORY
exports.getCustomerPayments = async (req, res) => {
  try {
    const customerId = req.user.id;
    const tenantId = req.derivedTenantId;
    const { type, status, month, year } = req.query;

    const where = {
      customerId,
      tenantId,
    };

    if (type) where.collectionType = type;
    if (status) where.status = status;
    if (month) where.month = parseInt(month);
    if (year) where.year = parseInt(year);

    const payments = await prisma.payment.findMany({
      where,
      include: {
        order: {
          select: {
            orderNumberDisplay: true,
            deliveryDate: true,
          },
        },
        subscription: {
          select: {
            recurrence: true,
            product: {
              select: {
                name: true,
              },
            },
          },
        },
        collectedByDriver: {
          select: {
            name: true,
            phone: true,
          },
        },
        paymentItems: {
          select: {
            productName: true,
            quantity: true,
            totalAmount: true,
          },
        },
      },
      orderBy: { dueDate: "desc" },
    });

    // Calculate summary
    const summary = payments.reduce(
      (acc, payment) => {
        acc.totalAmount += payment.amount;
        acc.totalPaid += payment.paidAmount;
        acc.totalPending += payment.pendingAmount;
        return acc;
      },
      { totalAmount: 0, totalPaid: 0, totalPending: 0 }
    );

    res.json({
      success: true,
      payments,
      summary,
    });
  } catch (err) {
    console.error("Get Customer Payments Error:", err);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
};

// CUSTOMER KE LIYE SIRF USKE ORDERS DIKHAYE
exports.getCustomerOrders = async (req, res) => {
  try {
    const tenantId = req.derivedTenantId;
    const customerId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // SIRF current customer ke orders
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: {
          tenantId,
          customerId,
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
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
                  id: true,
                  name: true,
                  size: true,
                  price: true,
                  isReusable: true,
                  depositAmount: true,
                },
              },
            },
          },
          subscription: {
            select: {
              id: true,
              recurrence: true,
              nextDeliveryDate: true,
              status: true,
            },
          },
        },
      }),
      prisma.order.count({
        where: {
          tenantId,
          customerId,
        },
      }),
    ]);

    // Add withBottles information to each order
    const ordersWithDetails = orders.map((order) => ({
      ...order,
      showBottlesInfo: order.items.some((item) => item.product.isReusable),
      totalDeposit: order.items.reduce((sum, item) => {
        if (item.product.isReusable) {
          return sum + item.depositAmount * item.quantity;
        }
        return sum;
      }, 0),
    }));

    res.json({
      success: true,
      orders: ordersWithDetails,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Get Customer Orders Error:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
};

// GET CUSTOMER'S AVAILABLE BOTTLES COUNT
exports.getCustomerBottlesInfo = async (req, res) => {
  try {
    const tenantId = req.derivedTenantId;
    const customerId = req.user.id;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId, tenantId },
      select: {
        empties: true,
        bottlesGiven: true,
        securityDeposit: true,
      },
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json({
      success: true,
      bottlesInfo: {
        emptiesAvailable: customer.empties,
        totalBottlesGiven: customer.bottlesGiven,
        securityDeposit: customer.securityDeposit,
        canOrderWithoutBottles: customer.empties > 0,
        message:
          customer.empties > 0
            ? `You have ${customer.empties} empty bottles available for refill`
            : "You need bottles for first order. Set withBottles=true",
      },
    });
  } catch (err) {
    console.error("Get Customer Bottles Info Error:", err);
    res.status(500).json({ error: "Failed to fetch bottles info" });
  }
};
