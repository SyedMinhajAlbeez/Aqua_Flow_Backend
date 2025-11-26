// src/routes/orderRoutes.js
const express = require("express");
const router = express.Router();

const {
  createOrder,
  getOrders,
  updateOrderStatus,
  markAsDelivered,
  completeOrderWithEmpties,
  assignDriverToOrder,
} = require("../controllers/orderController");

router.post("/create", createOrder);
router.get("/all", getOrders);
router.patch("/status/:id", updateOrderStatus);
router.patch("/delivered/:id", markAsDelivered); // Driver: Paani diya
router.patch("/complete/:id", completeOrderWithEmpties); // Driver: Empties liye
router.patch("/assign-driver/:id", assignDriverToOrder); // Order Assign Driver

module.exports = router;
