const prisma = require("../../prisma/client");
const { sendOTP, verifyOTP } = require("../../utils/otpService");
const jwt = require("jsonwebtoken");
// const notifyOrderStatusChange = require("../../utils/notificationService");
const { notifyOrderStatusChange } = require("../../utils/notificationService");
const notificationService = require("../../utils/notificationService");
// ✅ NEW: DRIVER KE COMPLETED ORDERS HISTORY WITH PAGINATION
exports.getMyCompletedOrders = async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ error: "Only drivers can access this" });
    }

    const driverId = req.user.id;
    const tenantId = req.derivedTenantId;

    // ✅ PAGINATION PARAMETERS
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    // ✅ TOTAL COUNT FOR PAGINATION
    const totalOrders = await prisma.order.count({
      where: {
        driverId,
        tenantId,
        status: "completed",
      },
    });

    const orders = await prisma.order.findMany({
      where: {
        driverId,
        tenantId,
        status: "completed",
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
        subscription: true,
      },
      orderBy: { deliveryDate: "desc" },
      skip, // ✅ PAGINATION SKIP
      take: limit, // ✅ PAGINATION LIMIT
    });

    const ordersWithDetails = orders.map((order) => {
      const reusableItems = order.items.filter(
        (i) => i.product.isReusable && i.product.requiresEmptyReturn
      );

      // ✅ FIXED: Simple calculation for completed orders
      const expectedEmpties =
        order.withBottles === false
          ? reusableItems.reduce((sum, i) => sum + i.quantity, 0)
          : 0;

      return {
        ...order,
        expectedEmpties,
        isRecurring: order.isRecurring || false,
        customerEmpties: order.customer.empties,
      };
    });

    res.json({
      success: true,
      message: "Your completed orders history",
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalOrders / limit),
        totalItems: totalOrders,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil(totalOrders / limit),
        hasPreviousPage: page > 1,
      },
      count: ordersWithDetails.length,
      orders: ordersWithDetails,
    });
  } catch (err) {
    console.error("Get My Completed Orders Error:", err);
    res.status(500).json({ error: "Failed to fetch completed orders" });
  }
};

// GET TODAY'S RECURRING ORDERS FOR DRIVER WITH PAGINATION
// exports.getTodayRecurringOrders = async (req, res) => {
//   try {
//     if (req.user.role !== "driver") {
//       return res.status(403).json({ error: "Only drivers can access this" });
//     }

//     const driverId = req.user.id;
//     const tenantId = req.derivedTenantId;
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);

//     const tomorrow = new Date(today);
//     tomorrow.setDate(tomorrow.getDate() + 1);

//     // ✅ PAGINATION PARAMETERS
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 10;
//     const skip = (page - 1) * limit;

//     const driver = await prisma.driver.findUnique({
//       where: { id: driverId },
//       select: { zoneId: true },
//     });

//     if (!driver) {
//       return res.status(404).json({ error: "Driver not found" });
//     }

//     // ✅ TOTAL COUNT FOR PAGINATION
//     const totalOrders = await prisma.order.count({
//       where: {
//         tenantId,
//         zoneId: driver.zoneId,
//         deliveryDate: {
//           gte: today,
//           lt: tomorrow,
//         },
//         status: {
//           in: ["pending", "in_progress", "delivered"],
//         },
//         isRecurring: true,
//         subscriptionId: { not: null },
//       },
//     });

