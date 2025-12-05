// src/routes/orderRoutes.js
const express = require("express");
const router = express.Router();

const {
  createOrder,
  getOrders,
  updateOrderStatus,
  markAsDelivered,
  getOrderById,
  cancelOrder,
} = require("../controllers/orderController");

// Admin Order routes

router.post("/create", createOrder);
router.get("/all", getOrders);
router.patch("/status/:id", updateOrderStatus);
router.get("/:id", getOrderById);
router.patch("/cancel/:id", cancelOrder);
router.patch("/delivered/:id", markAsDelivered); // Driver: Paani diya

module.exports = router;
