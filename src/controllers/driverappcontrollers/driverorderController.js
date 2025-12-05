const prisma = require("../../prisma/client");
const { sendOTP, verifyOTP } = require("../../utils/otpService");
const jwt = require("jsonwebtoken");

// ✅ NEW: DRIVER KE COMPLETED ORDERS HISTORY (Sirf completed dikhao)
exports.getMyCompletedOrders = async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ error: "Only drivers can access this" });
    }

    const driverId = req.user.id;
    const tenantId = req.derivedTenantId;

    const orders = await prisma.order.findMany({
      where: {
        driverId,
        tenantId,
        status: "completed", // ✅ Sirf completed
      },
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
            address: true,
            empties: true,
          },
        },
        zone: { select: { name: true } },
        items: {
          include: {
            product: {
              select: {
                name: true,
                size: true,
                isReusable: true,
                requiresEmptyReturn: true,
              },
            },
          },
        },
        subscription: true, // For recurring info
      },
      orderBy: { deliveryDate: "desc" }, // Latest completed pehle
    });

    // Add expected empties (historical info)
    const ordersWithDetails = orders.map((order) => {
      const reusableItems = order.items.filter(
        (i) => i.product.isReusable && i.product.requiresEmptyReturn
      );
      const expectedEmpties = reusableItems.reduce(
        (sum, i) => sum + i.quantity,
        0
      );

      return {
        ...order,
        expectedEmpties,
        isRecurring: order.isRecurring || false,
        customerEmpties: order.customer.empties,
      };
    });

    res.json({
      message: "Your completed orders history",
      count: ordersWithDetails.length,
      orders: ordersWithDetails,
    });
  } catch (err) {
    console.error("Get My Completed Orders Error:", err);
    res.status(500).json({ error: "Failed to fetch completed orders" });
  }
};

// GET TODAY'S RECURRING ORDERS FOR DRIVER
// ✅ FIXED: Ab "delivered" status bhi include kiya taake driver complete kar sake
exports.getTodayRecurringOrders = async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ error: "Only drivers can access this" });
    }

    const driverId = req.user.id;
    const tenantId = req.derivedTenantId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get driver's zone
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { zoneId: true },
    });

    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    // Get today's recurring orders in driver's zone (including delivered for completion)
    const recurringOrders = await prisma.order.findMany({
      where: {
        tenantId,
        zoneId: driver.zoneId,
        deliveryDate: {
          gte: today,
          lt: tomorrow,
        },
        status: {
          in: ["pending", "in_progress", "delivered"], // ✅ Added "delivered"
        },
        isRecurring: true,
        subscriptionId: { not: null },
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
            empties: true,
          },
        },
        subscription: {
          include: {
            product: {
              select: {
                name: true,
                size: true,
              },
            },
          },
        },
        items: {
          include: {
            product: {
              select: {
                name: true,
                size: true,
                isReusable: true,
                requiresEmptyReturn: true, // ✅ Added for expected empties calc
              },
            },
          },
        },
      },
      orderBy: [
        { subscription: { preferredTime: "asc" } },
        { deliveryDate: "asc" },
      ],
    });

    // Format for driver app + expected empties add kiya
    const formatted = recurringOrders.map((order) => {
      const reusableItems = order.items.filter(
        (i) => i.product.isReusable && i.product.requiresEmptyReturn
      );
      const expectedEmpties = reusableItems.reduce(
        (sum, i) => sum + i.quantity,
        0
      );

      return {
        id: order.id,
        orderNumber: order.orderNumberDisplay,
        customer: {
          id: order.customer.id,
          name: order.customer.name,
          phone: order.customer.phone,
          address: order.customer.address,
          empties: order.customer.empties, // Available empties
        },
        subscription: order.subscription
          ? {
              id: order.subscription.id,
              recurrence: order.subscription.recurrence,
              preferredTime: order.subscription.preferredTime,
              totalDeliveries: order.subscription.totalDeliveries,
            }
          : null,
        items: order.items.map((item) => ({
          product: item.product.name,
          size: item.product.size,
          quantity: item.quantity,
          isReusable: item.product.isReusable,
        })),
        status: order.status,
        deliveryDate: order.deliveryDate,
        isRecurring: true,
        expectedEmpties, // ✅ Added: Kitne empties expect karne hain
        note:
          order.status === "delivered"
            ? "🔄 Delivered - Collect Empties Now!"
            : "🔁 Recurring Delivery Pending",
      };
    });

    res.json({
      success: true,
      message: `You have ${formatted.length} recurring tasks today (including empties collection)`,
      today: today.toISOString().split("T")[0],
      orders: formatted,
      stats: {
        total: formatted.length,
        pending: formatted.filter((o) => o.status === "pending").length,
        inProgress: formatted.filter((o) => o.status === "in_progress").length,
        delivered: formatted.filter((o) => o.status === "delivered").length, // ✅ Added stat
      },
    });
  } catch (err) {
    console.error("Get Today Recurring Orders Error:", err);
    res.status(500).json({ error: "Failed to fetch recurring orders" });
  }
};