//     const recurringOrders = await prisma.order.findMany({
//       where: {
//         tenantId,
//         zoneId: driver.zoneId,
//         deliveryDate: {
//           gte: today,
//           lt: tomorrow,
//         },
//         status: {
//           in: ["pending", "in_progress", "delivered"],
//         },
//         isRecurring: true,
//         subscriptionId: { not: null },
//       },
//       include: {
//         customer: {
//           select: {
//             id: true,
//             name: true,
//             phone: true,
//             address: true,
//             empties: true,
//           },
//         },
//         zone: { select: { name: true, id: true } },
//         subscription: {
//           include: {
//             product: {
//               select: {
//                 name: true,
//                 size: true,
//               },
//             },
//           },
//         },
//         items: {
//           include: {
//             product: {
//               select: {
//                 name: true,
//                 size: true,
//                 isReusable: true,
//                 requiresEmptyReturn: true,
//               },
//             },
//           },
//         },
//       },
//       orderBy: [
//         { subscription: { preferredTime: "asc" } },
//         { deliveryDate: "asc" },
//       ],
//       skip, // ✅ PAGINATION SKIP
//       take: limit, // ✅ PAGINATION LIMIT
//     });

//     // ✅ CORRECT LOGIC NOW:
//     const formatted = recurringOrders.map((order) => {
//       const reusableItems = order.items.filter(
//         (i) => i.product.isReusable && i.product.requiresEmptyReturn
//       );

//       let expectedEmpties = 0;

//       if (order.withBottles === false) {
//         // Refill order - collect empties from previous delivery
//         expectedEmpties = reusableItems.reduce((sum, i) => sum + i.quantity, 0);
//       } else {
//         // First time with bottles - NO empties expected
//         expectedEmpties = 0;
//       }

//       return {
//         id: order.id,
//         orderNumber: order.orderNumberDisplay,
//         totalAmount: order.totalAmount,
//         withBottles: order.withBottles,
//         customer: {
//           id: order.customer.id,
//           name: order.customer.name,
//           phone: order.customer.phone,
//           address: order.customer.address,
//           empties: order.customer.empties,
//         },
//         zone: {
//           id: order.zone.id,
//           name: order.zone.name,
//         },
//         subscription: order.subscription
//           ? {
//             id: order.subscription.id,
//             recurrence: order.subscription.recurrence,
//             preferredTime: order.subscription.preferredTime,
//             totalDeliveries: order.subscription.totalDeliveries,
//           }
//           : null,
//         items: order.items.map((item) => ({
//           product: item.product.name,
//           size: item.product.size,
//           quantity: item.quantity,
//           isReusable: item.product.isReusable,
//         })),
//         status: order.status,
//         deliveryDate: order.deliveryDate,
//         isRecurring: true,
//         expectedEmpties, // ✅ Now correct: 0 for first-time, actual for refill
//         note:
//           order.status === "delivered"
//             ? `🔄 Delivered - ${expectedEmpties > 0
//               ? `Collect ${expectedEmpties} empties!`
//               : "First time delivery - no empties expected"
//             }`
//             : `🔁 ${order.withBottles
//               ? "First time with bottles"
//               : `Refill order - ${expectedEmpties} empties to collect`
//             } - Delivery Pending`,
//       };
//     });

//     res.json({
//       success: true,
//       message: `You have ${formatted.length} recurring tasks today`,
//       today: today.toISOString().split("T")[0],
//       pagination: {
//         currentPage: page,
//         totalPages: Math.ceil(totalOrders / limit),
//         totalItems: totalOrders,
//         itemsPerPage: limit,
//         hasNextPage: page < Math.ceil(totalOrders / limit),
//         hasPreviousPage: page > 1,
//       },
//       orders: formatted,
//       stats: {
//         total: formatted.length,
//         pending: formatted.filter((o) => o.status === "pending").length,
//         inProgress: formatted.filter((o) => o.status === "in_progress").length,
//         delivered: formatted.filter((o) => o.status === "delivered").length,
//         withBottles: formatted.filter((o) => o.withBottles).length,
//         refillOrders: formatted.filter((o) => !o.withBottles).length,
//       },
//     });
//   } catch (err) {
//     console.error("Get Today Recurring Orders Error:", err);
//     res.status(500).json({ error: "Failed to fetch recurring orders" });
//   }
// };


