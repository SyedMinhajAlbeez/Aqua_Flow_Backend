const express = require("express");
const router = express.Router();

const {
  createCustomerOrder,
  getCustomerOrders,
  getCustomerPayments,
  getCustomerBottlesInfo, // ← YE ADD KARNA ZAROORI THA!
} = require("../../controllers/customerappcontrollers/customerOrdersController");

const {
  sendDeliveryReminder,
} = require("../../utils/notificationService");

// CLEAN & USER-FRIENDLY ROUTES
// } = require("../../utils/notificationService");", getCustomerOrders); // My orders history

router.post("/orders/create", createCustomerOrder); // Create order
router.get("/orders", getCustomerOrders); // My orders history
router.get("/payments", getCustomerPayments); // Payment history
router.get("/bottles-info", getCustomerBottlesInfo); // Dashboard ke liye critical!
// router.post("/notifications", sendDeliveryReminder);
module.exports = router;
