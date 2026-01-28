const prisma = require("../prisma/client");
const { updateInvoiceStatus,validatePaymentBeforeCreate } = require("../services/billingService");

exports.createPayment = async (req, res) => {
  try {
    const { 
      invoiceId, 
      tenantId, 
      amount,
      paymentMethod = "bank_transfer",
      reference,
      notes
    } = req.body;

    // 1. Validate before creating anything
    await validatePaymentBeforeCreate(invoiceId, amount);

    // 2. Create the INVOICE payment (company paying platform)
    const payment = await prisma.invoicePayment.create({
      data: {
        invoiceId,
        tenantId,
        amount: Number(amount),
        paymentMethod,              // Add this
        reference: reference || null, // Add this
        notes: notes || null,        // Add this
        status: "PAID",
        // InvoicePayment model uses `paidAt`, not `paymentDate`
        // Remove customerId - it's company-to-company payment
      },
    });

    // 3. Update invoice status & fields
    const updatedInvoice = await updateInvoiceStatus(payment.invoiceId);

    res.status(201).json({
      success: true,
      message: "Invoice payment created successfully",
      payment,
      updatedInvoice,
    });
  } catch (err) {
    console.error("Invoice payment creation failed:", err);

    // Friendly error response
    if (err.message.includes("already fully paid") || err.message.includes("exceeds remaining due")) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create invoice payment",
      error: err.message,
    });
  }
};
