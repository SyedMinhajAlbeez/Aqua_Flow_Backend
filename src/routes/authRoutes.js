// src/routes/authRoutes.js
const express = require("express");
const { loginUser } = require("../controllers/authController");
const {
  sendCustomerOTP,
  verifyCustomerOTP,
  resendCustomerOTP,
} = require("../controllers/customerController");
const {
  sendDriverOTP,
  verifyDriverOTP,
  resendDriverOTP,
} = require("../controllers/adminDriverController");
const router = express.Router();

router.post("/drivers/send-otp", sendDriverOTP);
router.post("/drivers/verify-otp", verifyDriverOTP);
router.post("/drivers/resend-otp", resendDriverOTP);
router.post("/customers/send-otp", sendCustomerOTP);
router.post("/customers/verify-otp", verifyCustomerOTP);
router.post("/customers/resend-otp", resendCustomerOTP);
router.post("/login", loginUser);

module.exports = router;
