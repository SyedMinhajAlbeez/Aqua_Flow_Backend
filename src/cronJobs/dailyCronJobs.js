const prisma = require("../prisma/client");
const cron = require("node-cron");
const {
  sendPushNotification,
  sendSMS,
} = require("../utils/notificationService");

// =======================================================
// 1. DAILY: RESET DRIVER TODAY_DELIVERIES (12:05 AM)
// =======================================================
cron.schedule("5 0 * * *", async () => {
  console.log(
    "Cron: Resetting driver today_deliveries...",
    new Date().toLocaleString("en-PK")
  );

  try {
    await prisma.driver.updateMany({
      data: { todayDeliveries: 0 },
    });
    console.log("Success: Reset all driver daily delivery counts");
  } catch (error) {
    console.error("Error resetting driver deliveries:", error);
  }
});

// =======================================================
// 2. DAILY: CREATE NEXT WEEK'S RECURRING ORDERS (3 AM)
// =======================================================
cron.schedule("0 3 * * *", async () => {
  console.log(
    "Cron: Creating next week's recurring orders...",
    new Date().toLocaleString("en-PK")
  );

  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(0, 0, 0, 0);

    // Find subscriptions that need orders created for next week
    const subscriptions = await prisma.subscription.findMany({
      where: {
        status: "ACTIVE",
        nextDeliveryDate: {
          gte: tomorrow,
          lte: nextWeek,
        },
      },
      include: {
        customer: {
          include: {
            orders: {
              where: {
                status: { in: ["completed", "delivered"] },
                subscriptionId: { not: null },
              },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
        product: true,
        orders: {
          where: {
            deliveryDate: {
              gte: tomorrow,
              lte: nextWeek,
            },
          },
        },
      },
    });

    console.log(`Found ${subscriptions.length} subscriptions due next week`);

    let created = 0;
    let skipped = 0;

    for (const sub of subscriptions) {
      try {
        // Check if order already exists for this date
        const existingOrder = sub.orders.find(
          (order) =>
            order.deliveryDate.toDateString() ===
            sub.nextDeliveryDate.toDateString()
        );

        if (existingOrder) {
          console.log(
            `Skipped: Order already exists for subscription ${sub.id} on ${sub.nextDeliveryDate}`
          );
          skipped++;
          continue;
        }

        // === DETERMINE WITHBOTTLES ===
        // Default: withBottles = false (sirf refill)
        let withBottles = false;

        // Check if customer already received bottles from this subscription
        if (sub.customer.orders && sub.customer.orders.length > 0) {
          // Customer ke paas pehle se orders hain
          // Check karo ke koi order withBottles = true tha ya nahi
          const previousBottleOrder = sub.customer.orders.find(
            (order) =>
              order.subscriptionId === sub.id && order.withBottles === true
          );

          if (!previousBottleOrder) {
            // Pehli dafa bottles dena hai
            withBottles = true;
          }
        } else {
          // Customer ka pehla order hai
          withBottles = true;
        }

        // Check product stock (sirf product ka stock, bottle ka stock delivery time check hoga)
        const inventory = await prisma.productInventory.findUnique({
          where: {
            productId_tenantId: {
              productId: sub.productId,
              tenantId: sub.tenantId,
            },
          },
        });

        if (!inventory || inventory.currentStock < sub.quantity) {
          console.log(`Skipped: Insufficient stock for subscription ${sub.id}`);
          await prisma.subscription.update({
            where: { id: sub.id },
            data: { missedDeliveries: { increment: 1 } },
          });
          skipped++;
          continue;
        }

        // If withBottles true, check bottle inventory
        if (withBottles && sub.product.isReusable) {
          const bottleInventory = await prisma.bottleInventory.findUnique({
            where: { tenantId: sub.tenantId },
          });

          if (!bottleInventory || bottleInventory.inStock < sub.quantity) {
            console.log(
              `Skipped: Insufficient bottle stock for subscription ${sub.id}`
            );
            await prisma.subscription.update({
              where: { id: sub.id },
              data: { missedDeliveries: { increment: 1 } },
            });
            skipped++;
            continue;
          }
        }

        // Create the order
        await prisma.$transaction(async (tx) => {
          // Get order count for order number
          const orderCount = await tx.order.count({
            where: { tenantId: sub.tenantId },
          });

          // Calculate acceptable deposit amount
          const acceptableDepositAmount =
            withBottles && sub.product.isReusable
              ? sub.product.depositAmount * sub.quantity
              : 0;

          const order = await tx.order.create({
            data: {
              orderNumberDisplay: `#${1000 + orderCount + 1}`,
              customerId: sub.customerId,
              subscriptionId: sub.id,
              zoneId: sub.customer.zoneId || "",
              deliveryDate: sub.nextDeliveryDate,
              deliveryAddress: sub.customer.address,
              totalAmount:
                sub.quantity * sub.product.price + acceptableDepositAmount,
              acceptableDepositAmount,
              paymentMethod: "cash_on_delivery",
              status: "scheduled", // Special status for upcoming recurring orders
              tenantId: sub.tenantId,
              isRecurring: true,
              recurrence: sub.recurrence,
              withBottles: withBottles, // ← WITHBOTTLES FIELD SET
              nextRecurringDate: new Date(
                sub.nextDeliveryDate.getTime() + 7 * 24 * 60 * 60 * 1000
              ),
              items: {
                create: {
                  productId: sub.productId,
                  quantity: sub.quantity,
                  unitPrice: sub.product.price,
                  depositAmount:
                    withBottles && sub.product.isReusable
                      ? sub.product.depositAmount
                      : 0,
                  totalPrice: sub.quantity * sub.product.price,
                },
              },
            },
          });

          // Decrement product stock
          await tx.productInventory.update({
            where: {
              productId_tenantId: {
                productId: sub.productId,
                tenantId: sub.tenantId,
              },
            },
            data: {
              currentStock: { decrement: sub.quantity },
              totalSold: { increment: sub.quantity },
            },
          });

          // If withBottles true, update bottle inventory
          if (withBottles && sub.product.isReusable) {
            await tx.bottleInventory.upsert({
              where: { tenantId: sub.tenantId },
              update: {
                inStock: { decrement: sub.quantity },
                withCustomers: { increment: sub.quantity },
              },
              create: {
                tenantId: sub.tenantId,
                inStock: -sub.quantity,
                withCustomers: sub.quantity,
              },
            });

            // Update customer empties and bottlesGiven
            await tx.customer.update({
              where: { id: sub.customerId },
              data: {
                empties: { increment: sub.quantity },
                bottlesGiven: { increment: sub.quantity },
              },
            });
          }

          // Update subscription next delivery date
          const nextDate = new Date(sub.nextDeliveryDate);

          switch (sub.recurrence) {
            case "WEEKLY":
              nextDate.setDate(nextDate.getDate() + 7);
              break;
            case "BI_WEEKLY":
              nextDate.setDate(nextDate.getDate() + 14);
              break;
            case "MONTHLY":
              nextDate.setMonth(nextDate.getMonth() + 1);
              break;
          }

          await tx.subscription.update({
            where: { id: sub.id },
            data: {
              nextDeliveryDate: nextDate,
              totalDeliveries: { increment: 1 },
            },
          });

          console.log(
            `Created order #${order.orderNumberDisplay} for customer ${sub.customer.name} withBottles: ${withBottles}`
          );
          created++;
        });
      } catch (error) {
        console.error(
          `Error creating order for subscription ${sub.id}:`,
          error
        );
        skipped++;
      }
    }

    console.log(
      `Success: Created ${created} recurring orders for next week, Skipped: ${skipped}`
    );
  } catch (error) {
    console.error("Error creating recurring orders:", error);
  }
});

// =======================================================
// 3. DAILY: SEND NOTIFICATIONS FOR TOMORROW'S ORDERS (9 PM)
// =======================================================
cron.schedule("0 21 * * *", async () => {
  console.log(
    "Cron: Sending notifications for tomorrow's orders...",
    new Date().toLocaleString("en-PK")
  );

  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

    // Find scheduled orders for tomorrow
    const orders = await prisma.order.findMany({
      where: {
        deliveryDate: {
          gte: tomorrow,
          lt: tomorrowEnd,
        },
        status: "scheduled",
        notificationSent: false,
        isRecurring: true,
      },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
        subscription: true,
      },
    });

    let sent = 0;
    let failed = 0;

    for (const order of orders) {
      try {
        // Determine message based on withBottles
        let message = "";
        if (order.withBottles) {
          message = `🔔 Reminder: Your weekly ${
            order.items[0]?.product?.name || "water"
          } delivery is scheduled for tomorrow. Quantity: ${
            order.items[0]?.quantity || 1
          }. New bottles included.`;
        } else {
          message = `🔔 Reminder: Your weekly ${
            order.items[0]?.product?.name || "water"
          } refill is scheduled for tomorrow. Quantity: ${
            order.items[0]?.quantity || 1
          }. Please keep your empty bottles ready for exchange.`;
        }

        // Send push notification
        await sendPushNotification(order.customerId, {
          title: order.withBottles
            ? "New Bottles Delivery"
            : "Weekly Refill Reminder",
          body: message,
          data: {
            orderId: order.id,
            type: "RECURRING_REMINDER",
            withBottles: order.withBottles,
          },
        });

        // Send SMS (optional)
        if (order.customer.phone) {
          await sendSMS(order.customer.phone, message);
        }

        // Mark notification as sent
        await prisma.order.update({
          where: { id: order.id },
          data: { notificationSent: true },
        });

        console.log(
          `Notification sent for order ${order.orderNumberDisplay} to ${order.customer.name} withBottles: ${order.withBottles}`
        );
        sent++;
      } catch (error) {
        console.error(
          `Failed to send notification for order ${order.id}:`,
          error
        );
        failed++;
      }
    }

    console.log(`Success: Notifications sent ${sent}, Failed: ${failed}`);
  } catch (error) {
    console.error("Error sending notifications:", error);
  }
});

