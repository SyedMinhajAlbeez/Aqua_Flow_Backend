// src/utils/initCronJobs.js
const path = require("path");

console.log("🔄 Initializing Cron Jobs...");

// Import daily cron jobs
require("./dailyCronJobs");

// Import monthly cron jobs
require("./monthlyCron");

console.log("✅ All Cron Jobs Initialized Successfully");
