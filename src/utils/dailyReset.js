// src/utils/dailyReset.js
const prisma = require("../prisma/client");
const cron = require("node-cron");

// Har roz 12:05 AM pe todayDeliveries = 0
cron.schedule("5 0 * * *", async () => {
  try {
    console.log("Resetting today deliveries for all drivers...");
    await prisma.driver.updateMany({
      data: { todayDeliveries: 0 },
    });
    console.log("Daily reset completed!");
  } catch (err) {
    console.error("Daily reset failed:", err);
  }
});

// Start immediately
module.exports = cron;
