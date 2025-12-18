const express = require("express");
const router = express.Router();

const {
  createCustomerOrder,
  getCustomerOrders,
  getCustomerPayments,
  getCustomerBottlesInfo, // ← YE ADD KARNA ZAROORI THA!
} = require("../../controllers/customerappcontrollers/customerOrdersController");

// CLEAN & USER-FRIENDLY ROUTES
router.post("/orders/create", createCustomerOrder); // Order place
router.get("/orders", getCustomerOrders); // My orders history
router.get("/payments", getCustomerPayments); // Payment history
router.get("/bottles-info", getCustomerBottlesInfo); // Dashboard ke liye critical!

module.exports = router;
