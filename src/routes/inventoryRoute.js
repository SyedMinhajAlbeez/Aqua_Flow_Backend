// src/routes/inventoryRoute.js
// FIXED: Added missing import - NOV 23, 2025

const express = require("express");
const router = express.Router();

const {
  getInventory, // ← UPDATED: Product-wise + global dashboard data
  addStock, // ← NEW: Add stock to specific product
} = require("../controllers/inventoryController");

router.get("/dashboard", getInventory); // Frontend dashboard ke liye full data
router.post("/add-stock", addStock); // Specific product stock add

module.exports = router;