// =======================================================
// 4. DAILY: CONVERT SCHEDULED ORDERS TO PENDING (6 AM)
// =======================================================
cron.schedule("0 6 * * *", async () => {
  console.log(
    "Cron: Converting today's scheduled orders to pending...",
    new Date().toLocaleString("en-PK")
  );

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayEnd = new Date(today);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // Find scheduled orders for today
    const orders = await prisma.order.updateMany({
      where: {
        deliveryDate: {
          gte: today,
          lt: todayEnd,
        },
        status: "scheduled",
      },
      data: {
        status: "pending", // Now ready for driver assignment
      },
    });

    console.log(
      `Success: Converted ${orders.count} scheduled orders to pending`
    );

    // Also update lastDeliveredDate for subscriptions of completed deliveries
    const completedOrders = await prisma.order.findMany({
      where: {
        deliveryDate: {
          gte: today,
          lt: todayEnd,
        },
        status: "completed",
        isRecurring: true,
        subscriptionId: { not: null },
      },
      select: { subscriptionId: true },
    });

    for (const order of completedOrders) {
      if (order.subscriptionId) {
        await prisma.subscription.update({
          where: { id: order.subscriptionId },
          data: { lastDeliveredDate: new Date() },
        });
      }
    }
  } catch (error) {
    console.error("Error converting orders:", error);
  }
});

