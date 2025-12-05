// src/routes/customerOrderRoutes.js
const express = require("express");
const router = express.Router();

const {
  createCustomerOrder,
  getCustomerOrders,
} = require("../../controllers/customerappcontrollers/customerOrdersController");

// CUSTOMER ORDER ROUTES - SIRF CUSTOMERS KE LIYE
router.post("/create", createCustomerOrder);
router.get("/my-orders", getCustomerOrders);

module.exports = router;
