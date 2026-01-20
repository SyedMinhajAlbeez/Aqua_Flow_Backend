const express = require("express");
const router = express.Router();
const { generateInvoice } = require("../controllers/invoiceController");

// POST generate invoice
router.post("/generate", generateInvoice);

module.exports = router;
