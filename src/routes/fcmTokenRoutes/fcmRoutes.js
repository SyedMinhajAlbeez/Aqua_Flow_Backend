// routes/fcmRoutes.js (Updated)
const express = require("express");
const router = express.Router();
const {
  updateFCMToken,
  updateFCMTokenCustomer, // NEW: For customers
  testNotification,
  sendToDriverById,
  sendToCustomerById, // NEW: For customers
  notifyDriverOrderAssigned,
  notifyDriverOrderStatusChange,
  notifyCustomerOrderStatusChange, // NEW: For customers
} = require("../../controllers/fcmController");

// PUBLIC TEST
router.post("/test-fcm", testNotification);

// DRIVER
router.post("/update-token", updateFCMToken);

// CUSTOMER (NEW)
router.post("/update-token-customer", updateFCMTokenCustomer);

// ADMIN (add admin middleware if needed)
router.post("/send-to-driver", sendToDriverById);
router.post("/send-to-customer", sendToCustomerById); // NEW

router.post("/notify-driver-assigned", notifyDriverOrderAssigned);

router.post("/notify-driver-status-change", notifyDriverOrderStatusChange);
router.post("/notify-customer-status-change", notifyCustomerOrderStatusChange); // NEW

module.exports = router;