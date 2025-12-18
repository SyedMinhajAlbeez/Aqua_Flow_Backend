const express = require("express");
const router = express.Router();

const {
  editUpcomingOrder,
  getUpcomingRecurringOrders,
  toggleSubscription,
} = require("../../controllers/customerappcontrollers/customerEditController");

// Clean routes
router.get("/recurring/upcoming", getUpcomingRecurringOrders);
router.put("/recurring/edit/:orderId", editUpcomingOrder);
router.patch(
  "/recurring/subscription/:subscriptionId/toggle",
  toggleSubscription
);

module.exports = router;