// GET TODAY'S RECURRING ORDERS FOR DRIVER WITH PAGINATION
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

    // PAGINATION PARAMETERS
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Driver ka zone check karo (future mein use kar sakte ho agar chaho)
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { zoneId: true },
    });

    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    // TOTAL COUNT FOR PAGINATION - ZONE FILTER HATA DIYA
    const totalOrders = await prisma.order.count({
      where: {
        tenantId,
        // zoneId: driver.zoneId,   ← Yeh comment out / remove kiya
        deliveryDate: {
          gte: today,
          lt: tomorrow,
        },
        status: {
          in: ["pending", "in_progress", "delivered"],
        },
        isRecurring: true,
        subscriptionId: { not: null },
      },
    });

    // FIND MANY - ZONE FILTER HATA DIYA
    const recurringOrders = await prisma.order.findMany({
      where: {
        tenantId,
        // zoneId: driver.zoneId,   ← Yeh bhi hata diya
        deliveryDate: {
          gte: today,
          lt: tomorrow,
        },
        status: {
          in: ["pending", "in_progress", "delivered"],
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
        zone: { select: { name: true, id: true } },
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
                requiresEmptyReturn: true,
              },
            },
          },
        },
      },
      orderBy: [
        { subscription: { preferredTime: "asc" } },
        { deliveryDate: "asc" },
      ],
      skip,
      take: limit,
    });

    // Baqi formatting same rahegi (expectedEmpties, notes waghera)
    const formatted = recurringOrders.map((order) => {
      const reusableItems = order.items.filter(
        (i) => i.product.isReusable && i.product.requiresEmptyReturn
      );

      let expectedEmpties = 0;

      if (order.withBottles === false) {
        expectedEmpties = reusableItems.reduce((sum, i) => sum + i.quantity, 0);
      }

      return {
        id: order.id,
        orderNumber: order.orderNumberDisplay,
        totalAmount: order.totalAmount,
        withBottles: order.withBottles,
        customer: {
          id: order.customer.id,
          name: order.customer.name,
          phone: order.customer.phone,
          address: order.customer.address,
          empties: order.customer.empties,
        },
        zone: order.zone
          ? {
            id: order.zone.id,
            name: order.zone.name,
          }
          : { id: null, name: "Unassigned Zone" },   // ← Helpful message
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
        expectedEmpties,
        note:
          order.status === "delivered"
            ? `🔄 Delivered - ${expectedEmpties > 0
              ? `Collect ${expectedEmpties} empties!`
              : "First time delivery - no empties expected"
            }`
            : `🔁 ${order.withBottles
              ? "First time with bottles"
              : `Refill order - ${expectedEmpties} empties to collect`
            } - Delivery Pending`,
      };
    });

    res.json({
      success: true,
      message: `You have ${formatted.length} recurring tasks today`,
      today: today.toISOString().split("T")[0],
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalOrders / limit),
        totalItems: totalOrders,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil(totalOrders / limit),
        hasPreviousPage: page > 1,
      },
      orders: formatted,
      stats: {
        total: formatted.length,
        pending: formatted.filter((o) => o.status === "pending").length,
        inProgress: formatted.filter((o) => o.status === "in_progress").length,
        delivered: formatted.filter((o) => o.status === "delivered").length,
        withBottles: formatted.filter((o) => o.withBottles).length,
        refillOrders: formatted.filter((o) => !o.withBottles).length,
      },
    });
  } catch (err) {
    console.error("Get Today Recurring Orders Error:", err);
    res.status(500).json({ error: "Failed to fetch recurring orders" });
  }
};
// COMPLETE ORDER WITH EMPTIES - CORRECTED VERSION
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
              select: {
                id: true,
                isReusable: true,
                requiresEmptyReturn: true,
                name: true,
              },
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

    // === CORRECT EXPECTED EMPTIES CALCULATION ===
    const reusableItems = order.items.filter(
      (i) => i.product.isReusable && i.product.requiresEmptyReturn
    );

    let expectedEmpties = 0;

    // ✅ CORRECT LOGIC:
    if (order.withBottles === false) {
      // Refill order - expect empties from previous delivery
      expectedEmpties = reusableItems.reduce((sum, i) => sum + i.quantity, 0);
    } else {
      // First time with bottles - NO empties expected
      expectedEmpties = 0;
    }

    // ✅ CORRECT VALIDATION:
    if (order.withBottles === true && collectedEmpties > 0) {
      // First time order - should not collect any empties
      return res.status(400).json({
        error: "First time order with bottles - no empties should be collected",
        note: "This is first time delivery with bottles. No empties expected.",
      });
    }

    if (order.withBottles === false) {
      // Refill order - must collect exact empties
      const totalExpectedFromOrder = reusableItems.reduce(
        (sum, i) => sum + i.quantity,
        0
      );

      if (collectedEmpties !== totalExpectedFromOrder) {
        return res.status(400).json({
          error: `Refill order requires exactly ${totalExpectedFromOrder} empties. You collected ${collectedEmpties}`,
        });
      }
    }

    const goodReturned = collectedEmpties - damagedEmpties - leakedEmpties;
    if (goodReturned < 0) {
      return res
        .status(400)
        .json({ error: "Invalid counts: good returned cannot be negative" });
    }

    let lostEmpties = 0;
    if (order.withBottles === false && collectedEmpties < expectedEmpties) {
      lostEmpties = expectedEmpties - collectedEmpties;
    }

    await prisma.$transaction(
      async (tx) => {
        // 1. Update customer empties
        if (collectedEmpties > 0) {
          await tx.customer.update({
            where: { id: order.customerId },
            data: { empties: { decrement: collectedEmpties } },
          });
        }

        // 2. Update global bottle pool
        if (collectedEmpties > 0) {
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
        }



        // 3. Return stock to products
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

        // // Calculate total deposit to add (only for first-time / withBottles orders)
        // let depositToAdd = 0;

        // if (order.withBottles === true) {
        //   // First time – customer is taking new bottles → business receives deposit
        //   depositToAdd = order.items.reduce((sum, item) => {
        //     if (item.product.isReusable) {
        //       return sum + (item.quantity * (item.depositAmount || 0));
        //     }
        //     return sum;
        //   }, 0);
        // }

        // Also calculate bottles actually given (usually same as quantity, unless partial delivery – but you don't have partial yet)
        const bottlesGivenThisOrder = order.items.reduce((sum, item) => {
          if (item.product.isReusable) {
            return sum + item.quantity;
          }
          return sum;
        }, 0);

        // // ────────────────────────────────────────────────
        // // Inside the transaction, after validations:
        // await tx.customer.update({
        //   where: { id: order.customerId },
        //   data: {
        //     // Only increment securityDeposit for first-time bottle delivery
        //     ...(depositToAdd > 0 && { securityDeposit: { increment: depositToAdd } }),

        //     // bottlesGiven should increase when customer physically receives new bottles
        //     // (both first-time and refill – but in refill it's usually exchange, so net zero bottles)
        //     // Most systems still increment bottlesGiven on every delivery to track lifetime total
        //     bottlesGiven: { increment: bottlesGivenThisOrder },

        //     // empties already being decremented earlier in your code – that's fine for refill
        //   },
        // });



        // 4. Update order status to completed
        await tx.order.update({
          where: { id },
          data: { status: "completed" },
        });
        // 5. Update next delivery date for recurring
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

          await tx.subscription.update({
            where: { id: order.subscriptionId },
            data: {
              nextDeliveryDate:
                nextDeliveryDate || order.subscription.nextDeliveryDate,
              totalDeliveries: { increment: 1 },
              status: "ACTIVE",
            },
          });

          await tx.order.update({
            where: { id },
            data: {
              nextRecurringDate: nextDeliveryDate || order.nextRecurringDate,
            },
          });
        }

        // 6. Create immediate payment for non-recurring orders
        if (!order.isRecurring && order.paymentMethod === "cash_on_delivery") {
          const paymentItems = order.items.map((item) => ({
            orderId: order.id,
            orderItemId: item.id,
            productName: item.product?.name || "Product",
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            depositAmount: item.depositAmount || 0,
            totalAmount: item.totalPrice || item.unitPrice * item.quantity,
          }));

          const paymentNumber = `PAY-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`;

          const payment = await tx.customerPayment.create({
            data: {
              paymentNumber,
              customerId: order.customerId,
              tenantId,
              orderId: order.id,
              amount: order.totalAmount,
              pendingAmount: order.totalAmount,
              collectionType: "IMMEDIATE",
              dueDate: order.deliveryDate,
              status: "PENDING",
              paymentMethod: "cash_on_delivery",
              collectedByDriverId: driverId,
              paymentItems: {
                create: paymentItems,
              },
            },
          });

          await tx.order.update({
            where: { id },
            data: { paymentId: payment.id },
          });
        }
      },
      { timeout: 15000 }
    );

    // Refetch updated next delivery date
    let updatedNextDelivery = null;
    if (order.isRecurring && order.subscriptionId) {
      const updatedSubscription = await prisma.subscription.findUnique({
        where: { id: order.subscriptionId },
        select: { nextDeliveryDate: true },
      });
      updatedNextDelivery = updatedSubscription?.nextDeliveryDate;
    }

    // Check if payment was created
    const paymentCreated = !order.isRecurring;
    let paymentInfo = null;

    if (paymentCreated) {
      const payment = await prisma.customerPayment.findFirst({
        where: { orderId: id, tenantId },
        select: {
          id: true,
          paymentNumber: true,
          amount: true,
          pendingAmount: true,
        },
      });
      paymentInfo = payment;
    }

    // ────────────────────────────────────────────────────────────────
    // Notify CUSTOMER that the order is now completed
    // ────────────────────────────────────────────────────────────────
    try {
      const statusDetails = {
        orderId: id,
        orderNumber:
          // order.orderNumber ||
          order.orderNumberDisplay ||
          `ORD-${id.slice(0, 8)}`,
        status: "completed",
        driverName: req.user.name || "Driver",
      };

      console.log(
        "[COMPLETE-ORDER] Sending 'completed' notification to customer",
        order.customer?.name || order.customer?.phone || order.customerId || "?"
      );

      const notifyResult = await notificationService.notifyOrderStatusChangeToCustomer(
        order.customerId,
        statusDetails
      );

      console.log("[COMPLETE-ORDER] Customer notification result:", {
        success: notifyResult.success,
        mock: notifyResult.mock || false,
        messageId: notifyResult.messageId || "N/A",
      });
    } catch (notifyErr) {
      console.error("[COMPLETE-ORDER] Customer notification failed:", notifyErr.message);
      // Do not throw — order completion must succeed
    }

    res.json({
      success: true,
      message: order.withBottles
        ? "First time order completed! ✅ (No empties expected)"
        : "Refill order completed with empties collection! ✅",
      orderType: order.withBottles ? "First time with bottles" : "Refill order",
      withBottles: order.withBottles,
      expectedEmpties: expectedEmpties,
      collected: collectedEmpties,
      goodReturned,
      damaged: damagedEmpties,
      leaked: leakedEmpties,
      lost: lostEmpties,
      nextDelivery: updatedNextDelivery,
      paymentCreated,
      paymentInfo,
      paymentMessage: paymentCreated
        ? `Immediate payment created. Amount: Rs${order.totalAmount}. Collect from customer.`
        : "Recurring order - payment will be generated monthly",
    });
  } catch (err) {
    console.error("Complete Order Error:", err.message);
    console.error("Stack:", err.stack);
    res.status(500).json({
      error: "Failed to complete order",
      details: err.message,
    });
  }
};

