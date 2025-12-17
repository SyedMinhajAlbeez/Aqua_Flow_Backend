// src/routes/dashboardRoutes.js
const express = require("express");
const router = express.Router();
const { getDashboardOverview } = require("../controllers/dashboardController");

router.get("/dashboard", getDashboardOverview);

module.exports = router;
