const prisma = require("../prisma/client");
const { getBillingOverview } = require("../services/billingService");



exports.getAllBillings = async (req, res) => {
  try {
    const data = await getBillingOverview();
    res.json(data);
  } catch (err) {
    console.error("🔥 Billing fetch error:", err);
    res.status(500).json({
      message: "Failed to fetch billings",
      error: err.message,
    });
  }
};

