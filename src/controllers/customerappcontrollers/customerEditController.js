// src/controllers/customerEditController.js
const prisma = require("../../prisma/client");

// EDIT UPCOMING RECURRING ORDER
// exports.editUpcomingOrder = async (req, res) => {
//   try {
//     const { orderId } = req.params;
//     const { quantity, deliveryDate, skipThisWeek } = req.body;
//     const customerId = req.user.id;
//     const tenantId = req.derivedTenantId;

//     // Find the upcoming order
//     const order = await prisma.order.findFirst({
//       where: {
//         id: orderId,
//         customerId,
//         tenantId,
//         // status: "scheduled", // Only scheduled orders can be edited
//         isRecurring: true,
//         deliveryDate: {
//           gt: new Date(), // Future orders only
//         },
//       },
//       include: {
//         subscription: true,
//         items: {
//           include: {
//             product: true,
//           },
//         },
//       },
//     });

//     if (!order) {
//       return res.status(404).json({
//         error: "Order not found or cannot be edited",
//       });
//     }

//     // Check if editing is allowed (up to 6 PM day before delivery)
//     const deliveryDay = new Date(order.deliveryDate);
//     const today = new Date();
//     const deadline = new Date(deliveryDay);
//     deadline.setDate(deadline.getDate() - 1);
//     deadline.setHours(18, 0, 0, 0); // 6 PM day before

//     if (today > deadline) {
//       return res.status(400).json({
//         error:
//           "Editing deadline passed. Changes must be made before 6 PM day before delivery.",
//         deadline: deadline.toLocaleString(),
//       });
//     }

//     // If skipping this week
//     if (skipThisWeek) {
//       await prisma.order.update({
//         where: { id: orderId },
//         data: {
//           status: "cancelled",
//           updatedAt: new Date(),
//         },
//       });

//       // Update subscription next delivery date to skip a week
//       if (order.subscription) {  //true
//         const nextDate = new Date(order.deliveryDate);
//         nextDate.setDate(nextDate.getDate() + 14); // Skip 2 weeks
//         await prisma.subscription.update({
//           where: { id: order.subscription.id },
//           data: {
//             nextDeliveryDate: nextDate,
//             missedDeliveries: { increment: 1 },
//           },
//         });
//       }

//       return res.json({
//         success: true,
//         message:
//           "Delivery skipped for this week. Next delivery will be in 2 weeks.",
//         nextDelivery: order.subscription?.nextDeliveryDate,
//       });
//     }else {    //false
//   // Reset order status back to pending (or your active status)
//   await prisma.order.update({
//     where: { id: orderId },
//     data: {
//       status: "pending", // your active status here
//       updatedAt: new Date(),
//     },
//   });

//   // Also set subscription status to ACTIVE
//   if (order.subscription) {
//     await prisma.subscription.update({
//       where: { id: order.subscription.id },
//       data: {
//         status: "ACTIVE",
//         updatedAt: new Date(),
//       },
//     });
//   }
// }

//     // Update quantity
//     if (quantity && quantity > 0) {
//       const product = order.items[0]?.product;
//       if (!product) {
//         return res.status(400).json({ error: "No product found in order" });
//       }

//       // Check stock
//       const inventory = await prisma.productInventory.findUnique({
//         where: {
//           productId_tenantId: {
//             productId: product.id,
//             tenantId,
//           },
//         },
//       });

//       if (!inventory || inventory.currentStock < quantity) {
//         return res.status(400).json({
//           error: `Insufficient stock. Available: ${
//             inventory?.currentStock || 0
//           }`,
//         });
//       }

//       // Update order item
//       await prisma.orderItem.updateMany({
//         where: { orderId },
//         data: {
//           quantity: parseInt(quantity),
//           totalPrice: parseInt(quantity) * product.price,
//           depositAmount: product.isReusable
//             ? product.depositAmount * quantity
//             : 0,
//         },
//       });

//       // Update order total
//       const totalAmount =
//         quantity * product.price +
//         (product.isReusable ? product.depositAmount * quantity : 0);
//       await prisma.order.update({
//         where: { id: orderId },
//         data: { totalAmount },
//       });

//       // Update subscription quantity (for future orders)
//       if (order.subscription) {
//         await prisma.subscription.update({
//           where: { id: order.subscription.id },
//           data: { quantity: parseInt(quantity) },
//         });
//       }
//     }

