// src/routes/customerRecurringRoutes.js
const express = require("express");
const router = express.Router();
const {
  editUpcomingOrder,
  getUpcomingRecurringOrders,
  toggleSubscription,
} = require("../../controllers/customerappcontrollers/customerEditController");

// Customer recurring order management
router.get("/upcoming", getUpcomingRecurringOrders);
router.put("/edit/:orderId", editUpcomingOrder);
router.patch("/subscription/:subscriptionId/toggle", toggleSubscription);

module.exports = router;