// ✅ GET TODAY'S ALL ORDERS FOR DRIVER
exports.getTodayAllOrders = async (req, res) => {
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

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { zoneId: true },
    });

    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    const orders = await prisma.order.findMany({
      where: {
        driverId,
        tenantId,
        deliveryDate: {
          gte: today,
          lt: tomorrow,
        },
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
        { status: "asc" },
        { deliveryDate: "asc" },
        { createdAt: "desc" },
      ],
    });

    // ✅ CORRECT LOGIC:
    const formattedOrders = orders.map((order) => {
      const reusableItems = order.items.filter(
        (i) => i.product.isReusable && i.product.requiresEmptyReturn
      );

      let expectedEmpties = 0;

      if (order.withBottles === false) {
        // Refill order
        expectedEmpties = reusableItems.reduce((sum, i) => sum + i.quantity, 0);
      } else {
        // First time order - NO empties
        expectedEmpties = 0;
      }

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
          actionNote =
            expectedEmpties > 0
              ? `✅ Delivered - Collect ${expectedEmpties} empties`
              : "✅ Delivered - First time, no empties";
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
        withBottles: order.withBottles,
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
        expectedEmpties, // ✅ Correct now
        customerEmpties: order.customer.empties,
        actionNote,
        createdAt: order.createdAt,
      };
    });

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

