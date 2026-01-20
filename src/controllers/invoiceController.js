const { generateInvoiceForCompany } = require("../services/invoiceService");

/**
 * POST /api/invoices/generate
 */
exports.generateInvoice = async (req, res) => {
  try {
    const { companyId, periodStart, periodEnd } = req.body;

    if (!companyId || !periodStart || !periodEnd) {
      return res.status(400).json({
        message: "companyId, periodStart, and periodEnd are required",
      });
    }

    const invoice = await generateInvoiceForCompany(
      companyId,
      new Date(periodStart),
      new Date(periodEnd)
    );

    res.status(201).json(invoice);
  } catch (error) {
    res.status(500).json({
      message: "Failed to generate invoice",
      error: error.message,
    });
  }
};
