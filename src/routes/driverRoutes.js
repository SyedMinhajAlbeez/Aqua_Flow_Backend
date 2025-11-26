// src/routes/driverRoutes.js
const express = require("express");
const router = express.Router();
const {
  createDriver,
  getDrivers,
  toggleDriverStatus,
  sendDriverOTP,
  updateDriver,
  verifyDriverOTP,
  getMyAssignedOrders,
} = require("../controllers/driverController");

const { protect } = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");

// PUBLIC — Driver login
router.post("/send-otp", sendDriverOTP);
router.post("/verify-otp", verifyDriverOTP);

// PROTECTED — Company Admin only
router.use(protect, tenantMiddleware);

router.post("/create", createDriver);
router.get("/all", getDrivers);
router.put("/update/:id", updateDriver);
router.patch("/status/:id", toggleDriverStatus);
router.get("/my-orders", getMyAssignedOrders);

module.exports = router;
