// src/controllers/customerEditController.js
const prisma = require("../../prisma/client");

// EDIT UPCOMING RECURRING ORDER
exports.editUpcomingOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { quantity, deliveryDate, skipThisWeek } = req.body;
    const customerId = req.user.id;
    const tenantId = req.derivedTenantId;

    // Find the upcoming order
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        customerId,
        tenantId,
        status: "scheduled", // Only scheduled orders can be edited
        isRecurring: true,
        deliveryDate: {
          gt: new Date(), // Future orders only
        },
      },
      include: {
        subscription: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        error: "Order not found or cannot be edited",
      });
    }

    // Check if editing is allowed (up to 6 PM day before delivery)
    const deliveryDay = new Date(order.deliveryDate);
    const today = new Date();
    const deadline = new Date(deliveryDay);
    deadline.setDate(deadline.getDate() - 1);
    deadline.setHours(18, 0, 0, 0); // 6 PM day before

    if (today > deadline) {
      return res.status(400).json({
        error:
          "Editing deadline passed. Changes must be made before 6 PM day before delivery.",
        deadline: deadline.toLocaleString(),
      });
    }

    // If skipping this week
    if (skipThisWeek) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: "cancelled",
          updatedAt: new Date(),
        },
      });

      // Update subscription next delivery date to skip a week
      if (order.subscription) {
        const nextDate = new Date(order.deliveryDate);
        nextDate.setDate(nextDate.getDate() + 14); // Skip 2 weeks
        await prisma.subscription.update({
          where: { id: order.subscription.id },
          data: {
            nextDeliveryDate: nextDate,
            missedDeliveries: { increment: 1 },
          },
        });
      }

      return res.json({
        success: true,
        message:
          "Delivery skipped for this week. Next delivery will be in 2 weeks.",
        nextDelivery: order.subscription?.nextDeliveryDate,
      });
    }

    // Update quantity
    if (quantity && quantity > 0) {
      const product = order.items[0]?.product;
      if (!product) {
        return res.status(400).json({ error: "No product found in order" });
      }

      // Check stock
      const inventory = await prisma.productInventory.findUnique({
        where: {
          productId_tenantId: {
            productId: product.id,
            tenantId,
          },
        },
      });

      if (!inventory || inventory.currentStock < quantity) {
        return res.status(400).json({
          error: `Insufficient stock. Available: ${
            inventory?.currentStock || 0
          }`,
        });
      }

      // Update order item
      await prisma.orderItem.updateMany({
        where: { orderId },
        data: {
          quantity: parseInt(quantity),
          totalPrice: parseInt(quantity) * product.price,
          depositAmount: product.isReusable
            ? product.depositAmount * quantity
            : 0,
        },
      });

      // Update order total
      const totalAmount =
        quantity * product.price +
        (product.isReusable ? product.depositAmount * quantity : 0);
      await prisma.order.update({
        where: { id: orderId },
        data: { totalAmount },
      });

      // Update subscription quantity (for future orders)
      if (order.subscription) {
        await prisma.subscription.update({
          where: { id: order.subscription.id },
          data: { quantity: parseInt(quantity) },
        });
      }
    }

    // Update delivery date
    if (deliveryDate) {
      const newDate = new Date(deliveryDate);
      const dayOfWeek = newDate.getDay();

      await prisma.order.update({
        where: { id: orderId },
        data: { deliveryDate: newDate },
      });

      // Update subscription day of week
      if (order.subscription) {
        await prisma.subscription.update({
          where: { id: order.subscription.id },
          data: {
            deliveryDayOfWeek: dayOfWeek,
            nextDeliveryDate: new Date(
              newDate.getTime() + 7 * 24 * 60 * 60 * 1000
            ),
          },
        });
      }
    }

    const updatedOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        subscription: true,
      },
    });

    res.json({
      success: true,
      message: "Order updated successfully",
      order: updatedOrder,
      note: "Changes will apply to this delivery and future recurring deliveries",
    });
  } catch (err) {
    console.error("Edit Order Error:", err);
    res.status(500).json({ error: "Failed to edit order" });
  }
};