//     // Update delivery date
//     // if (deliveryDate) {
//     //   const newDate = new Date(deliveryDate);
//     //   const dayOfWeek = newDate.getDay();

//     if (deliveryDate) {
//   // deliveryDate = "31-01-2026"
//   // const [day, month, year] = deliveryDate.split("-").map(Number);

//   const newDate = new Date(day, month, year); // JS month is 0-based
// const dayOfWeek = newDate.getDay();
//   if (isNaN(newDate.getTime())) {
//     return res.status(400).json({ error: "Invalid deliveryDate format. Use DD-MM-YYYY" });
//   }

//       await prisma.order.update({
//         where: { id: orderId },
//         data: { deliveryDate: newDate },
//       });

//       // Update subscription day of week
//       if (order.subscription) {
//         await prisma.subscription.update({
//           where: { id: order.subscription.id },
//           data: {
//             deliveryDayOfWeek: dayOfWeek,
//             nextDeliveryDate: new Date(
//               newDate.getTime() + 7 * 24 * 60 * 60 * 1000
//             ),
//           },
//         });
//       }
//     }

//     const updatedOrder = await prisma.order.findUnique({
//       where: { id: orderId },
//       include: {
//         items: {
//           include: {
//             product: true,
//           },
//         },
//         subscription: true,
//       },
//     });

//     res.json({
//       success: true,
//       message: "Order updated successfully",
//       order: updatedOrder,
//       note: "Changes will apply to this delivery and future recurring deliveries",
//     });
//   } catch (err) {
//     console.error("Edit Order Error:", err);
//     res.status(500).json({ error: "Failed to edit order" });
//   }
// };

// exports.editUpcomingOrder = async (req, res) => {
//   try {
//     const { orderId } = req.params;
//     const { quantity, deliveryDate, skipThisWeek } = req.body;
//     const customerId = req.user.id;
//     const tenantId = req.derivedTenantId;

//     // Find the upcoming order
//     const order = await prisma.order.findFirst({
//       where: {
//         id: orderId,
//         customerId,
//         tenantId,
//         isRecurring: true,
//         deliveryDate: {
//           gt: new Date(), // Future orders only
//         },
//       },
//       include: {
//         subscription: true,
//         items: {
//           include: {
//             product: true,
//           },
//         },
//       },
//     });

//     if (!order) {
//       return res.status(404).json({
//         error: "Order not found or cannot be edited",
//       });
//     }

//     // Check if editing is allowed (up to 6 PM day before delivery)
//     const deliveryDay = new Date(order.deliveryDate);
//     const today = new Date();
//     const deadline = new Date(deliveryDay);
//     deadline.setDate(deadline.getDate() - 1);
//     deadline.setHours(18, 0, 0, 0); // 6 PM day before

//     if (today > deadline) {
//       return res.status(400).json({
//         error:
//           "Editing deadline passed. Changes must be made before 6 PM day before delivery.",
//         deadline: deadline.toLocaleString(),
//       });
//     }

//     // If skipping this week
//     if (skipThisWeek) {
//       await prisma.order.update({
//         where: { id: orderId },
//         data: {
//           status: "cancelled",
//           updatedAt: new Date(),
//         },
//       });

//       // Update subscription next delivery date to skip a week
//       if (order.subscription) {
//         const nextDate = new Date(order.subscription.nextDeliveryDate);
//         nextDate.setDate(nextDate.getDate() + 7); // Skip 1 week (or 14 for 2 weeks)
//         await prisma.subscription.update({
//           where: { id: order.subscription.id },
//           data: {
//             nextDeliveryDate: nextDate,
//             missedDeliveries: { increment: 1 },
//           },
//         });
//       }

//       return res.json({
//         success: true,
//         message: "Delivery skipped for this week. Next delivery will be in 1 week.",
//         nextDelivery: order.subscription?.nextDeliveryDate,
//       });
//     }

//     // Reset order status back to pending (if not skipping)
//     await prisma.order.update({
//       where: { id: orderId },
//       data: {
//         status: "pending",
//         updatedAt: new Date(),
//       },
//     });

//     // Also set subscription status to ACTIVE
//     if (order.subscription) {
//       await prisma.subscription.update({
//         where: { id: order.subscription.id },
//         data: {
//           status: "ACTIVE",
//           updatedAt: new Date(),
//         },
//       });
//     }

