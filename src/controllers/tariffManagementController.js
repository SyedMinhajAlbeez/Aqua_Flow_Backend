const prisma = require("../prisma/client");
const tariffService = require("../services/tariffService");

const createTariff = async (req, res) => {
  try {
    const tariff = await tariffService.createTariff(req.body, req.user.id);
    res.status(201).json(tariff);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/**
 * GET ALL TARIFFS
 */
const getAllTariffs = async (req, res) => {
  if (req.user.role !== "super_admin") {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const tariffs = await tariffService.getAllTariffs();
    res.json(tariffs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET TARIFF BY ID
 */
const getTariffById = async (req, res) => {
  if (req.user.role !== "super_admin") {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const tariff = await tariffService.getTariffById(req.params.id);
    if (!tariff) {
      return res.status(404).json({ message: "Tariff not found" });
    }
    res.json(tariff);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * UPDATE TARIFF (VERSIONED)
 */
const updateTariff = async (req, res) => {
  if (req.user.role !== "super_admin") {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const tariff = await tariffService.updateTariff(
      req.params.id,
      req.body,
      req.user.id
    );
    res.json(tariff);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/**
 * DEACTIVATE TARIFF
 */
const deactivateTariff = async (req, res) => {
  if (req.user.role !== "super_admin") {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const tariff = await tariffService.deactivateTariff(req.params.id);
    res.json({ message: "Tariff deactivated", tariff });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/**
 * GET DEFAULT TARIFF
 */
const getDefaultTariff = async (req, res) => {
  if (req.user.role !== "super_admin") {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const tariff = await tariffService.getDefaultTariff();
    if (!tariff) {
      return res.status(404).json({ message: "No default tariff found" });
    }
    res.json(tariff);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  createTariff,
  getAllTariffs,
  getTariffById,
  updateTariff,
  deactivateTariff,
  getDefaultTariff
};