// =======================================================
// 5. MONTHLY: CLEANUP OLD SUBSCRIPTIONS (1st of month, 12 AM)
// =======================================================
cron.schedule("0 0 1 * *", async () => {
  console.log(
    "Cron: Cleaning up old subscriptions...",
    new Date().toLocaleString("en-PK")
  );

  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Cancel subscriptions with no activity for 6 months
    const result = await prisma.subscription.updateMany({
      where: {
        status: "ACTIVE",
        OR: [
          {
            lastDeliveredDate: {
              lt: sixMonthsAgo,
            },
          },
          {
            AND: [
              { lastDeliveredDate: null },
              { updatedAt: { lt: sixMonthsAgo } },
            ],
          },
        ],
      },
      data: {
        status: "EXPIRED",
      },
    });

    console.log(`Success: Expired ${result.count} inactive subscriptions`);
  } catch (error) {
    console.error("Error cleaning up subscriptions:", error);
  }
});

// =======================================================
// 6. DAILY: CHECK FOR MISSED DELIVERIES (8 PM) - UPDATED WITH PAYMENT CHECK
// =======================================================
cron.schedule("0 20 * * *", async () => {
  console.log(
    "Cron: Checking for missed deliveries...",
    new Date().toLocaleString("en-PK")
  );

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayEnd = new Date(today);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // Find pending orders from today that weren't delivered
    const missedOrders = await prisma.order.findMany({
      where: {
        deliveryDate: {
          gte: today,
          lt: todayEnd,
        },
        status: {
          in: ["pending", "in_progress"],
        },
        // ✅ Don't mark failed if payment already collected
        OR: [{ paymentStatus: { not: "PAID" } }, { paymentStatus: null }],
      },
      include: {
        customer: true,
        subscription: true,
        payment: true, // Check if payment exists
      },
    });

    for (const order of missedOrders) {
      try {
        // ✅ Skip if immediate payment was already collected
        if (order.payment && order.payment.status === "PAID") {
          console.log(
            `Skipping order ${order.orderNumberDisplay} - payment already collected`
          );
          continue;
        }

        // Mark as failed
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "failed",
            paymentStatus: "CANCELLED", // Update payment status too
          },
        });

        // Update subscription missed count
        if (order.subscriptionId) {
          await prisma.subscription.update({
            where: { id: order.subscriptionId },
            data: { missedDeliveries: { increment: 1 } },
          });
        }

        // ✅ Cancel any pending immediate payment
        if (order.paymentId && order.payment?.status === "PENDING") {
          await prisma.payment.update({
            where: { id: order.paymentId },
            data: { status: "CANCELLED" },
          });
        }

        console.log(
          `Marked order ${order.orderNumberDisplay} as failed (missed delivery)`
        );
      } catch (error) {
        console.error(`Error processing missed order ${order.id}:`, error);
      }
    }

    console.log(
      `Success: Checked ${missedOrders.length} potentially missed deliveries`
    );
  } catch (error) {
    console.error("Error checking missed deliveries:", error);
  }
});

