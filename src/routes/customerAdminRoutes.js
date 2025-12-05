// src/routes/customerRoutes.js
const express = require("express");
const router = express.Router();

const {
  createCustomer,
  getCustomers,
  updateCustomer,
  toggleStatus,
} = require("../controllers/customerController");

// Admin routes

router.post("/create", createCustomer);
router.get("/all", getCustomers);
router.put("/update/:id", updateCustomer);
router.patch("/status/:id", toggleStatus);

module.exports = router;
