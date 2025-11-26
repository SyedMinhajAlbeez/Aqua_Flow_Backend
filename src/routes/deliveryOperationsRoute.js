// routes/deliveryOperationsRoute.js
const express = require("express");
const router = express.Router();
const {
  getCustomersByZone,
  assignDriverToCustomers,
} = require("../controllers/deliveryOperationsController");

router.get("/customers-by-zone/:zoneId", getCustomersByZone);
router.post("/assign-driver", assignDriverToCustomers);

module.exports = router;
