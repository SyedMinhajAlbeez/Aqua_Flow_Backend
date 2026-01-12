// src/routes/customerRoutes.js
const express = require("express");
const router = express.Router();

const {
  createCustomer,
  getCustomers,
  updateCustomer,
  toggleStatus,
  getCustomerById,
  deleteCustomerById
} = require("../controllers/customerController");

// Admin routes

router.post("/create", createCustomer);
router.get("/all", getCustomers);
router.put("/update/:id", updateCustomer);
router.delete("/delete/:id", deleteCustomerById);
router.patch("/status/:id", toggleStatus);
router.get("/customers/:id", getCustomerById);

module.exports = router;