//     // Update quantity
//     if (quantity && quantity > 0) {
//       const product = order.items[0]?.product;
//       if (!product) {
//         return res.status(400).json({ error: "No product found in order" });
//       }

//       // Check stock
//       const inventory = await prisma.productInventory.findUnique({
//         where: {
//           productId_tenantId: {
//             productId: product.id,
//             tenantId,
//           },
//         },
//       });

//       if (!inventory || inventory.currentStock < quantity) {
//         return res.status(400).json({
//           error: `Insufficient stock. Available: ${inventory?.currentStock || 0
//             }`,
//         });
//       }

//       // Update order item
//       await prisma.orderItem.updateMany({
//         where: { orderId },
//         data: {
//           quantity: parseInt(quantity),
//           totalPrice: parseInt(quantity) * product.price,
//           depositAmount: product.isReusable
//             ? product.depositAmount * quantity
//             : 0,
//         },
//       });

//       // Update order total
//       const totalAmount =
//         quantity * product.price +
//         (product.isReusable ? product.depositAmount * quantity : 0);
//       await prisma.order.update({
//         where: { id: orderId },
//         data: { totalAmount },
//       });

//       // Update subscription quantity (for future orders)
//       if (order.subscription) {
//         await prisma.subscription.update({
//           where: { id: order.subscription.id },
//           data: { quantity: parseInt(quantity) },
//         });
//       }
//     }

//     // Update delivery date - ONLY update the ORDER, NOT the subscription pattern
//     if (deliveryDate) {
//       // Parse DD-MM-YYYY format
//       let newDate;
//       if (deliveryDate.includes('-')) {
//         const [day, month, year] = deliveryDate.split('-');
//         newDate = new Date(year, month, day); // month is 0-indexed
//       } else {
//         newDate = new Date(deliveryDate);
//       }

//       // Validate date
//       if (isNaN(newDate.getTime())) {
//         return res.status(400).json({
//           error: "Invalid deliveryDate format. Use DD-MM-YYYY"
//         });
//       }

//       // Update ONLY this order's delivery date
//       // This does NOT change the subscription's deliveryDayOfWeek
//       await prisma.order.update({
//         where: { id: orderId },
//         data: {
//           deliveryDate: newDate,
//           updatedAt: new Date(),
//         },
//       });

//       // ⚠️ IMPORTANT: We DO NOT update subscription.deliveryDayOfWeek
//       // This keeps the subscription on its original day (e.g., Wednesday)
//       // Only THIS order (Jan 14) moves to the new date
//       // Future orders still follow the subscription's original schedule
//     }

//     const updatedOrder = await prisma.order.findUnique({
//       where: { id: orderId },
//       include: {
//         items: {
//           include: {
//             product: true,
//           },
//         },
//         subscription: true,
//       },
//     });

//     res.json({
//       success: true,
//       message: "Order updated successfully",
//       order: updatedOrder,
//       note: "This delivery has been rescheduled. Future deliveries remain on the original subscription schedule.",
//     });
//   } catch (err) {
//     console.error("Edit Order Error:", err);
//     res.status(500).json({ error: "Failed to edit order" });
//   }
// };

