// routes/deliveryOperationsRoute.js
const express = require("express");
const router = express.Router();
const {
  createPayment,
} = require("../controllers/createPaymentCompController");

router.post("/status", createPayment);

module.exports = router;