// ✅ DRIVER KO SIRF USKE ASSIGNED ORDERS DIKHAO WITH PAGINATION
exports.getMyAssignedOrders = async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res
        .status(403)
        .json({ error: "Only drivers can access their orders" });
    }

    const driverId = req.user.id;
    const tenantId = req.derivedTenantId;

    // ✅ PAGINATION PARAMETERS
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // ✅ TOTAL COUNT FOR PAGINATION
    const totalOrders = await prisma.order.count({
      where: {
        driverId,
        tenantId,
        status: {
          in: ["pending", "in_progress", "out_for_delivery", "delivered"],
        },
      },
    });

    const orders = await prisma.order.findMany({
      where: {
        driverId,
        tenantId,
        status: {
          in: ["pending", "in_progress", "out_for_delivery", "delivered"],
        },
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
        subscription: true,
      },
      orderBy: [
        { status: "asc" },
        { deliveryDate: "asc" },
        { createdAt: "desc" },
      ],
      skip, // ✅ PAGINATION SKIP
      take: limit, // ✅ PAGINATION LIMIT
    });

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

    // ✅ CORRECT LOGIC:
    const ordersWithEmpties = orders.map((order) => {
      const reusableItems = order.items.filter(
        (i) => i.product.isReusable && i.product.requiresEmptyReturn
      );

      let expectedEmpties = 0;

      if (order.withBottles === false) {
        // Refill order
        expectedEmpties = reusableItems.reduce((sum, i) => sum + i.quantity, 0);
      } else {
        // First time order - NO empties
        expectedEmpties = 0;
      }

      return {
        ...order,
        expectedEmpties, // ✅ Now correct
        isRecurring: order.isRecurring || false,
        customerEmpties: order.customer.empties,
      };
    });

    res.json({
      success: true,
      message:
        "Your assigned orders (up to delivered - complete empties separately)",
      stats,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalOrders / limit),
        totalItems: totalOrders,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil(totalOrders / limit),
        hasPreviousPage: page > 1,
      },
      orders: ordersWithEmpties,
    });
  } catch (err) {
    console.error("Get My Orders Error:", err);
    res.status(500).json({ error: "Failed to fetch your orders" });
  }
};