// // GET CUSTOMER'S UPCOMING RECURRING ORDERS
exports.getUpcomingRecurringOrders = async (req, res) => {
  try {
    const customerId = req.user.id;
    const tenantId = req.derivedTenantId;

     
    const upcomingOrders = await prisma.order.findMany({
      where: {
        customerId,
        tenantId,
        isRecurring: true,
        deliveryDate: {
          gt: new Date(), // Future orders
        },
        status: {
          in: ["pending", "confirmed", "assigned"],
        },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        subscription: true,
      },
      orderBy: { deliveryDate: "asc" },
    });

    // Format response
    const formatted = upcomingOrders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumberDisplay,
      deliveryDate: order.deliveryDate,
      status: order.status,
      items: order.items.map((item) => ({
        product: item.product.name,
        quantity: item.quantity,
        price: item.product.price,
        total: item.totalPrice,
      })),
      subscription: order.subscription
        ? {
            recurrence: order.subscription.recurrence,
            nextDelivery: order.subscription.nextDeliveryDate,
            totalDeliveries: order.subscription.totalDeliveries,
          }
        : null,
      canEdit: (() => {
        const deliveryDay = new Date(order.deliveryDate);
        const deadline = new Date(deliveryDay);
        deadline.setDate(deadline.getDate() - 1);
        deadline.setHours(18, 0, 0, 0);
        return new Date() < deadline;
      })(),
      editDeadline: (() => {
        const deliveryDay = new Date(order.deliveryDate);
        const deadline = new Date(deliveryDay);
        deadline.setDate(deadline.getDate() - 1);
        deadline.setHours(18, 0, 0, 0);
        return deadline;
      })(),
    }));

    res.json({
      success: true,
      orders: formatted,
      total: formatted.length,
    });
  } catch (err) {
    console.error("Get Upcoming Orders Error:", err);
    res.status(500).json({ error: "Failed to fetch upcoming orders" });
  }
};
// exports.getUpcomingRecurringOrders = async (req, res) => {
//   try {
//     const customerId = req.user.id;
//     const tenantId = req.derivedTenantId;

//     // ── DEBUG: Capture current time and auth context ────────────────────────
//     const serverNow = new Date();

//     // Main query (status filter still active, date filter removed)
//     const upcomingOrders = await prisma.order.findMany({
//       where: {
//         customerId,
//         tenantId,
//         isRecurring: true,
//         status: {
//           in: ["pending", "confirmed", "assigned"],
//         },
//       },
//       include: {
//         items: {
//           include: {
//             product: true,
//           },
//         },
//         subscription: true,
//       },
//       orderBy: { deliveryDate: "asc" },
//     });

//     // ── DEBUG QUERIES ───────────────────────────────────────────────────────
//     const debug = {
//       requestedBy: {
//         customerId,
//         tenantId,
//       },
//       serverTime: {
//         utc: serverNow.toISOString(),
//         ptk: serverNow.toLocaleString("en-US", { timeZone: "Asia/Karachi" }),
//       },
//       queryFiltersApplied: {
//         isRecurring: true,
//         statusIn: ["pending", "confirmed", "assigned"],
//         // deliveryDate filter is currently removed
//       },
//       foundInMainQuery: upcomingOrders.length,

//       // How many recurring orders exist at all (no status/date filter)
//       totalRecurringAnyStatus: await prisma.order.count({
//         where: {
//           customerId,
//           tenantId,
//           isRecurring: true,
//         },
//       }),

