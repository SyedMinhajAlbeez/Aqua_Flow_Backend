// paymentRoutes.js
const express = require("express");
const router = express.Router();
const {
  collectPayment,
  getTodaysPayments,
  getPaymentReports,
  getDriverCollectionHistory,
} = require("../controllers/paymentController");

// Driver routes
router.get("/today", getTodaysPayments);
router.get("/history", getDriverCollectionHistory);
router.post("/collect", collectPayment);

// Admin routes for Reports & Analytics
router.get("/reports", getPaymentReports);

module.exports = router;