// ✅ DRIVER KO SIRF USKE ASSIGNED REGULAR (NON-RECURRING) ORDERS DIKHAO WITH PAGINATION
// exports.getMyAssignedOrders = async (req, res) => {
//   try {
//     if (req.user.role !== "driver") {
//       return res
//         .status(403)
//         .json({ error: "Only drivers can access their orders" });
//     }

//     const driverId = req.user.id;
//     const tenantId = req.derivedTenantId;

//     // ✅ PAGINATION PARAMETERS
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 10;
//     const skip = (page - 1) * limit;

//     // ✅ TOTAL COUNT FOR PAGINATION - NON-RECURRING ONLY
//     const totalOrders = await prisma.order.count({
//       where: {
//         driverId,
//         tenantId,
//         status: {
//           in: ["pending", "in_progress", "out_for_delivery", "delivered"],
//         },
//         isRecurring: false, // ✅ ONLY NON-RECURRING ORDERS
//       },
//     });

//     const orders = await prisma.order.findMany({
//       where: {
//         driverId,
//         tenantId,
//         status: {
//           in: ["pending", "in_progress", "out_for_delivery", "delivered"],
//         },
//         isRecurring: false, // ✅ ONLY NON-RECURRING ORDERS
//       },
//       include: {
//         customer: {
//           select: {
//             name: true,
//             phone: true,
//             address: true,
//             empties: true,
//           },
//         },
//         zone: { select: { name: true } },
//         items: {
//           include: {
//             product: {
//               select: {
//                 name: true,
//                 size: true,
//                 isReusable: true,
//                 requiresEmptyReturn: true,
//               },
//             },
//           },
//         },
//       },
//       orderBy: [
//         { status: "asc" },
//         { deliveryDate: "asc" },
//         { createdAt: "desc" },
//       ],
//       skip, // ✅ PAGINATION SKIP
//       take: limit, // ✅ PAGINATION LIMIT
//     });

