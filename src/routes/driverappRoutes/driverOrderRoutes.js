// src/routes/driverRoutes.js
const express = require("express");
const router = express.Router();
const {
  getMyAssignedOrders,
  markOutForDelivery,
  markAsDelivered,
  completeOrderWithEmpties, // ✅ Empties collection for delivered orders
  getTodayRecurringOrders, // ✅ Today's recurring (including delivered for completion)
  getMyCompletedOrders,
  getTodayAllOrders,
} = require("../../controllers/driverappcontrollers/driverorderController");

// not Call Api App
router.get("/today-orders", getTodayAllOrders); // ✅ NEW: Today all orders
// Use Api App
router.get("/my-orders", getMyAssignedOrders);
router.get("/today-recurring", getTodayRecurringOrders); // ✅ Recurring view with empties info
router.get("/my-completed", getMyCompletedOrders); // ✅ NEW: History of completed orders
router.patch("/order-out-for-delivery/:id", markOutForDelivery);
router.patch("/order-delivered/:id", markAsDelivered);
router.patch("/complete-order/:id", completeOrderWithEmpties); // ✅ After delivered: Collect empties & complete

module.exports = router;
