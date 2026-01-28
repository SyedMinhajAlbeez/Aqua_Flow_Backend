const prisma = require("../prisma/client");
const cron = require("node-cron");
const { sendPushNotification } = require("../utils/notificationService");
const { generateInvoiceForCompany } = require("../services/invoiceService");


// =======================================================
// MONTHLY INVOICE GENERATION (1st of month, 12:01 AM)
// =======================================================
cron.schedule("1 0 1 * *", async () => {
  console.log(
    "💰 Cron: Starting monthly invoice generation for all companies...",
    new Date().toLocaleString("en-PK")
  );

  try {
    // 1. Calculate previous month period
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-based (Jan=0)

    // Calculate previous month
    let previousYear = currentYear;
    let previousMonth = currentMonth - 1;

    if (previousMonth < 0) {
      previousMonth = 11; // December
      previousYear = currentYear - 1;
    }

    // Set period for previous month
    const periodStart = new Date(previousYear, previousMonth, 1);
    const periodEnd = new Date(previousYear, previousMonth + 1, 0, 23, 59, 59, 999);

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    console.log(`📅 Invoice Period: ${monthNames[previousMonth]} ${previousYear} (${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]})`);

    // 2. Get all active companies
    const tenants = await prisma.tenant.findMany({
      where: {
        status: "active",
        // Optional: Only companies with orders in that period
        orders: {
          some: {
            deliveryDate: {
              gte: periodStart,
              lte: periodEnd
            },
            status: { in: ["delivered", "completed"] }
          }
        }
      },
      include: {
        keeper: true,
      },
    });

    console.log(`🏢 Found ${tenants.length} active companies to process`);

    // 3. Generate invoice for each company
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const results = [];

    for (const tenant of tenants) {
      try {
        console.log(`📝 Processing ${tenant.name}...`);

        // Check if invoice already exists for this period
        const existingInvoice = await prisma.invoice.findFirst({
          where: {
            companyId: tenant.id,
            periodStart,
            periodEnd
          }
        });

        if (existingInvoice) {
          console.log(`   ⏭️  Invoice already exists for ${tenant.name} (ID: ${existingInvoice.id})`);
          skippedCount++;
          results.push({
            company: tenant.name,
            status: "skipped",
            reason: "Invoice already exists",
            invoiceId: existingInvoice.id
          });
          continue;
        }

        // Generate invoice
        const invoiceResult = await generateInvoiceForCompany(
          tenant.id,
          periodStart,
          periodEnd
        );

        if (invoiceResult.invoice) {
          console.log(`   ✅ Invoice generated: ${invoiceResult.invoice.id} (Amount: ${invoiceResult.invoice.totalAmount})`);
          successCount++;

          results.push({
            company: tenant.name,
            status: "success",
            invoiceId: invoiceResult.invoice.id,
            amount: invoiceResult.invoice.totalAmount,
            message: invoiceResult.message
          });

          // Send notification to company admin
          if (tenant.keeper) {
            const message = `📄 Monthly Invoice Generated (${monthNames[previousMonth]} ${previousYear}):\n` +
              `• Invoice ID: ${invoiceResult.invoice.id.substring(0, 8)}...\n` +
              `• Period: ${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]}\n` +
              `• Amount: Pkr${invoiceResult.invoice.totalAmount}\n` +
              `• Status: ${invoiceResult.invoice.billingStatus}\n\n` +
              `Please check your invoice section for details.`;

            await sendPushNotification(tenant.keeper.id, {
              title: "Monthly Invoice Generated",
              body: message,
              data: {
                type: "INVOICE_GENERATED",
                invoiceId: invoiceResult.invoice.id,
                month: previousMonth + 1,
                year: previousYear,
                tenantId: tenant.id,
              },
            });

            console.log(`   📱 Notification sent to ${tenant.keeper.name}`);
          }
        } else {
          console.log(`   ℹ️  No invoice generated for ${tenant.name}: ${invoiceResult.message}`);
          skippedCount++;
          results.push({
            company: tenant.name,
            status: "no_orders",
            message: invoiceResult.message
          });
        }

      } catch (error) {
        console.error(`   ❌ Error processing ${tenant.name}:`, error.message);
        errorCount++;
        results.push({
          company: tenant.name,
          status: "error",
          error: error.message
        });
      }

      // Small delay to avoid overwhelming database
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // 4. Log summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 MONTHLY INVOICE GENERATION SUMMARY");
    console.log("=".repeat(60));
    console.log(`Period: ${monthNames[previousMonth]} ${previousYear}`);
    console.log(`✅ Successfully Generated: ${successCount} invoices`);
    console.log(`⏭️  Skipped (Already exists): ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`⏰ Completed at: ${new Date().toLocaleString("en-PK")}`);
    console.log("=".repeat(60) + "\n");

    // 5. Optional: Send summary notification to super admin
    if (errorCount > 0) {
      // You could send an alert to admin about failed invoices
      console.warn(`⚠️  ${errorCount} companies failed invoice generation`);
    }

  } catch (error) {
    console.error("💥 Critical error in monthly invoice generation cron:", error);
  }
});

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






async function manuallyGenerateMonthlyInvoices(month = "previous") {
  console.log("🔄 Manual trigger: Generating monthly invoices...");

  let periodStart, periodEnd;
  const now = new Date();

  if (month === "previous") {
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let previousYear = currentYear;
    let previousMonth = currentMonth - 1;

    if (previousMonth < 0) {
      previousMonth = 11;
      previousYear = currentYear - 1;
    }

    periodStart = new Date(previousYear, previousMonth, 1);
    periodEnd = new Date(previousYear, previousMonth + 1, 0, 23, 59, 59, 999);
  } else {
    // Specific month in format "YYYY-MM"
    const [year, monthNum] = month.split("-").map(Number);
    periodStart = new Date(year, monthNum - 1, 1);
    periodEnd = new Date(year, monthNum, 0, 23, 59, 59, 999);
  }

  console.log(`Period: ${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]}`);

  try {
    const tenants = await prisma.tenant.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
    });

    const results = [];
    for (const tenant of tenants) {
      try {
        const result = await generateInvoiceForCompany(tenant.id, periodStart, periodEnd);
        results.push({
          company: tenant.name,
          success: !!result.invoice,
          invoiceId: result.invoice?.id,
          message: result.message
        });
        console.log(`✅ ${tenant.name}: ${result.message}`);
      } catch (error) {
        console.error(`❌ ${tenant.name}: ${error.message}`);
      }
    }

    return { success: true, periodStart, periodEnd, results };
  } catch (error) {
    console.error("Manual generation failed:", error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  cron,
  manuallyGenerateMonthlyInvoices
};