//     const today = new Date().toDateString();
//     const stats = {
//       totalToday: orders.filter(
//         (o) => new Date(o.deliveryDate).toDateString() === today
//       ).length,
//       pending: orders.filter((o) => o.status === "pending").length,
//       inProgress: orders.filter((o) => o.status === "in_progress").length,
//       outForDelivery: orders.filter((o) => o.status === "out_for_delivery")
//         .length,
//       deliveredToday: orders.filter(
//         (o) =>
//           o.status === "delivered" &&
//           new Date(o.deliveryDate).toDateString() === today
//       ).length,
//     };

//     // ✅ CORRECT LOGIC FOR REGULAR ORDERS ONLY
//     const ordersWithEmpties = orders.map((order) => {
//       const reusableItems = order.items.filter(
//         (i) => i.product.isReusable && i.product.requiresEmptyReturn
//       );

//       let expectedEmpties = 0;

//       if (order.withBottles === false) {
//         // Refill order
//         expectedEmpties = reusableItems.reduce((sum, i) => sum + i.quantity, 0);
//       } else {
//         // First time order - NO empties
//         expectedEmpties = 0;
//       }

//       return {
//         id: order.id,
//         orderNumber: order.orderNumberDisplay,
//         totalAmount: order.totalAmount,
//         withBottles: order.withBottles,
//         customer: {
//           name: order.customer.name,
//           phone: order.customer.phone,
//           address: order.customer.address,
//           empties: order.customer.empties,
//         },
//         zone: order.zone?.name || "Unzoned",
//         items: order.items.map((item) => ({
//           product: item.product.name,
//           size: item.product.size,
//           quantity: item.quantity,
//           isReusable: item.product.isReusable,
//         })),
//         status: order.status,
//         deliveryDate: order.deliveryDate,
//         isRecurring: false, // ✅ Explicitly false
//         expectedEmpties,
//         customerEmpties: order.customer.empties,
//         createdAt: order.createdAt,
//         updatedAt: order.updatedAt,
//       };
//     });

//     res.json({
//       success: true,
//       message: "Your assigned regular orders (non-recurring only)",
//       stats,
//       pagination: {
//         currentPage: page,
//         totalPages: Math.ceil(totalOrders / limit),
//         totalItems: totalOrders,
//         itemsPerPage: limit,
//         hasNextPage: page < Math.ceil(totalOrders / limit),
//         hasPreviousPage: page > 1,
//       },
//       orders: ordersWithEmpties,
//     });
//   } catch (err) {
//     console.error("Get My Orders Error:", err);
//     res.status(500).json({ error: "Failed to fetch your orders" });
//   }
// };

