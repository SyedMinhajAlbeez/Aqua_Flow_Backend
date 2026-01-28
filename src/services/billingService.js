const prisma = require("../prisma/client");

/**
 * Get billing overview for admin or company admin
 * - Fetches invoices with only successful payments
 * - Calculates accurate totalPaid from filtered payments
 * - Uses DB billingStatus as source of truth where possible
 */
async function getBillingOverview({ role, companyId }) {
  const invoiceWhere = {};

  // FIXED: Use lowercase role values to match your enum
  if (role === "company_admin") {  // Changed from "COMPANY_ADMIN"
    invoiceWhere.companyId = companyId;
  }

  const invoices = await prisma.invoice.findMany({
    where: invoiceWhere,
    include: {
      payments: {  // This is now InvoicePayment records
        where: {
          status: "PAID",
        },
      },
      company: {
        select: { name: true },
      },
    },
    orderBy: { periodStart: "desc" },
  });

  return invoices.map((invoice) => {
    const totalPaid = invoice.payments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );

    const totalAmount = Number(invoice.totalAmount || 0);
    const dueAmount = totalAmount - totalPaid;

    let billingStatus = invoice.billingStatus || "UNPAID";
    if (totalPaid >= totalAmount) {
      billingStatus = "PAID";
    } else if (totalPaid > 0) {
      billingStatus = "PARTIAL";
    } else if (invoice.dueDate && new Date(invoice.dueDate) < new Date()) {
      billingStatus = "OVERDUE";
    }

    return {
      invoiceId: invoice.id,
      companyId: invoice.companyId,
      companyName: invoice.company?.name || "Unknown",
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      totalAmount,
      totalPaid,
      dueAmount,
      billingStatus,
      dueDate: invoice.dueDate,
      generatedAt: invoice.generatedAt,
      paidAt: invoice.paidAt,
    };
  });
}

/**
 * Update invoice billing status based on all its payments
 * - Called after creating a new payment
 * - Uses only valid (PAID) payments for calculation
 * - Updates paidAmount and paidAt accurately
 */
async function updateInvoiceStatus(invoiceId,tx = null) {
  // Fetch invoice + all its payments
  const client = tx || prisma;
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      payments: {
        where: {
          status: "PAID", // Only successful payments count toward total
        },
      },
    },
  });

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  // Calculate total paid from successful payments only
  const totalPaid = invoice.payments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0
  );

  const totalAmount = Number(invoice.totalAmount || 0);

  // Determine correct status
  let newStatus = "UNPAID";

  if (totalPaid >= totalAmount) {
    newStatus = "PAID";
  } else if (totalPaid > 0) {
    newStatus = "PARTIAL";
  } else if (invoice.dueDate && new Date(invoice.dueDate) < new Date()) {
    newStatus = "OVERDUE";
  }

  // Update invoice with accurate values
  const updatedInvoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      billingStatus: newStatus,
      paidAmount: totalPaid,                // accurate total from PAID payments
      paidAt: totalPaid > 0 ? new Date() : null,
    },
  });

  return updatedInvoice;
}


async function validatePaymentBeforeCreate(invoiceId, amount) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      payments: {
        where: { status: "PAID" },
        select: { amount: true },
      },
    },
  });

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  const totalPaid = invoice.payments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0
  );

  const totalAmount = Number(invoice.totalAmount || 0);
  const remainingDue = totalAmount - totalPaid;

  if (remainingDue <= 0) {
    throw new Error("Invoice is already fully paid");
  }

  if (Number(amount) > remainingDue + 0.01) { // small tolerance for floating point
    throw new Error(
      `Payment amount (${amount}) exceeds remaining due (${remainingDue.toFixed(2)})`
    );
  }

  return { invoice, remainingDue };
}

// services/billingSummaryService.js
const getBillingSummary = async (companyId, periodStart, periodEnd) => {
  // Same calculation logic as invoice but DON'T save to DB
  const orders = await getOrdersInPeriod(companyId, periodStart, periodEnd);
  const tariffs = await getCompanyTariffs(companyId);
  
  // Calculate charges (same logic as invoice calculation)
  const summary = calculateCharges(orders, tariffs);
  
  return {
    periodStart,
    periodEnd,
    totalOrders: orders.length,
    totalAmount: summary.totalAmount,
    lineItems: summary.lineItems,
    breakdownByProduct: summary.breakdownByProduct,
    dailyTrend: calculateDailyTrend(orders, tariffs),
    // Add more analytics...
  };
};

const getRealtimeBilling = async (companyId) => {
  const now = new Date();
  const periodStart = getStartOfMonth(now);
  const periodEnd = now; // Not end of month, but current moment
  
  return getBillingSummary(companyId, periodStart, periodEnd);
};

module.exports = {
  getBillingOverview,
  updateInvoiceStatus,
  validatePaymentBeforeCreate,
  getBillingSummary,
};