// =======================================================
// 7. HOURLY: CHECK FOR STOCK ALERTS (Every 4 hours)
// =======================================================
cron.schedule("0 */4 * * *", async () => {
  console.log(
    "Cron: Checking for low stock alerts...",
    new Date().toLocaleString("en-PK")
  );

  try {
    // Find products with low stock
    const lowStockProducts = await prisma.productInventory.findMany({
      where: {
        currentStock: {
          lt: 10, // Threshold for low stock
        },
      },
      include: {
        product: true,
        tenant: {
          include: {
            keeper: true, // Company admin
          },
        },
      },
    });

    for (const inventory of lowStockProducts) {
      try {
        // Send notification to company admin
        const message = `⚠️ Low Stock Alert: ${inventory.product.name} (${inventory.product.size}) has only ${inventory.currentStock} units left. Please restock soon.`;

        if (inventory.tenant.keeper) {
          await sendPushNotification(inventory.tenant.keeper.id, {
            title: "Low Stock Alert",
            body: message,
            data: {
              productId: inventory.product.id,
              type: "LOW_STOCK_ALERT",
            },
          });
        }

        console.log(
          `Sent low stock alert for ${inventory.product.name} to tenant ${inventory.tenant.name}`
        );
      } catch (error) {
        console.error(
          `Failed to send alert for product ${inventory.productId}:`,
          error
        );
      }
    }

    console.log(`Checked ${lowStockProducts.length} products for low stock`);
  } catch (error) {
    console.error("Error checking low stock:", error);
  }
});

// =======================================================
// 8. DAILY: UPDATE CUSTOMER STATUSES (12:30 AM)
// =======================================================
cron.schedule("30 0 * * *", async () => {
  console.log(
    "Cron: Updating customer statuses...",
    new Date().toLocaleString("en-PK")
  );

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // Update sleeping customers (no order for 30 days)
    await prisma.customer.updateMany({
      where: {
        lastOrderDate: {
          lt: thirtyDaysAgo,
        },
        status: "active",
      },
      data: {
        status: "sleeping",
        sleepingSince: new Date(),
      },
    });

    // Update overdue customers (no order for 60 days)
    await prisma.customer.updateMany({
      where: {
        lastOrderDate: {
          lt: sixtyDaysAgo,
        },
        status: { in: ["active", "sleeping"] },
      },
      data: {
        status: "overdue",
      },
    });

    console.log("Success: Updated customer statuses");
  } catch (error) {
    console.error("Error updating customer statuses:", error);
  }
});

