const express = require("express");
const router = express.Router();
const {
  generateInvoice,
  getInvoice,
  getInvoices,
  getInvoiceByPeriod,
  getInvoiceById
} = require("../controllers/invoiceController");

// POST generate invoice
router.post("/generate", generateInvoice);

router.get("/:id", getInvoiceById);

// router.get("/:invoiceId", getInvoice);
router.get("/get", getInvoices);
router.get("/by-period", getInvoiceByPeriod);

module.exports = router;
