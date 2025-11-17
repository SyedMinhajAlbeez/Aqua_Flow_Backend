// src/routes/zoneRoutes.js
const express = require("express");
const {
  createZone,
  getZones,
  updateZone,
  deleteZone,
} = require("../controllers/zoneController");

const router = express.Router();

router.post("/create", createZone);
router.get("/all", getZones); // ?page=1
router.put("/update/:id", updateZone);
router.delete("/delete/:id", deleteZone); // soft delete

module.exports = router;