exports.editUpcomingOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      quantity,
      deliveryDate,
      skipThisWeek,
      withBottles, // Added: change bottle delivery for this week
      notes, // Added: reason for the change
    } = req.body;

    const customerId = req.user.id;
    const tenantId = req.derivedTenantId;

    // Find the upcoming order
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        customerId,
        tenantId,
        isRecurring: true,
        // deliveryDate: {
        //   gt: new Date(), // Future orders only
        // },
      },
      include: {
        subscription: {
          select: {
            id: true,
            quantity: true,
            recurrence: true,
            nextDeliveryDate: true,
            status: true,
          },
        },
        items: {
          include: {
            product: true,
          },
        },
        customer: {
          select: {
            empties: true,
            bottlesGiven: true,
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

    const result = await prisma.$transaction(async (tx) => {
      let updatedOrder = order;
      const originalQuantity = order.items[0]?.quantity || 0;
      const product = order.items[0]?.product;

      // If skipping this week
      if (skipThisWeek) {
        // Update order as cancelled exception
        updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: {
            status: "cancelled",
            isException: true,
            exceptionType: "skip",
            originalQuantity: originalQuantity,
            overrideQuantity: 0,
            exceptionNotes: notes || "Customer requested to skip this week",
            updatedAt: new Date(),
          },
        });

        // Restock inventory since order is cancelled
        if (originalQuantity > 0 && product) {
          await tx.productInventory.update({
            where: {
              productId_tenantId: {
                productId: product.id,
                tenantId,
              },
            },
            data: {
              currentStock: { increment: originalQuantity },
              totalSold: { decrement: originalQuantity },
            },
          });

          // Restore bottle inventory if applicable
          if (order.withBottles && product.isReusable) {
            await tx.bottleInventory.upsert({
              where: { tenantId },
              update: {
                inStock: { increment: originalQuantity },
                withCustomers: { decrement: originalQuantity },
              },
              create: {
                tenantId,
                inStock: originalQuantity,
                withCustomers: 0,
              },
            });

            // Update customer empties
            await tx.customer.update({
              where: { id: customerId },
              data: {
                empties: { decrement: originalQuantity },
                bottlesGiven: { decrement: originalQuantity },
              },
            });
          }
        }

        // Update subscription next delivery date (skip one week)
        if (order.subscription) {
          const nextDate = new Date(order.deliveryDate);
          nextDate.setDate(nextDate.getDate() + 7); // Skip to next week

          await tx.subscription.update({
            where: { id: order.subscription.id },
            data: {
              nextDeliveryDate: nextDate,
              missedDeliveries: { increment: 1 },
            },
          });
        }

        return {
          order: updatedOrder,
          action: "skipped",
          message: "Delivery skipped for this week",
        };
      }

      // Reset order status back to pending (if not skipping)
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: "pending",
          updatedAt: new Date(),
        },
      });

      // Also set subscription status to ACTIVE
      if (order.subscription) {
        await tx.subscription.update({
          where: { id: order.subscription.id },
          data: {
            status: "ACTIVE",
            updatedAt: new Date(),
          },
        });
      }

      // UPDATE QUANTITY - AS WEEKLY EXCEPTION (not global)
      if (quantity && quantity > 0 && quantity !== originalQuantity) {
        if (!product) {
          throw new Error("No product found in order");
        }

        // Check stock
        const inventory = await tx.productInventory.findUnique({
          where: {
            productId_tenantId: {
              productId: product.id,
              tenantId,
            },
          },
        });

        if (!inventory || inventory.currentStock < quantity) {
          throw new Error(
            `Insufficient stock. Available: ${inventory?.currentStock || 0}`,
          );
        }

        // Calculate difference
        const quantityDiff = quantity - originalQuantity;

        // Calculate new totals
        const newTotalPrice = quantity * product.price;
        const newDepositAmount =
          order.withBottles && product.isReusable
            ? product.depositAmount * quantity
            : 0;
        const newTotalAmount = newTotalPrice + newDepositAmount;

        // Update order as a quantity exception (not subscription)
        updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: {
            totalAmount: newTotalAmount,
            acceptableDepositAmount: newDepositAmount,
            isException: true, // Mark as exception
            exceptionType: "quantity", // Type: quantity change
            originalQuantity: originalQuantity, // Store original
            overrideQuantity: quantity, // Store override
            exceptionNotes:
              notes ||
              `Quantity changed from ${originalQuantity} to ${quantity} for this week only`,
            updatedAt: new Date(),
            items: {
              update: {
                where: { id: order.items[0].id },
                data: {
                  quantity: quantity,
                  totalPrice: newTotalPrice,
                  depositAmount: newDepositAmount,
                },
              },
            },
          },
        });

        // Adjust inventory for the DIFFERENCE only
        if (quantityDiff !== 0) {
          await tx.productInventory.update({
            where: {
              productId_tenantId: {
                productId: product.id,
                tenantId,
              },
            },
            data: {
              currentStock: { decrement: quantityDiff },
              totalSold: { increment: quantityDiff },
            },
          });

          // If bottles are involved, update bottle inventory
          if (order.withBottles && product.isReusable) {
            await tx.bottleInventory.upsert({
              where: { tenantId },
              update: {
                inStock: { decrement: quantityDiff },
                withCustomers: { increment: quantityDiff },
              },
              create: {
                tenantId,
                inStock: Math.max(0, -quantityDiff),
                withCustomers: quantityDiff,
              },
            });

            // Update customer empties
            await tx.customer.update({
              where: { id: customerId },
              data: {
                empties: { increment: quantityDiff },
                bottlesGiven: { increment: quantityDiff },
              },
            });
          }
        }

        // ⚠️ IMPORTANT: DO NOT update subscription quantity
        // This change is ONLY for this week
        // Future orders should use the original subscription quantity

        return {
          order: updatedOrder,
          action: "quantity_changed",
          message: `Quantity changed from ${originalQuantity} to ${quantity} for this week only`,
          note: "⚠️ Subscription quantity remains unchanged for future deliveries",
        };
      }

      // CHANGE WITH_BOTTLES FOR THIS WEEK ONLY
      if (withBottles !== undefined && withBottles !== order.withBottles) {
        if (!product || !product.isReusable) {
          throw new Error(
            "Cannot change withBottles for non-reusable products",
          );
        }

        const newWithBottles = Boolean(withBottles);

        // Validate bottle stock if changing to withBottles = true
        if (newWithBottles && !order.withBottles) {
          const bottleInventory = await tx.bottleInventory.findUnique({
            where: { tenantId },
          });

          if (!bottleInventory || bottleInventory.inStock < originalQuantity) {
            throw new Error(
              `Not enough bottles in stock. Available: ${bottleInventory?.inStock || 0}`,
            );
          }
        }

        const newDepositAmount = newWithBottles
          ? product.depositAmount * originalQuantity
          : 0;
        const newTotalAmount =
          originalQuantity * product.price + newDepositAmount;

        updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: {
            withBottles: newWithBottles,
            acceptableDepositAmount: newDepositAmount,
            totalAmount: newTotalAmount,
            isException: true,
            exceptionType: "with_bottles",
            exceptionNotes:
              notes || `Bottle delivery changed for this week only`,
            updatedAt: new Date(),
            items: {
              update: {
                where: { id: order.items[0].id },
                data: {
                  depositAmount: newDepositAmount,
                },
              },
            },
          },
        });

        // Update bottle inventory
        const bottleDiff = newWithBottles
          ? originalQuantity
          : -originalQuantity;
        if (bottleDiff !== 0) {
          await tx.bottleInventory.upsert({
            where: { tenantId },
            update: {
              inStock: { decrement: bottleDiff },
              withCustomers: { increment: bottleDiff },
            },
            create: {
              tenantId,
              inStock: -bottleDiff,
              withCustomers: bottleDiff,
            },
          });

          await tx.customer.update({
            where: { id: customerId },
            data: {
              empties: { increment: bottleDiff },
              bottlesGiven: { increment: bottleDiff },
            },
          });
        }

        return {
          order: updatedOrder,
          action: "bottles_changed",
          message: `Bottle delivery changed to ${newWithBottles ? "with bottles" : "refill only"} for this week`,
        };
      }

      // Update delivery date - ONLY update the ORDER, NOT the subscription
      if (deliveryDate) {
        let newDate;
        if (deliveryDate.includes("-")) {
          const [day, month, year] = deliveryDate.split("-").map(Number);
          newDate = new Date(year, month - 1, day); // month is 0-indexed
        } else {
          newDate = new Date(deliveryDate);
        }

        if (isNaN(newDate.getTime())) {
          throw new Error("Invalid deliveryDate format. Use DD-MM-YYYY");
        }

        // Update ONLY this order's delivery date as an exception
        updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: {
            deliveryDate: newDate,
            isException: true,
            exceptionType: "delivery_date",
            exceptionNotes: notes || `Rescheduled for this week only`,
            updatedAt: new Date(),
          },
        });

        // ⚠️ DO NOT update subscription.deliveryDayOfWeek
        // This keeps the subscription on its original schedule

        return {
          order: updatedOrder,
          action: "rescheduled",
          message: "Delivery date changed for this week only",
        };
      }

      // If no changes were made, just return the order
      return {
        order: updatedOrder,
        action: "no_changes",
        message: "Order updated with no content changes",
      };
    });

    // Fetch the fully updated order
    const finalOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        subscription: {
          select: {
            id: true,
            quantity: true,
            recurrence: true,
            nextDeliveryDate: true,
            status: true,
          },
        },
      },
    });

    // Build response based on action
    const response = {
      success: true,
      message: result.message,
      order: finalOrder,
      isException: result.order?.isException || false,
      action: result.action,
      timestamp: new Date(),
    };

    // Add appropriate notes based on action
    if (result.action === "quantity_changed") {
      response.note =
        "⚠️ Quantity changed ONLY for this week. Future deliveries will use the original subscription quantity.";
      response.subscriptionQuantity = order.subscription?.quantity;
    } else if (result.action === "rescheduled") {
      response.note =
        "⚠️ Delivery date changed ONLY for this week. Future deliveries remain on the original subscription schedule.";
    } else if (result.action === "skipped") {
      response.note =
        "Delivery skipped. Next delivery will be as per subscription schedule.";
      response.nextDelivery = order.subscription?.nextDeliveryDate;
    }

    res.json(response);
  } catch (err) {
    console.error("Edit Order Error:", err);
    res.status(500).json({
      error: "Failed to edit order",
      details: err.message,
    });
  }
};

