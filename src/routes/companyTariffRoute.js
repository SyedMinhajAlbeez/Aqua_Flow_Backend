const express = require("express");
const router = express.Router();
const {
  assignTariff,
  getCompanyTariffs,
} = require("../controllers/companyTariffController");

router.post("/assign", assignTariff);
router.get("/get", getCompanyTariffs);
module.exports = router;
