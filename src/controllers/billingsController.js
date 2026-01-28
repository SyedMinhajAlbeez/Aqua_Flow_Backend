const { getBillingOverview } = require("../services/billingService");

exports.getAllBillings = async (req, res) => {
  try {
    const { role, companyId } = req.user;

    const data = await getBillingOverview({
      role,
      companyId,
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error("🔥 Billing error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch billings",
      error: err.message,
    });
  }
};