// MARK ORDER AS OUT FOR DELIVERY
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

    try {
      const statusDetails = {
        orderId: updatedOrder.id,
        orderNumber:
          // updatedOrder.orderNumber ||
          updatedOrder.orderNumberDisplay ||
          `ORD-${id.slice(0, 8)}`,
        status: "out_for_delivery",
        driverName: req.user.name || "Driver",   // ← take from authenticated driver
      };

      console.log(
        "[AUTO-NOTIFY-CUSTOMER] Sending 'out for delivery' to customer",
        updatedOrder.customer?.name || updatedOrder.customer?.phone || "?"
      );

      // This is the function you already showed earlier
      const notifyResult = await notificationService.notifyOrderStatusChangeToCustomer(
        updatedOrder.customerId,          // you need customerId here
        statusDetails
      );

      console.log("[AUTO-NOTIFY-CUSTOMER] Result:", {
        success: notifyResult.success,
        mock: notifyResult.mock,
        messageId: notifyResult.messageId || "N/A",
      });
    } catch (notifyErr) {
      console.error("[AUTO-NOTIFY-CUSTOMER] Failed:", notifyErr.message);
      // still do NOT fail the whole request
    }

    res.json({
      success: true,
      message: "Order marked as out for delivery",
      order: updatedOrder,
    });
  } catch (err) {
    console.error("Mark out for delivery error:", err);
    res.status(500).json({ error: "Failed to update order status" });
  }
};

// MARK ORDER AS DELIVERED
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
            empties: true,
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

    // ✅ CORRECT EXPECTED EMPTIES CALCULATION
    const reusableItems = order.items.filter(
      (i) => i.product.isReusable && i.product.requiresEmptyReturn
    );

    let totalExpectedEmpties = 0;

    if (order.withBottles === false) {
      totalExpectedEmpties = reusableItems.reduce(
        (sum, i) => sum + i.quantity,
        0
      );
    } else {
      // First time - no empties
      totalExpectedEmpties = 0;
    }

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
        subscription: true,
      },
    });

    await prisma.driver.update({
      where: { id: driverId },
      data: {
        totalDeliveries: { increment: 1 },
        todayDeliveries: { increment: 1 },
      },
    });

    // ────────────────────────────────────────────────────────────────
    // ADD NOTIFICATION HERE — right after update succeeds
    // ────────────────────────────────────────────────────────────────
    try {
      const statusDetails = {
        orderId: updatedOrder.id,
        orderNumber:
          // updatedOrder.orderNumber ||
          updatedOrder.orderNumberDisplay ||
          `ORD-${id.slice(0, 8)}`,
        status: "delivered",
        driverName: req.user.name || "Driver",
      };

      await notificationService.notifyOrderStatusChangeToCustomer(
        order.customerId,   // ← from the findFirst result — guaranteed to exist
        statusDetails
      );
    } catch (notifyErr) {
      console.error("[AUTO-DELIVERED] Customer notification failed:", notifyErr);
    }
    res.json({
      success: true,
      message: `Order delivered! ${totalExpectedEmpties > 0
        ? `Collect ${totalExpectedEmpties} empties.`
        : "First time delivery - no empties to collect."
        }`,
      order: updatedOrder,
      expectedEmpties: totalExpectedEmpties,
      customerEmpties: order.customer.empties,
      nextAction: updatedOrder.isRecurring
        ? "Complete order to schedule next delivery"
        : "Complete order",
    });
  } catch (err) {
    console.error("Mark delivered error:", err);
    res.status(500).json({ error: "Failed to mark order as delivered" });
  }
};

// SEND OTP (Public)
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

// VERIFY OTP & LOGIN (Public)
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