// // GET CUSTOMER'S UPCOMING RECURRING ORDERS
// exports.getUpcomingRecurringOrders = async (req, res) => {
//   try {
//     const customerId = req.user.id;
//     const tenantId = req.derivedTenantId;

//     const upcomingOrders = await prisma.order.findMany({
//       where: {
//         customerId,
//         tenantId,
//         isRecurring: true,

//         deliveryDate: {
//           gt: new Date(), // Future orders
//         },
//         nextRecurringDate: {
//           gt: new Date(), // Future recurring orders
//         },
//         status: {
//           in: ["pending", "in_progress"],
//           // in: ["pending", "confirmed", "assigned","in_progress"],
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

//     // Format response
//     const formatted = upcomingOrders.map((order) => ({
//       id: order.id,
//       orderNumber: order.orderNumberDisplay,
//       deliveryDate: order.deliveryDate,
//       nextRecurringDate: order.nextRecurringDate,
//       status: order.status,
//       items: order.items.map((item) => ({
//         product: item.product.name,
//         quantity: item.quantity,
//         price: item.product.price,
//         total: item.totalPrice,
//       })),
//       subscription: order.subscription
//         ? {
//           id: order.subscription.id,                 // ✅ subscription ID
//           status: order.subscription.status,
//           recurrence: order.subscription.recurrence,
//           nextDelivery: order.subscription.nextDeliveryDate,
//           totalDeliveries: order.subscription.totalDeliveries,
//         }
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

