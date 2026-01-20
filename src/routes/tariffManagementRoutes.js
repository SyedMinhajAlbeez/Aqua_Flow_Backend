const express = require("express");
const router = express.Router();
const {
  createTariff,
  getAllTariffs,
  getTariffById,
  updateTariff,
  deactivateTariff,
} = require("../controllers/TariffManagementController");

router.post("/create", createTariff);
router.get("/get", getAllTariffs);
router.get("/:id", getTariffById);
router.put("/:id", updateTariff);
router.patch("/:id/deactivate", deactivateTariff);

module.exports = router;