// COMPLETE ORDER WITH EMPTIES
exports.completeOrderWithEmpties = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      collectedEmpties,
      damagedEmpties = 0,
      leakedEmpties = 0,
    } = req.body;

    const tenantId = req.derivedTenantId;
    const driverId = req.user.id;

    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID not found in request" });
    }

    // === VALIDATION ===
    if (collectedEmpties === undefined || collectedEmpties < 0) {
      return res
        .status(400)
        .json({ error: "collectedEmpties required and must be >= 0" });
    }
    if (damagedEmpties < 0 || leakedEmpties < 0) {
      return res
        .status(400)
        .json({ error: "damagedEmpties and leakedEmpties cannot be negative" });
    }

    // Validate: damaged + leaked cannot exceed collected
    if (damagedEmpties + leakedEmpties > collectedEmpties) {
      return res.status(400).json({
        error: "Damaged + leaked empties cannot exceed total collected empties",
      });
    }

    const order = await prisma.order.findFirst({
      where: {
        id,
        driverId,
        tenantId,
      },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, isReusable: true, requiresEmptyReturn: true },
            },
          },
        },
        customer: true,
        subscription: true,
      },
    });

    if (!order) {
      return res
        .status(404)
        .json({ error: "Order not found or not assigned to you" });
    }

    if (order.status !== "delivered") {
      return res
        .status(400)
        .json({ error: "Order must be marked as delivered first" });
    }

    // === CALCULATE EXPECTED EMPTIES BASED ON WITHBOTTLES ===
    const reusableItems = order.items.filter(
      (i) => i.product.isReusable && i.product.requiresEmptyReturn
    );

    let expectedEmpties = 0;

    if (order.withBottles === false) {
      // Agar withBottles = false hai to customer se UTHAYE GAYE bottles collect karna hai
      // Expected empties = order ki total reusable quantity
      expectedEmpties = reusableItems.reduce((sum, i) => sum + i.quantity, 0);
    } else {
      // Agar withBottles = true hai to customer se USKE PAAS JO EMPTIES HAIN collect karna hai
      // Expected empties = customer ke paas jo empties hain (can be more or less)
      // Driver ko report karna hai kitne collect kiye
      expectedEmpties = order.customer.empties;
    }

    // Agar withBottles = false hai to validate karo ke exact empties collect kiye
    if (order.withBottles === false) {
      const totalExpectedFromOrder = reusableItems.reduce(
        (sum, i) => sum + i.quantity,
        0
      );

      if (collectedEmpties !== totalExpectedFromOrder) {
        return res.status(400).json({
          error: `WithBottles=false order requires exactly ${totalExpectedFromOrder} empties. You collected ${collectedEmpties}`,
        });
      }
    }

    // Customer ke paas enough empties hone chahiye
    if (order.customer.empties < collectedEmpties) {
      return res.status(400).json({
        error: `Customer has only ${order.customer.empties} empties. Cannot collect ${collectedEmpties}`,
      });
    }

    const goodReturned = collectedEmpties - damagedEmpties - leakedEmpties;
    if (goodReturned < 0) {
      return res
        .status(400)
        .json({ error: "Invalid counts: good returned cannot be negative" });
    }

    // Calculate lost empties (only for withBottles = false)
    let lostEmpties = 0;
    if (order.withBottles === false) {
      const totalExpected = reusableItems.reduce(
        (sum, i) => sum + i.quantity,
        0
      );
      lostEmpties = Math.max(0, totalExpected - collectedEmpties);
    }

    await prisma.$transaction(
      async (tx) => {
        // 1. Update customer empties
        await tx.customer.update({
          where: { id: order.customerId },
          data: { empties: { decrement: collectedEmpties } },
        });

        // 2. Update global bottle pool
        // NOTE: withBottles = false ke liye bhi update karna hai kyunki empties wapas aa rahe hain
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

        // 3. Return stock to products (proportional, sirf good returned)
        if (goodReturned > 0 && reusableItems.length > 0) {
          const totalReusableQuantity = reusableItems.reduce(
            (sum, i) => sum + i.quantity,
            0
          );

          for (const item of reusableItems) {
            const proportion = item.quantity / totalReusableQuantity;
            const returnQty = Math.round(goodReturned * proportion);

            if (returnQty > 0) {
              await tx.productInventory.update({
                where: {
                  productId_tenantId: {
                    productId: item.product.id,
                    tenantId,
                  },
                },
                data: { currentStock: { increment: returnQty } },
              });
            }
          }
        }

        // 4. Update order status to completed
        await tx.order.update({
          where: { id },
          data: { status: "completed" },
        });

        // 5. RECURRING KE LIYE NEXT DATE UPDATE (if applicable)
        if (order.isRecurring && order.subscriptionId) {
          const currentDate = new Date(order.deliveryDate);
          let nextDeliveryDate = new Date(currentDate);

          switch (order.subscription.recurrence) {
            case "WEEKLY":
              nextDeliveryDate.setDate(currentDate.getDate() + 7);
              break;
            case "BI_WEEKLY":
              nextDeliveryDate.setDate(currentDate.getDate() + 14);
              break;
            case "MONTHLY":
              nextDeliveryDate.setMonth(currentDate.getMonth() + 1);
              break;
            default:
              nextDeliveryDate = null;
              break;
          }

          // Update subscription next date
          await tx.subscription.update({
            where: { id: order.subscriptionId },
            data: {
              nextDeliveryDate:
                nextDeliveryDate || order.subscription.nextDeliveryDate,
              totalDeliveries: { increment: 1 },
              status: "ACTIVE",
            },
          });

          // Update order's nextRecurringDate
          await tx.order.update({
            where: { id },
            data: {
              nextRecurringDate: nextDeliveryDate || order.nextRecurringDate,
            },
          });
        }
      },
      { timeout: 15000 }
    );

    // REFETCH updated nextDeliveryDate
    let updatedNextDelivery = null;
    if (order.isRecurring && order.subscriptionId) {
      const updatedSubscription = await prisma.subscription.findUnique({
        where: { id: order.subscriptionId },
        select: { nextDeliveryDate: true },
      });
      updatedNextDelivery = updatedSubscription?.nextDeliveryDate;
    }

    res.json({
      success: true,
      message: "Order completed with empties collection! ✅",
      withBottles: order.withBottles,
      expectedEmpties: expectedEmpties,
      collected: collectedEmpties,
      goodReturned,
      damaged: damagedEmpties,
      leaked: leakedEmpties,
      lost: lostEmpties,
      nextDelivery: updatedNextDelivery,
    });
  } catch (err) {
    console.error("Complete Order Error:", err);
    res.status(500).json({
      error: "Failed to complete order",
      details: err.message,
    });
  }
};
// ✅ NEW: GET TODAY'S ALL ORDERS FOR DRIVER (All statuses including completed)
exports.getTodayAllOrders = async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ error: "Only drivers can access this" });
    }

    const driverId = req.user.id;
    const tenantId = req.derivedTenantId;

    // Today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get driver's zone
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { zoneId: true },
    });

    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    // Get all today's orders for this driver (ALL statuses)
    const orders = await prisma.order.findMany({
      where: {
        driverId,
        tenantId,
        deliveryDate: {
          gte: today,
          lt: tomorrow,
        },
        // ✅ ALL statuses included
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
            empties: true,
          },
        },
        zone: { select: { name: true } },
        items: {
          include: {
            product: {
              select: {
                name: true,
                size: true,
                isReusable: true,
                requiresEmptyReturn: true,
              },
            },
          },
        },
        subscription: true,
      },
      orderBy: [
        { status: "asc" }, // Pending pehle
        { deliveryDate: "asc" },
        { createdAt: "desc" },
      ],
    });

    // Format with expected empties
    const formattedOrders = orders.map((order) => {
      const reusableItems = order.items.filter(
        (i) => i.product.isReusable && i.product.requiresEmptyReturn
      );
      const expectedEmpties = reusableItems.reduce(
        (sum, i) => sum + i.quantity,
        0
      );

      // Status-based action note
      let actionNote = "";
      switch (order.status) {
        case "pending":
          actionNote = "📋 Ready for pickup";
          break;
        case "in_progress":
          actionNote = "🚚 Start delivery";
          break;
        case "out_for_delivery":
          actionNote = "📦 On the way to customer";
          break;
        case "delivered":
          actionNote = "✅ Delivered - Collect empties";
          break;
        case "completed":
          actionNote = "🏁 Completed with empties";
          break;
        default:
          actionNote = "ℹ️ Process";
      }

      return {
        id: order.id,
        orderNumber: order.orderNumberDisplay,
        totalAmount: order.totalAmount,
        customer: {
          id: order.customer.id,
          name: order.customer.name,
          phone: order.customer.phone,
          address: order.customer.address,
          empties: order.customer.empties,
        },
        zone: order.zone?.name || "Unzoned",
        items: order.items.map((item) => ({
          product: item.product.name,
          size: item.product.size,
          quantity: item.quantity,
          isReusable: item.product.isReusable,
        })),
        status: order.status,
        deliveryDate: order.deliveryDate,
        isRecurring: order.isRecurring || false,
        subscription: order.subscription
          ? {
              recurrence: order.subscription.recurrence,
              preferredTime: order.subscription.preferredTime,
            }
          : null,
        expectedEmpties,
        customerEmpties: order.customer.empties,
        actionNote,
        createdAt: order.createdAt,
      };
    });

    // Statistics
    const stats = {
      total: formattedOrders.length,
      pending: formattedOrders.filter((o) => o.status === "pending").length,
      inProgress: formattedOrders.filter((o) => o.status === "in_progress")
        .length,
      outForDelivery: formattedOrders.filter(
        (o) => o.status === "out_for_delivery"
      ).length,
      delivered: formattedOrders.filter((o) => o.status === "delivered").length,
      completed: formattedOrders.filter((o) => o.status === "completed").length,
      recurring: formattedOrders.filter((o) => o.isRecurring).length,
      regular: formattedOrders.filter((o) => !o.isRecurring).length,
    };

    res.json({
      success: true,
      message: `Today's orders (${stats.total} total)`,
      date: today.toISOString().split("T")[0],
      stats,
      orders: formattedOrders,
    });
  } catch (err) {
    console.error("Get Today All Orders Error:", err);
    res.status(500).json({ error: "Failed to fetch today's orders" });
  }
};

