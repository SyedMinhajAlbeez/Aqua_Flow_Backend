// src/routes/orderRoutes.js
const express = require("express");
const router = express.Router();

const {
  createOrder,
  getOrders,
  updateOrderStatus,
  markAsDelivered,
  completeOrderWithEmpties,
} = require("../controllers/orderController");

router.post("/create", createOrder);
router.get("/all", getOrders);
router.patch("/status/:id", updateOrderStatus);
router.patch("/delivered/:id", markAsDelivered); // Driver: Paani diya
router.patch("/complete/:id", completeOrderWithEmpties); // Driver: Empties liye

module.exports = router;
