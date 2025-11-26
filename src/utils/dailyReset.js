// src/utils/dailyCronJobs.js

const prisma = require("../prisma/client");
const cron = require("node-cron");

// =======================================================
// 1. Har roz 12:05 AM pe – Drivers ka todayDeliveries reset
// =======================================================
cron.schedule("5 0 * * *", async () => {
  console.log(
    "Cron Running → Resetting todayDeliveries for all drivers...",
    new Date().toLocaleString("en-PK")
  );

  try {
    const result = await prisma.driver.updateMany({
      data: {
        todayDeliveries: 0,
      },
    });
    console.log(
      `Success: Reset todayDeliveries = 0 for ${result.count} drivers`
    );
  } catch (error) {
    console.error("Failed: Driver daily reset cron", error.message);
  }
});

// =======================================================
// 2. Har roz 2:00 AM pe – Customers ka nextEligibleDate update (✅ 7 DAYS)
// =======================================================
cron.schedule("0 2 * * *", async () => {
  console.log(
    "Cron Running → Updating nextEligibleDate for all customers...",
    new Date().toLocaleString("en-PK")
  );

  try {
    // ✅ Jinka lastOrderDate hai → +7 days (CHANGED FROM 14)
    const updated1 = await prisma.$executeRaw`
      UPDATE customers 
      SET "nextEligibleDate" = "lastOrderDate" + INTERVAL '7 days',
          "updatedAt" = NOW()
      WHERE "lastOrderDate" IS NOT NULL
        AND ("nextEligibleDate" IS NULL OR "nextEligibleDate" != "lastOrderDate" + INTERVAL '7 days')
    `;

    // Jinka kabhi order nahi → aaj se eligible
    const updated2 = await prisma.$executeRaw`
      UPDATE customers 
      SET "nextEligibleDate" = NOW(),
          "updatedAt" = NOW()
      WHERE "lastOrderDate" IS NULL 
        AND "nextEligibleDate" IS NULL
    `;

    console.log(
      `Success: Updated nextEligibleDate → ${updated1} (with order) + ${updated2} (new customers)`
    );
  } catch (error) {
    console.error("Failed: nextEligibleDate cron", error.message);
  }
});

console.log(
  "Daily Cron Jobs Initialized (Driver Reset: 12:05 AM | Eligible Date: 2:00 AM) - 7 DAYS CYCLE"
);

// Export cron instance (agar future mein stop/start karna ho)
module.exports = cron;