// DRIVER KO SIRF USKE ASSIGNED ORDERS DIKHAO - Driver app ke liye
exports.getMyAssignedOrders = async (req, res) => {
  try {
    // ✅ Role check – sirf driver hi access kare
    if (req.user.role !== "driver") {
      return res
        .status(403)
        .json({ error: "Only drivers can access their orders" });
    }

    const driverId = req.user.id;
    const tenantId = req.derivedTenantId;

    const orders = await prisma.order.findMany({
      where: {
        driverId,
        tenantId,
        status: {
          in: ["pending", "in_progress", "out_for_delivery", "delivered"], // ✅ Completed exclude kiya, kyunki alag flow
        },
      },
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
            address: true,
            empties: true, // ✅ Added for empties info
          },
        },
        zone: { select: { name: true } },
        items: {
          include: {
            product: {
              select: {
                name: true,
                size: true,
                isReusable: true,
                requiresEmptyReturn: true,
              },
            },
          },
        },
        subscription: true, // ✅ For recurring info
      },
      orderBy: [
        { status: "asc" },
        { deliveryDate: "asc" },
        { createdAt: "desc" },
      ],
    });

    // Extra info for driver
    const today = new Date().toDateString();
    const stats = {
      totalToday: orders.filter(
        (o) => new Date(o.deliveryDate).toDateString() === today
      ).length,
      pending: orders.filter((o) => o.status === "pending").length,
      inProgress: orders.filter((o) => o.status === "in_progress").length,
      outForDelivery: orders.filter((o) => o.status === "out_for_delivery")
        .length,
      deliveredToday: orders.filter(
        (o) =>
          o.status === "delivered" &&
          new Date(o.deliveryDate).toDateString() === today
      ).length,
    };

    // ✅ Add expected empties to each order
    const ordersWithEmpties = orders.map((order) => {
      const reusableItems = order.items.filter(
        (i) => i.product.isReusable && i.product.requiresEmptyReturn
      );
      const expectedEmpties = reusableItems.reduce(
        (sum, i) => sum + i.quantity,
        0
      );

      return {
        ...order,
        expectedEmpties,
        isRecurring: order.isRecurring || false,
        customerEmpties: order.customer.empties,
      };
    });

    res.json({
      message:
        "Your assigned orders (up to delivered - complete empties separately)",
      stats,
      orders: ordersWithEmpties,
    });
  } catch (err) {
    console.error("Get My Orders Error:", err);
    res.status(500).json({ error: "Failed to fetch your orders" });
  }
};

