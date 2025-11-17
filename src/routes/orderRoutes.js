// src/routes/orderRoutes.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");
const {
  createOrder,
  getOrders,
  updateOrderStatus,
} = require("../controllers/orderController");

router.post("/create", createOrder);
router.get("/all", getOrders);
router.patch("/status/:id", updateOrderStatus);

module.exports = router;
