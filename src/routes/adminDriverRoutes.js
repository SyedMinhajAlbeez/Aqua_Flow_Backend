// src/routes/driverRoutes.js
const express = require("express");
const router = express.Router();
const {
  createDriver,
  getDrivers,
  toggleDriverStatus,
  updateDriver,
} = require("../controllers/adminDriverController");

// ✅ PROTECTED ADMIN ROUTES (company_admin, super_admin, etc.)
router.post("/create", createDriver);
router.get("/all", getDrivers);
router.put("/update/:id", updateDriver);
router.patch("/status/:id", toggleDriverStatus);

module.exports = router;