//     res.json({
//       success: true,
//       orders: formatted,
//       total: formatted.length,
//     });
//   } catch (err) {
//     console.error("Get Upcoming Orders Error:", err);
//     res.status(500).json({ error: "Failed to fetch upcoming orders" });
//   }
// };
// exports.getUpcomingRecurringOrders = async (req, res) => {
//   try {
//     const customerId = req.user.id;
//     const tenantId = req.derivedTenantId;

//     // Check what statuses actually exist in your system
//     console.log("Fetching upcoming orders for customer:", customerId);
//     console.log("Current time:", new Date());

//     // Get ALL future recurring orders - use only valid statuses
//     const upcomingOrders = await prisma.order.findMany({
//       where: {
//         customerId,
//         tenantId,
//         isRecurring: true,
//         deliveryDate: {
//           gt: new Date(), // All future orders
//         },
//         // Use ONLY the statuses that exist in your OrderStatus enum
//         status: {
//           in: ["pending", "assigned", "in_progress"], // Only these exist
//         },
//       },
//       include: {
//         items: {
//           include: {
//             product: true,
//           },
//         },
//         subscription: {
//           select: {
//             id: true,
//             status: true,
//             recurrence: true,
//             nextDeliveryDate: true,
//             totalDeliveries: true,
//             quantity: true,
//           },
//         },
//       },
//       orderBy: { deliveryDate: "asc" },
//     });

//     console.log(`Found ${upcomingOrders.length} upcoming orders`);