// MARK ORDER AS OUT FOR DELIVERY - Driver app ke liye
exports.markOutForDelivery = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user.id;
    const tenantId = req.derivedTenantId;

    const order = await prisma.order.findFirst({
      where: {
        id,
        driverId,
        tenantId,
      },
    });

    if (!order) {
      return res
        .status(404)
        .json({ error: "Order not found or not assigned to you" });
    }

    if (order.status !== "in_progress") {
      return res.status(400).json({
        error: "Only in-progress orders can be marked as out for delivery",
      });
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { status: "out_for_delivery" },
      include: {
        customer: { select: { name: true, phone: true } },
      },
    });

    res.json({
      message: "Order marked as out for delivery",
      order: updatedOrder,
    });
  } catch (err) {
    console.error("Mark out for delivery error:", err);
    res.status(500).json({ error: "Failed to update order status" });
  }
};

// MARK ORDER AS DELIVERED (PAANI DIYA) - Driver app ke liye
// ✅ FIXED: Response mein expected empties add kiya reminder ke liye
exports.markAsDelivered = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user.id;
    const tenantId = req.derivedTenantId;

    const order = await prisma.order.findFirst({
      where: {
        id,
        driverId,
        tenantId,
      },
      include: {
        items: {
          include: {
            product: {
              select: { isReusable: true, requiresEmptyReturn: true },
            },
          },
        },
        customer: {
          select: {
            name: true,
            phone: true,
            empties: true, // ✅ Added for info
          },
        },
      },
    });

    if (!order) {
      return res
        .status(404)
        .json({ error: "Order not found or not assigned to you" });
    }

    if (!["in_progress", "out_for_delivery"].includes(order.status)) {
      return res.status(400).json({
        error:
          "Only in-progress or out-for-delivery orders can be marked as delivered",
      });
    }

    // Calculate expected empties for reminder
    const reusableItems = order.items.filter(
      (i) => i.product.isReusable && i.product.requiresEmptyReturn
    );
    const totalExpectedEmpties = reusableItems.reduce(
      (sum, i) => sum + i.quantity,
      0
    );

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { status: "delivered" },
      include: {
        customer: { select: { name: true, phone: true } },
        items: {
          include: {
            product: { select: { name: true, isReusable: true } },
          },
        },
        subscription: true, // ✅ For recurring
      },
    });

    // Update driver stats
    await prisma.driver.update({
      where: { id: driverId },
      data: {
        totalDeliveries: { increment: 1 },
        todayDeliveries: { increment: 1 },
      },
    });

    res.json({
      message: `Order delivered! Expected empties to collect: ${totalExpectedEmpties} (Customer has ${order.customer.empties} available). Complete with empties next.`,
      order: updatedOrder,
      expectedEmpties: totalExpectedEmpties,
      customerEmpties: order.customer.empties,
      nextAction: updatedOrder.isRecurring
        ? "Collect empties & schedule next recurring"
        : "Collect empties",
    });
  } catch (err) {
    console.error("Mark delivered error:", err);
    res.status(500).json({ error: "Failed to mark order as delivered" });
  }
};

// SEND OTP (Public) - Driver login ke liye
exports.sendDriverOTP = async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone required" });

  const driver = await prisma.driver.findFirst({ where: { phone } });
  if (!driver || driver.status !== "active") {
    return res.status(403).json({ error: "Driver not active" });
  }

  await sendOTP(phone);
  res.json({ message: "OTP sent to driver" });
};

// VERIFY OTP & LOGIN (Public) - Driver login ke liye
exports.verifyDriverOTP = async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp)
    return res.status(400).json({ error: "Phone & OTP required" });

  if (!(await verifyOTP(phone, otp))) {
    return res.status(400).json({ error: "Invalid OTP" });
  }

  const driver = await prisma.driver.findFirst({ where: { phone } });
  if (!driver || driver.status !== "active") {
    return res.status(403).json({ error: "Driver not active" });
  }

  const token = jwt.sign(
    { id: driver.id, role: "driver", tenantId: driver.tenantId },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    message: "Driver login successful",
    token,
    driver: {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      zoneId: driver.zoneId,
    },
  });
};