// =======================================================
// 9. MONTHLY: GENERATE PAYMENTS FOR RECURRING ORDERS (1st of month, 2 AM)
// =======================================================
cron.schedule("0 2 1 * *", async () => {
  console.log(
    "Cron: Generating monthly payments for recurring orders...",
    new Date().toLocaleString("en-PK")
  );

  try {
    // Get all tenants
    const tenants = await prisma.tenant.findMany({
      where: { status: "active" },
    });

    let totalGenerated = 0;

    for (const tenant of tenants) {
      try {
        // Get all completed recurring orders from previous month
        const currentDate = new Date();
        const previousMonthStart = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth() - 1,
          1
        );
        const previousMonthEnd = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          0
        );

        console.log(
          `Processing tenant ${
            tenant.name
          }: ${previousMonthStart.toDateString()} to ${previousMonthEnd.toDateString()}`
        );

        // Find subscriptions with completed orders in previous month
        const subscriptions = await prisma.subscription.findMany({
          where: {
            tenantId: tenant.id,
            status: "ACTIVE",
            orders: {
              some: {
                deliveryDate: {
                  gte: previousMonthStart,
                  lte: previousMonthEnd,
                },
                status: "completed",
                paymentId: null, // Not already linked to a payment
                isRecurring: true,
              },
            },
          },
          include: {
            customer: true,
            product: true,
            orders: {
              where: {
                deliveryDate: {
                  gte: previousMonthStart,
                  lte: previousMonthEnd,
                },
                status: "completed",
                paymentId: null,
                isRecurring: true,
              },
              include: {
                items: {
                  include: {
                    product: true,
                  },
                },
              },
            },
          },
        });

        console.log(
          `Found ${subscriptions.length} subscriptions with completed orders in previous month`
        );

        for (const subscription of subscriptions) {
          if (subscription.orders.length === 0) continue;

          // Calculate total amount for the month
          let totalAmount = 0;
          const paymentItems = [];

          for (const order of subscription.orders) {
            for (const item of order.items) {
              totalAmount += item.totalPrice;

              paymentItems.push({
                orderId: order.id,
                orderItemId: item.id,
                productName: item.product.name,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                depositAmount: item.depositAmount,
                totalAmount: item.totalPrice,
              });
            }
          }

          if (totalAmount === 0) continue;

          // Create monthly payment record
          const payment = await prisma.payment.create({
            data: {
              paymentNumber: `PAY-${Date.now()}-${Math.random()
                .toString(36)
                .substr(2, 9)}`,
              customerId: subscription.customerId,
              tenantId: tenant.id,
              subscriptionId: subscription.id,
              amount: totalAmount,
              pendingAmount: totalAmount,
              collectionType: "MONTHLY",
              dueDate: new Date(
                currentDate.getFullYear(),
                currentDate.getMonth(),
                5
              ), // 5th of current month
              month: currentDate.getMonth(), // Previous month (0-indexed)
              year: currentDate.getFullYear(),
              cycleStartDate: previousMonthStart,
              cycleEndDate: previousMonthEnd,
              status: "PENDING",
              paymentMethod: "cash_on_delivery",
              PaymentItem: {
                create: paymentItems,
              },
            },
          });

          // Link orders to this payment
          await prisma.order.updateMany({
            where: {
              id: {
                in: subscription.orders.map((o) => o.id),
              },
            },
            data: {
              paymentId: payment.id,
            },
          });

          // Update customer due amount
          await prisma.customer.update({
            where: { id: subscription.customerId },
            data: {
              dueAmount: { increment: totalAmount },
            },
          });

          totalGenerated++;
          console.log(
            `Created payment ${payment.paymentNumber} for ${subscription.customer.name}: Rs${totalAmount}`
          );
        }

        console.log(
          `Generated payments for ${subscriptions.length} subscriptions in tenant ${tenant.name}`
        );
      } catch (error) {
        console.error(
          `Error generating payments for tenant ${tenant.name}:`,
          error
        );
      }
    }

    console.log(`Success: Generated ${totalGenerated} monthly payments`);
  } catch (error) {
    console.error("Error generating monthly payments:", error);
  }
});