//     // Debug: Log what we found
//     if (upcomingOrders.length > 0) {
//       upcomingOrders.forEach((order, index) => {
//         console.log(`Order ${index + 1}:`, {
//           id: order.id.substring(0, 8) + "...",
//           orderNumber: order.orderNumberDisplay,
//           deliveryDate: order.deliveryDate,
//           status: order.status,
//           isException: order.isException,
//           items: order.items.map(i => ({
//             product: i.product.name,
//             quantity: i.quantity,
//           })),
//         });
//       });
//     } else {
//       console.log("No upcoming orders found. Checking if any orders exist...");

//       // Debug: Check all orders for this customer
//       const allOrders = await prisma.order.findMany({
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
//           createdAt: true,
//         },
//         orderBy: { deliveryDate: "desc" },
//         take: 5,
//       });

//       console.log("All recurring orders for customer:", allOrders);
//     }

//     // Format response
//     const formatted = upcomingOrders.map((order) => {
//       // Determine actual quantity
//       let actualQuantity = order.items[0]?.quantity || 0;
//       let isException = order.isException || false;

//       // If it's a quantity exception, use override quantity
//       if (isException && order.exceptionType === "quantity" && order.overrideQuantity) {
//         actualQuantity = order.overrideQuantity;
//       }
//       // If not an exception but has subscription, use subscription quantity
//       else if (!isException && order.subscription && order.subscription.quantity) {
//         actualQuantity = order.subscription.quantity;
//       }

//       // Calculate edit deadline
//       const deliveryDay = new Date(order.deliveryDate);
//       const deadline = new Date(deliveryDay);
//       deadline.setDate(deadline.getDate() - 1);
//       deadline.setHours(18, 0, 0, 0);

//       // Only pending orders can be edited
//       const canEdit = new Date() < deadline && order.status === "pending";

//       return {
//         id: order.id,
//         orderNumber: order.orderNumberDisplay,
//         deliveryDate: order.deliveryDate,
//         nextRecurringDate: order.nextRecurringDate,
//         status: order.status,

//         // Exception information (if fields exist)
//         isException: isException,
//         exceptionType: order.exceptionType || null,
//         exceptionNotes: order.exceptionNotes || null,

//         // Quantity info
//         quantity: actualQuantity,
//         isException: isException,

//         // Item details
//         items: order.items.map((item) => ({
//           productId: item.product.id,
//           productName: item.product.name,
//           size: item.product.size,
//           isReusable: item.product.isReusable,
//           quantity: actualQuantity,
//           price: item.unitPrice,
//           total: item.totalPrice,
//           depositAmount: item.depositAmount,
//         })),

//         // Subscription details
//         subscription: order.subscription ? {
//           id: order.subscription.id,
//           status: order.subscription.status,
//           recurrence: order.subscription.recurrence,
//           nextDelivery: order.subscription.nextDeliveryDate,
//           totalDeliveries: order.subscription.totalDeliveries,
//           baseQuantity: order.subscription.quantity,
//         } : null,

//         // Edit permissions
//         canEdit: canEdit,
//         editDeadline: deadline,

//         // Additional info
//         withBottles: order.withBottles,
//         totalAmount: order.totalAmount,
//       };
//     });

//     res.json({
//       success: true,
//       orders: formatted,
//       total: formatted.length,
//       debugInfo: {
//         customerId,
//         queryTime: new Date().toISOString(),
//         statusFilter: ["pending", "assigned", "in_progress"],
//         foundCount: upcomingOrders.length,
//       },
//     });

//   } catch (err) {
//     console.error("Get Upcoming Orders Error:", err);
//     res.status(500).json({
//       error: "Failed to fetch upcoming orders",
//       details: err.message,
//       solution: "Check OrderStatus enum in Prisma schema",
//     });
//   }
// };

