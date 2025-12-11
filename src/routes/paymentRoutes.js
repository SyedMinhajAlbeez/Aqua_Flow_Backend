// paymentRoutes.js
const express = require("express");
const router = express.Router();
const {
  getCustomerPayments,
  collectPayment,
  getTodaysPayments,
  getPaymentReports,
  getPaymentById,
  getAllPayments,
  updatePayment,
  deletePayment,
  getDriverCollectionHistory,
} = require("../controllers/paymentController");

// Driver routes
router.get("/today", getTodaysPayments);
router.get("/history", getDriverCollectionHistory);
router.post("/collect", collectPayment);

// Customer routes
router.get("/customer/history", getCustomerPayments);

// Admin routes
router.get("/reports", getPaymentReports);
router.get("/all", getAllPayments);
router.get("/:id", getPaymentById);
router.put("/:id", updatePayment);
router.delete("/:id", deletePayment);

module.exports = router;