// =======================================================
// 10. DAILY: SEND PAYMENT DUE REMINDERS (10 AM)
// =======================================================
cron.schedule("0 10 * * *", async () => {
  console.log(
    "Cron: Sending payment due reminders...",
    new Date().toLocaleString("en-PK")
  );

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Payments due in next 3 days
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);

    const duePayments = await prisma.payment.findMany({
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        dueDate: {
          gte: today,
          lte: threeDaysLater,
        },
      },
      include: {
        customer: {
          include: {
            orders: {
              where: {
                paymentId: { not: null },
              },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
        subscription: {
          include: {
            product: true,
          },
        },
      },
    });

    let sent = 0;
    let failed = 0;

    for (const payment of duePayments) {
      try {
        const daysUntilDue = Math.ceil(
          (payment.dueDate - today) / (1000 * 60 * 60 * 24)
        );

        let message = "";
        let title = "";

        if (daysUntilDue === 0) {
          title = "Payment Due Today";
          message = `📅 Payment Due Today: Rs${
            payment.pendingAmount
          } for your monthly ${
            payment.subscription?.product?.name || "subscription"
          } is due today.`;
        } else if (daysUntilDue === 1) {
          title = "Payment Due Tomorrow";
          message = `📅 Payment Due Tomorrow: Rs${
            payment.pendingAmount
          } for your monthly ${
            payment.subscription?.product?.name || "subscription"
          } is due tomorrow.`;
        } else {
          title = "Payment Due Soon";
          message = `📅 Payment Due in ${daysUntilDue} days: Rs${
            payment.pendingAmount
          } for your monthly ${
            payment.subscription?.product?.name || "subscription"
          }.`;
        }

        // Send notification
        if (payment.customer) {
          await sendPushNotification(payment.customer.id, {
            title: title,
            body: message,
            data: {
              paymentId: payment.id,
              type: "PAYMENT_REMINDER",
              amount: payment.pendingAmount,
              dueDate: payment.dueDate,
            },
          });

          // Send SMS (optional)
          if (payment.customer.phone) {
            await sendSMS(payment.customer.phone, message);
          }

          sent++;
          console.log(
            `Sent payment reminder to ${payment.customer.name} for payment ${payment.paymentNumber}`
          );
        }
      } catch (error) {
        console.error(
          `Failed to send payment reminder for payment ${payment.id}:`,
          error
        );
        failed++;
      }
    }

    console.log(
      `Success: Sent ${sent} payment due reminders, Failed: ${failed}`
    );
  } catch (error) {
    console.error("Error sending payment reminders:", error);
  }
});

// =======================================================
// 11. DAILY: MARK OVERDUE PAYMENTS (12:00 PM)
// =======================================================
cron.schedule("0 12 * * *", async () => {
  console.log(
    "Cron: Marking overdue payments...",
    new Date().toLocaleString("en-PK")
  );

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Mark payments that are past due date as OVERDUE
    const overdueCount = await prisma.payment.updateMany({
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        dueDate: {
          lt: today,
        },
      },
      data: {
        status: "OVERDUE",
      },
    });

    console.log(`Success: Marked ${overdueCount.count} payments as OVERDUE`);

    // Send notifications for newly overdue payments
    if (overdueCount.count > 0) {
      const overduePayments = await prisma.payment.findMany({
        where: {
          status: "OVERDUE",
          dueDate: {
            lt: today,
            gte: new Date(today.getTime() - 24 * 60 * 60 * 1000), // Became overdue in last 24 hours
          },
        },
        include: {
          customer: true,
        },
      });

      for (const payment of overduePayments) {
        try {
          if (payment.customer) {
            await sendPushNotification(payment.customer.id, {
              title: "Payment Overdue",
              body: `⚠️ Your payment of Rs${payment.pendingAmount} is overdue. Please pay as soon as possible.`,
              data: {
                paymentId: payment.id,
                type: "PAYMENT_OVERDUE",
                amount: payment.pendingAmount,
              },
            });
          }
        } catch (error) {
          console.error(
            `Failed to send overdue notification for payment ${payment.id}:`,
            error
          );
        }
      }
    }
  } catch (error) {
    console.error("Error marking overdue payments:", error);
  }
});

