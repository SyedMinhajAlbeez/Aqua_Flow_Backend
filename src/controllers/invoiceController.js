const { generateInvoiceForCompany, getInvoiceById,
  getInvoicesByCompany,
  getInvoiceByPeriod, } = require("../services/invoiceService");
const { updateInvoiceStatus } = require("../services/billingService");
/**
 * POST /api/invoices/generate
 */

// At the top of invoiceController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();


exports.getInvoiceById = async (req, res) => {
  console.log("Received ID:", req.params.id);

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        lineItems: true,
        payments: true,
      },
    });

    console.log("Invoice found:", invoice);

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    res.json({ invoice });
  } catch (err) {
    console.error("Error fetching invoice:", err);
    res.status(500).json({
      message: "Failed to fetch invoice",
      error: err.message,  // Add error message here temporarily
    });
  }
};


// exports.getInvoiceById = async (req, res) => {
//   try {
//     console.log("Fetching invoice by ID:", req.params.id);
//     const invoice = await prisma.invoice.findUnique({
//       where: { id: req.params.id },
//       include: {
//         company: {
//           select: {
//             id: true,
//             name: true,
//             email: true,
//           },
//         },
//         lineItems: true,
//         payments: true,
//       },
//     });

//     if (!invoice) {
//       return res.status(404).json({ message: "Invoice not found" });
//     }

//     res.json({ invoice });
//   } catch (err) {
//     console.error("Error fetching invoice by ID:", err);
//     res.status(500).json({ message: "Failed to fetch invoice" });
//   }
// };

// exports.getInvoiceById = async (req, res) => {
//   try {
//     const invoice = await prisma.invoice.findUnique({
//       where: { id: req.params.id },
//       include: {
//         company: {
//           select: {
//             id: true,
//             name: true,
//             email: true,
//           },
//         },
//         lineItems: true,
//         payments: true,
//       },
//     });

//     if (!invoice) {
//       return res.status(404).json({ message: "Invoice not found" });
//     }

//     res.json({ invoice });
//   } catch (err) {
//     res.status(500).json({ message: "Failed to fetch invoice" });
//   }
// };







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


exports.getInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    if (!invoiceId) {
      return res.status(400).json({
        message: "invoiceId is required",
      });
    }

    const invoice = await getInvoiceById(invoiceId);

    if (!invoice) {
      return res.status(404).json({
        message: "Invoice not found",
      });
    }

    // Calculate current totals
    const totalPaid = invoice.payments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );
    const totalAmount = Number(invoice.totalAmount || 0);
    const dueAmount = totalAmount - totalPaid;

    // Update status based on payments
    let billingStatus = invoice.billingStatus;
    if (totalPaid >= totalAmount) {
      billingStatus = "PAID";
    } else if (totalPaid > 0) {
      billingStatus = "PARTIAL";
    } else if (invoice.dueDate && new Date(invoice.dueDate) < new Date()) {
      billingStatus = "OVERDUE";
    }

    res.status(200).json({
      ...invoice,
      totalPaid,
      dueAmount,
      billingStatus,
    });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({
      message: "Failed to fetch invoice",
      error: error.message,
    });
  }
};

/**
 * GET /api/invoices
 * Get invoices with filtering and pagination
 * Query params: companyId, status, periodStart, periodEnd, limit, offset
 */
exports.getInvoices = async (req, res) => {
  try {
    const {
      companyId,
      status,
      periodStart,
      periodEnd,
      limit = 50,
      offset = 0,
      sortBy = "generatedAt",
      sortOrder = "desc",
    } = req.query;

    if (!companyId) {
      return res.status(400).json({
        message: "companyId is required",
      });
    }

    const result = await getInvoicesByCompany(companyId, {
      status,
      periodStart,
      periodEnd,
      limit: parseInt(limit),
      offset: parseInt(offset),
      sortBy,
      sortOrder,
    });

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({
      message: "Failed to fetch invoices",
      error: error.message,
    });
  }
};

/**
 * GET /api/invoices/period
 * Get invoice for specific company and period
 */
exports.getInvoiceByPeriod = async (req, res) => {
  try {
    const { companyId, periodStart, periodEnd } = req.query;

    if (!companyId || !periodStart || !periodEnd) {
      return res.status(400).json({
        message: "companyId, periodStart, and periodEnd are required",
      });
    }

    const invoice = await getInvoiceByPeriod(
      companyId,
      periodStart,
      periodEnd
    );

    if (!invoice) {
      return res.status(404).json({
        message: "Invoice not found for this period",
      });
    }

    // Calculate current totals
    const totalPaid = invoice.payments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );
    const totalAmount = Number(invoice.totalAmount || 0);
    const dueAmount = totalAmount - totalPaid;

    res.status(200).json({
      ...invoice,
      totalPaid,
      dueAmount,
    });
  } catch (error) {
    console.error("Error fetching invoice by period:", error);
    res.status(500).json({
      message: "Failed to fetch invoice",
      error: error.message,
    });
  }
};