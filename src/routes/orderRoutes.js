// src/routes/orderRoutes.js
const express = require("express");
const router = express.Router();

const {
  createOrder,
  getOrders,
  updateOrderStatus,
  getOrderById,
  cancelOrder,
  getOrderStats,
} = require("../controllers/orderController");

// Admin Order routes

router.post("/create", createOrder);
router.get("/all", getOrders);

router.get("/getOrdersStats", getOrderStats);
router.patch("/status/:id", updateOrderStatus);
router.get("/:id", getOrderById);
router.patch("/cancel/:id", cancelOrder);

module.exports = router;