// =======================================================
// 12. WEEKLY: UPDATE DRIVER RATINGS (Sunday at 11 PM)
// =======================================================
cron.schedule("0 23 * * 0", async () => {
  console.log(
    "Cron: Updating driver ratings...",
    new Date().toLocaleString("en-PK")
  );

  try {
    // Get all drivers with ratings
    const drivers = await prisma.driver.findMany({
      where: {
        totalRatings: { gt: 0 },
      },
    });

    let updated = 0;

    for (const driver of drivers) {
      try {
        // Calculate average rating (you might want to fetch actual ratings from a separate table)
        // For now, we're just updating based on existing rating field
        // You can implement actual rating calculation logic here

        console.log(
          `Driver ${driver.name} has rating ${driver.rating} from ${driver.totalRatings} ratings`
        );
        updated++;
      } catch (error) {
        console.error(`Error updating rating for driver ${driver.id}:`, error);
      }
    }

    console.log(`Success: Updated ratings for ${updated} drivers`);
  } catch (error) {
    console.error("Error updating driver ratings:", error);
  }
});

console.log(`
✅ Daily Cron Jobs Initialized
================================
Schedule:
1. 12:05 AM  - Reset driver deliveries
2. 12:30 AM  - Update customer statuses
3. 2:00 AM (1st) - Generate monthly payments
4. 3:00 AM   - Create next week's recurring orders
5. 6:00 AM   - Convert scheduled → pending
6. 10:00 AM  - Send payment due reminders
7. 12:00 PM  - Mark overdue payments
8. Every 4h  - Low stock alerts
9. 8:00 PM   - Check missed deliveries
10. 9:00 PM  - Send tomorrow's notifications
11. 11:00 PM (Sun) - Update driver ratings
12. 12:00 AM (1st) - Cleanup old subscriptions
================================
`);




// ... all your existing cron schedules ...

// ────────────────────────────────────────────────────────────────
// TEMP: Force-run recurring order creation NOW – for testing
// Remove or comment out after testing
// ────────────────────────────────────────────────────────────────
// (async () => {
//   console.log("═══════════════════════════════════════════════");
//   console.log("FORCE-RUNNING recurring order creation at", new Date().toLocaleString("en-PK"));
//   console.log("═══════════════════════════════════════════════");

//   try {
//     const tomorrow = new Date();
//     tomorrow.setDate(tomorrow.getDate() + 1);
//     tomorrow.setHours(0, 0, 0, 0);

//     const nextWeek = new Date();
//     nextWeek.setDate(nextWeek.getDate() + 7);
//     nextWeek.setHours(0, 0, 0, 0);

//     // ── Copy-paste or extract the full logic from your 3 AM cron here ──
//     const subscriptions = await prisma.subscription.findMany({
//       where: {
//         status: "ACTIVE",
//         nextDeliveryDate: {
//           gte: tomorrow,
//           lte: nextWeek,
//         },
//       },
//       include: {
//         customer: {
//           include: {
//             orders: {
//               where: {
//                 status: { in: ["completed", "delivered"] },
//                 subscriptionId: { not: null },
//               },
//               orderBy: { createdAt: "desc" },
//               take: 1,
//             },
//           },
//         },
//         product: true,
//         orders: {
//           where: {
//             deliveryDate: {
//               gte: tomorrow,
//               lte: nextWeek,
//             },
//           },
//         },
//       },
//     });

//     console.log(`Found ${subscriptions.length} subscriptions eligible right now`);

//     let created = 0;
//     let skipped = 0;

//     for (const sub of subscriptions) {
//       console.log(`Processing sub ${sub.id} → next: ${sub.nextDeliveryDate.toISOString()}`);

//       const existingOrder = sub.orders.find(
//         (o) => o.deliveryDate.toDateString() === sub.nextDeliveryDate.toDateString()
//       );

//       if (existingOrder) {
//         console.log(`  → skipped (order already exists)`);
//         skipped++;
//         continue;
//       }

//       // ... rest of your loop logic: stock checks, withBottles calculation, transaction, etc. ...
//       // (paste the full body here – I shortened it for brevity)

//       // At the end of successful creation:
//       created++;
//       console.log(`  → CREATED order for ${sub.nextDeliveryDate.toISOString()}`);
//     }

//     console.log(`Force-run finished: created ${created}, skipped ${skipped}`);
//   } catch (err) {
//     console.error("Force-run failed:", err);
//   }
// })();

module.exports = cron;