exports.getUpcomingRecurringOrders = async (req, res) => {
  try {
    const customerId = req.user.id;
    const tenantId = req.derivedTenantId;

    const now = new Date();
    console.log("Current time for query:", now.toISOString());

    // Get ALL upcoming orders - include TODAY and FUTURE
    const upcomingOrders = await prisma.order.findMany({
      where: {
        customerId,
        tenantId,
        isRecurring: true,
        // Include TODAY'S orders and FUTURE orders
        deliveryDate: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()), // Start of today
        },
        // Show ALL statuses except completed/cancelled/failed
        status: {
          notIn: ["completed", "cancelled", "failed", "delivered"],
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

    console.log(`Found ${upcomingOrders.length} upcoming orders`);

    // Format response
    const formatted = upcomingOrders.map((order) => {
      const deliveryDate = new Date(order.deliveryDate);
      const isToday = deliveryDate.toDateString() === now.toDateString();

      // Calculate edit deadline
      const deadline = new Date(deliveryDate);
      deadline.setDate(deadline.getDate() - 1);
      deadline.setHours(18, 0, 0, 0);

      const canEdit = now < deadline && order.status === "pending";

      return {
        id: order.id,
        orderNumber: order.orderNumberDisplay,
        deliveryDate: order.deliveryDate,
        isToday: isToday,
        status: order.status,
        items: order.items.map((item) => ({
          product: item.product.name,
          quantity: item.quantity,
          price: item.unitPrice,
          total: item.totalPrice,
        })),
        subscription: order.subscription
          ? {
              id: order.subscription.id, // ✅ subscription ID
              status: order.subscription.status,
              recurrence: order.subscription.recurrence,
              nextDelivery: order.subscription.nextDeliveryDate,
              totalDeliveries: order.subscription.totalDeliveries,
            }
          : null,
        canEdit: canEdit,
        editDeadline: deadline,
        daysUntilDelivery: Math.ceil(
          (deliveryDate - now) / (1000 * 60 * 60 * 24),
        ),
      };
    });

    res.json({
      success: true,
      orders: formatted,
      total: formatted.length,
      summary: {
        today: formatted.filter((o) => o.isToday).length,
        future: formatted.filter((o) => !o.isToday).length,
        canEdit: formatted.filter((o) => o.canEdit).length,
      },
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: err.message });
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
        today.getDate() + (daysUntilNext === 0 ? 7 : daysUntilNext),
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

// exports.toggleSubscription = async (req, res) => {
//   try {
//     const { subscriptionId } = req.params;
//     const { action } = req.body; // "PAUSE" or "RESUME"
//     const customerId = req.user.id;
//     const tenantId = req.derivedTenantId;

//     const subscription = await prisma.subscription.findFirst({
//       where: {
//         id: subscriptionId,
//         customerId,
//         tenantId,
//       },
//     });

//     if (!subscription) {
//       return res.status(404).json({ error: "Subscription not found" });
//     }

//     let updatedSubscription;
//     let message;

//     if (action === "PAUSE") {
//       // Cancel subscription and clear recurrence fields
//       updatedSubscription = await prisma.subscription.update({
//         where: { id: subscriptionId },
//         data: {
//           status: "CANCELLED",
//           recurrence: null,
//           deliveryDayOfWeek: null,
//           nextDeliveryDate: null,
//           preferredTime: null,
//           notificationTime: null,
//         },
//       });
//       message = "Subscription cancelled and recurrence removed.";
//     } else if (action === "RESUME") {
//       // Resume subscription and restore recurrence fields

//       // You may want to store default values somewhere or
//       // restore previous values if you saved them on pause.
//       // For this example, let's assume weekly recurrence on subscription.deliveryDayOfWeek

//       const today = new Date();
//       // Use previous deliveryDayOfWeek or default to Monday (1) if null
//       const dayOfWeek = subscription.deliveryDayOfWeek ?? 1;

//       // Calculate next delivery date from today and dayOfWeek
//       const daysUntilNext = (dayOfWeek - today.getDay() + 7) % 7;
//       const nextDate = new Date(today);
//       nextDate.setDate(today.getDate() + (daysUntilNext === 0 ? 7 : daysUntilNext));

//       updatedSubscription = await prisma.subscription.update({
//         where: { id: subscriptionId },
//         data: {
//           status: "ACTIVE",
//           recurrence: "WEEKLY",
//           deliveryDayOfWeek: dayOfWeek,
//           nextDeliveryDate: nextDate,
//           preferredTime: subscription.preferredTime || "MORNING", // default if null
//           notificationTime: subscription.notificationTime || 21, // default if null
//         },
//       });

//       message = `Subscription resumed. Next delivery: ${nextDate.toDateString()}`;
//     } else {
//       return res.status(400).json({ error: "Invalid action" });
//     }

//     res.json({
//       success: true,
//       message,
//       subscription: updatedSubscription,
//     });
//   } catch (err) {
//     console.error("Toggle Subscription Error:", err);
//     res.status(500).json({ error: "Failed to update subscription" });
//   }
// };
