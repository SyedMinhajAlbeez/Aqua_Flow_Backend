// src/routes/customerRoutes.js
const express = require("express");
const router = express.Router();

const {
  createCustomer,
  getCustomers,
  updateCustomer,
  toggleStatus,
  sendCustomerOTP,
  verifyCustomerOTP,
} = require("../controllers/customerController");

const { protect } = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");

// PUBLIC ROUTES — Customer khud use karega (login ke liye)
router.post("/send-otp", sendCustomerOTP);
router.post("/verify-otp", verifyCustomerOTP);

// PROTECTED ROUTES — Sirf company admin use kar sakta hai
router.use(protect, tenantMiddleware); // ← YEH LINE SABSE ZAROORI!

router.post("/create", createCustomer);
router.get("/all", getCustomers);
router.put("/update/:id", updateCustomer);
router.patch("/status/:id", toggleStatus);

module.exports = router;
