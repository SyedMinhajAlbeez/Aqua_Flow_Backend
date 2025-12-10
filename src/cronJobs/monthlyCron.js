const prisma = require("../prisma/client");
const cron = require("node-cron");
const { sendPushNotification } = require("../utils/notificationService");

// =======================================================
// MONTHLY FINANCIAL REPORT GENERATION (Last day of month, 11 PM)
// =======================================================
cron.schedule("0 23 28-31 * *", async () => {
  console.log(
    "Cron: Generating monthly financial reports...",
    new Date().toLocaleString("en-PK")
  );

  try {
    const today = new Date();
    const lastDayOfMonth = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0
    );

    // Only run on the last day of the month
    if (today.getDate() !== lastDayOfMonth.getDate()) {
      console.log("Skipping: Not the last day of month");
      return;
    }

    // Get all tenants
    const tenants = await prisma.tenant.findMany({
      where: { status: "active" },
      include: {
        keeper: true,
      },
    });

    for (const tenant of tenants) {
      try {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        // Monthly statistics
        const [orderStats, paymentStats, customerStats] = await Promise.all([
          // Order statistics
          prisma.order.aggregate({
            where: {
              tenantId: tenant.id,
              createdAt: {
                gte: monthStart,
                lte: monthEnd,
              },
            },
            _sum: {
              totalAmount: true,
            },
            _count: true,
          }),

          // Payment statistics
          prisma.payment.aggregate({
            where: {
              tenantId: tenant.id,
              paymentDate: {
                gte: monthStart,
                lte: monthEnd,
              },
              status: "PAID",
            },
            _sum: {
              amount: true,
              paidAmount: true,
            },
            _count: true,
          }),

          // Customer statistics
          prisma.customer.aggregate({
            where: {
              tenantId: tenant.id,
              createdAt: {
                gte: monthStart,
                lte: monthEnd,
              },
            },
            _count: true,
          }),
        ]);

        const report = {
          tenantName: tenant.name,
          month: today.getMonth() + 1,
          year: today.getFullYear(),
          orders: {
            total: orderStats._count,
            revenue: orderStats._sum.totalAmount || 0,
          },
          payments: {
            collected: paymentStats._sum.paidAmount || 0,
            transactions: paymentStats._count,
          },
          customers: {
            new: customerStats._count,
          },
          summary: {
            netRevenue: orderStats._sum.totalAmount || 0,
            collectionRate:
              orderStats._count > 0
                ? (
                    ((paymentStats._sum.paidAmount || 0) /
                      (orderStats._sum.totalAmount || 1)) *
                    100
                  ).toFixed(2)
                : 0,
          },
        };

        // Send report to company admin
        if (tenant.keeper) {
          const message =
            `📊 Monthly Report (${today.toLocaleString("default", {
              month: "long",
            })} ${today.getFullYear()}):\n` +
            `• Orders: ${report.orders.total}\n` +
            `• Revenue: ₹${report.orders.revenue}\n` +
            `• Payments Collected: ₹${report.payments.collected}\n` +
            `• New Customers: ${report.customers.new}\n` +
            `• Collection Rate: ${report.summary.collectionRate}%`;

          await sendPushNotification(tenant.keeper.id, {
            title: "Monthly Financial Report",
            body: message,
            data: {
              type: "MONTHLY_REPORT",
              month: report.month,
              year: report.year,
              tenantId: tenant.id,
            },
          });

          console.log(
            `Sent monthly report to ${tenant.keeper.name} for ${tenant.name}`
          );
        }

        // You can also store this report in the database
        await prisma.monthlyReport.create({
          data: {
            tenantId: tenant.id,
            month: report.month,
            year: report.year,
            totalOrders: report.orders.total,
            totalRevenue: report.orders.revenue,
            collectedPayments: report.payments.collected,
            newCustomers: report.customers.new,
            collectionRate: parseFloat(report.summary.collectionRate),
          },
        });
      } catch (error) {
        console.error(
          `Error generating report for tenant ${tenant.name}:`,
          error
        );
      }
    }

    console.log("Success: Generated monthly financial reports");
  } catch (error) {
    console.error("Error generating monthly reports:", error);
  }
});

// =======================================================
// MONTHLY SUBSCRIPTION CLEANUP (15th of month, 1 AM)
// =======================================================
cron.schedule("0 1 15 * *", async () => {
  console.log(
    "Cron: Monthly subscription cleanup...",
    new Date().toLocaleString("en-PK")
  );

  try {
    // Find subscriptions with excessive missed deliveries
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const result = await prisma.subscription.updateMany({
      where: {
        OR: [
          {
            missedDeliveries: { gte: 4 }, // 4 or more missed deliveries
            lastDeliveredDate: { lt: threeMonthsAgo },
          },
          {
            status: "ACTIVE",
            lastDeliveredDate: null,
            createdAt: { lt: threeMonthsAgo },
          },
        ],
      },
      data: {
        status: "CANCELLED",
      },
    });

    console.log(`Success: Cancelled ${result.count} inactive subscriptions`);
  } catch (error) {
    console.error("Error in monthly subscription cleanup:", error);
  }
});

module.exports = cron;