//       // All recurring orders with minimal fields (latest first)
//       allRecurringOrdersSample: await prisma.order.findMany({
//         where: {
//           customerId,
//           tenantId,
//           isRecurring: true,
//         },
//         select: {
//           id: true,
//           orderNumberDisplay: true,
//           deliveryDate: true,
//           status: true,
//           isRecurring: true,
//           recurrence: true,
//           nextRecurringDate: true,
//           subscriptionId: true,
//           createdAt: true,
//         },
//         orderBy: { createdAt: "desc" },
//         take: 5, // limit to recent ones
//       }),

//       // Status distribution of recurring orders
//       recurringByStatus: await prisma.order.groupBy({
//         by: ["status"],
//         where: {
//           customerId,
//           tenantId,
//           isRecurring: true,
//         },
//         _count: {
//           status: true,
//         },
//       }),
//     };

//     console.log("GET UPCOMING RECURRING DEBUG:", JSON.stringify(debug, null, 2));

//     // Format response (same as before)
//     const formatted = upcomingOrders.map((order) => ({
//       id: order.id,
//       orderNumber: order.orderNumberDisplay,
//       deliveryDate: order.deliveryDate,
//       status: order.status,
//       items: order.items.map((item) => ({
//         product: item.product.name,
//         quantity: item.quantity,
//         price: item.product.price,
//         total: item.totalPrice,
//       })),
//       subscription: order.subscription
//         ? {
//             recurrence: order.subscription.recurrence,
//             nextDelivery: order.subscription.nextDeliveryDate,
//             totalDeliveries: order.subscription.totalDeliveries,
//           }
//         : null,
//       canEdit: (() => {
//         const deliveryDay = new Date(order.deliveryDate);
//         const deadline = new Date(deliveryDay);
//         deadline.setDate(deadline.getDate() - 1);
//         deadline.setHours(18, 0, 0, 0);
//         return new Date() < deadline;
//       })(),
//       editDeadline: (() => {
//         const deliveryDay = new Date(order.deliveryDate);
//         const deadline = new Date(deliveryDay);
//         deadline.setDate(deadline.getDate() - 1);
//         deadline.setHours(18, 0, 0, 0);
//         return deadline;
//       })(),
//     }));

//     // Return both normal data + debug (you can remove debug later)
//     res.json({
//       success: true,
//       debug: debug,
//       orders: formatted,
//       total: formatted.length,
//     });
//   } catch (err) {
//     console.error("Get Upcoming Orders Error:", err);
//     res.status(500).json({ 
//       success: false,
//       error: "Failed to fetch upcoming orders",
//       details: err.message 
//     });
//   }
// };
// PAUSE/RESUME SUBSCRIPTION
exports.toggleSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { action } = req.body; // "PAUSE" or "RESUME"
    const customerId = req.user.id;
    const tenantId = req.derivedTenantId;

    const subscription = await prisma.subscription.findFirst({
      where: {
        id: subscriptionId,
        customerId,
        tenantId,
      },
    });

    if (!subscription) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    let newStatus;
    let message;

    if (action === "PAUSE") {
      newStatus = "PAUSED";
      message = "Subscription paused. No new orders will be created.";
    } else if (action === "RESUME") {
      newStatus = "ACTIVE";
      // Calculate next delivery date from today
      const today = new Date();
      const dayOfWeek = subscription.deliveryDayOfWeek;
      const daysUntilNext = (dayOfWeek - today.getDay() + 7) % 7;
      const nextDate = new Date(today);
      nextDate.setDate(
        today.getDate() + (daysUntilNext === 0 ? 7 : daysUntilNext)
      );

      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: newStatus,
          nextDeliveryDate: nextDate,
        },
      });

      message = `Subscription resumed. Next delivery: ${nextDate.toDateString()}`;
    } else {
      return res.status(400).json({ error: "Invalid action" });
    }

    const updated = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: newStatus },
    });

    res.json({
      success: true,
      message,
      subscription: updated,
    });
  } catch (err) {
    console.error("Toggle Subscription Error:", err);
    res.status(500).json({ error: "Failed to update subscription" });
  }
};
