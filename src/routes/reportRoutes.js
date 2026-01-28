const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");

const {
  getDashboard,
  getCompanyReport,
  getRevenueReport,
  exportReport,
  getOverdueCompanies,
  getCompaniesWithoutTariff
} = require("../controllers/reportController");

// All routes are for super admin only
router.get("/dashboard", getDashboard);
router.get("/company/:companyId", getCompanyReport);
router.get("/revenue", getRevenueReport);
router.get("/export", exportReport);
router.get("/companies/overdue", getOverdueCompanies);
router.get("/companies/without-tariff", getCompaniesWithoutTariff);

module.exports = router;