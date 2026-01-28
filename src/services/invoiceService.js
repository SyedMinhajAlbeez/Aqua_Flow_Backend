const prisma = require("../prisma/client");
const { updateInvoiceStatus } = require("../services/billingService");

// Move calculateTieredFee outside the main function for clarity
const calculateTieredFee = (slabs, orders, isPercentage) => {
  // For percentage-based calculations (NON_REUSABLE)
  if (isPercentage) {
    // Sort orders by deliveryDate, then by createdAt
    const sortedOrders = [...orders].sort((a, b) => {
      if (a.deliveryDate.getTime() !== b.deliveryDate.getTime()) {
        return a.deliveryDate - b.deliveryDate;
      }
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    // Flatten all items into individual units with their actual prices
    const allUnits = [];
    for (const order of sortedOrders) {
      for (const item of order.items) {
        if (!item.product.isReusable) {
          const unitPrice = Number(item.totalPrice) / item.quantity;
          for (let i = 0; i < item.quantity; i++) {
            allUnits.push({
              orderId: order.id,
              orderCreatedAt: new Date(order.createdAt),
              unitPrice: unitPrice
            });
          }
        }
      }
    }

    const sortedSlabs = slabs
      .filter(s => s.productType === "NON_REUSABLE" && s.percentage !== null)
      .sort((a, b) => a.fromQty - b.fromQty);

    const lineItems = [];
    let currentUnitIndex = 0;

    for (const slab of sortedSlabs) {
      if (currentUnitIndex >= allUnits.length) break;

      const slabStart = slab.fromQty;
      const slabEnd = slab.toQty ?? Infinity;
      const slabCapacity = slabEnd - slabStart;

      let unitsInThisSlab = 0;
      let baseAmount = 0;

      while (
        currentUnitIndex < allUnits.length &&
        unitsInThisSlab < slabCapacity
      ) {
        baseAmount += allUnits[currentUnitIndex].unitPrice;
        unitsInThisSlab++;
        currentUnitIndex++;
      }

      if (unitsInThisSlab === 0) continue;

      const amount = baseAmount * (Number(slab.percentage) / 100);

      lineItems.push({
        productType: "NON_REUSABLE",
        fromQty: slab.fromQty,
        toQty: slab.toQty,
        unitPrice: null,
        percentage: Number(slab.percentage),
        baseAmount: Number(baseAmount.toFixed(2)),
        quantity: unitsInThisSlab,
        amount: Number(amount.toFixed(2)),
        slabId: slab.id,
      });
    }

    return lineItems;
  } else {
    // For REUSABLE products (price per unit)
    const sortedSlabs = slabs
      .filter(s => s.productType === "REUSABLE" && s.pricePerUnit !== null)
      .sort((a, b) => a.fromQty - b.fromQty);

    // Count total reusable units
    let totalReusableQty = 0;
    for (const order of orders) {
      for (const item of order.items) {
        if (item.product.isReusable) {
          totalReusableQty += item.quantity;
        }
      }
    }

    const lineItems = [];
    let remainingQty = totalReusableQty;

    for (const slab of sortedSlabs) {
      if (remainingQty <= 0) break;

      const slabStart = slab.fromQty;
      const slabEnd = slab.toQty ?? Infinity;
      const qtyInThisSlab = Math.max(0, Math.min(remainingQty, slabEnd - slabStart));

      if (qtyInThisSlab <= 0) continue;

      const amount = qtyInThisSlab * Number(slab.pricePerUnit);

      lineItems.push({
        productType: "REUSABLE",
        fromQty: slab.fromQty,
        toQty: slab.toQty,
        unitPrice: Number(slab.pricePerUnit),
        percentage: null,
        baseAmount: null,
        quantity: qtyInThisSlab,
        amount: Number(amount.toFixed(2)),
        slabId: slab.id,
      });

      remainingQty -= qtyInThisSlab;
    }

    return lineItems;
  }
};

async function generateInvoiceForCompany(companyId, periodStart, periodEnd) {
  return prisma.$transaction(async (tx) => {
    // 1. Check for existing invoice inside the transaction

    
    const existingInvoice = await tx.invoice.findFirst({
      where: {
        companyId,
        periodStart,
        periodEnd
      },
      include: {
        payments: {
          where: { status: "PAID" },
        },
      },
    });

    // 2. Prevent regenerating paid invoices
    if (existingInvoice) {
      const totalPaid = existingInvoice.payments.reduce(
        (sum, p) => sum + Number(p.amount || 0),
        0
      );
      const totalAmount = Number(existingInvoice.totalAmount || 0);

      if (totalPaid >= totalAmount || existingInvoice.billingStatus === "PAID") {
        // Return existing invoice without regeneration
        const invoiceWithDetails = await tx.invoice.findUnique({
          where: { id: existingInvoice.id },
          include: {
            lineItems: true,
            payments: {
              where: { status: "PAID" },
            },
            company: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        return {
          message: "Invoice is already paid and cannot be regenerated",
          invoice: {
            ...invoiceWithDetails,
            totalPaid,
            dueAmount: totalAmount - totalPaid,
          }
        };
      }
    }

    // 3. Fetch all delivered/completed orders in the period
    const orders = await tx.order.findMany({
      where: {
        tenantId: companyId,
        deliveryDate: { gte: periodStart, lte: periodEnd },
        status: { in: ["delivered", "completed"] },
      },
      include: {
        items: {
          include: { product: true },
        },
      },
    });

    if (orders.length === 0) {
      return { message: "No orders in this period", invoice: null };
    }

    // 4. Get all company tariffs (past + current)
    const companyTariffs = await tx.companyTariff.findMany({
      where: { companyId },
      include: { tariff: { include: { slabs: true } } },
      orderBy: { effectiveFrom: "asc" },
    });

    if (companyTariffs.length === 0) {
      throw new Error("No tariff assigned to company");
    }

    // 5. Group orders by active tariff (handle tariff changes mid-period)
    const ordersByTariffPeriod = {};

    for (const order of orders) {
      const deliveryDate = order.deliveryDate;
      
      // Find tariff active on this date
      const activeTariff = companyTariffs.find((ct) => {
        const from = ct.effectiveFrom || new Date(0);
        const to = ct.effectiveTo || new Date("9999-12-31");
        return deliveryDate >= from && deliveryDate <= to;
      });

      if (!activeTariff) {
        throw new Error(`No tariff active on ${deliveryDate.toISOString().split('T')[0]}`);
      }

      const key = `${activeTariff.tariffId}-${activeTariff.effectiveFrom?.toISOString() || 'default'}`;
      if (!ordersByTariffPeriod[key]) {
        ordersByTariffPeriod[key] = {
          tariff: activeTariff.tariff,
          orders: []
        };
      }
      
      ordersByTariffPeriod[key].orders.push(order);
    }

    // 6. Process each tariff period with FIFO ordering
    const allLineItems = [];

    for (const [key, period] of Object.entries(ordersByTariffPeriod)) {
      const { tariff, orders: periodOrders } = period;
      
      // Sort orders by date and time for FIFO
      const sortedOrders = periodOrders.sort((a, b) => {
        if (a.deliveryDate.getTime() !== b.deliveryDate.getTime()) {
          return a.deliveryDate - b.deliveryDate;
        }
        return new Date(a.createdAt) - new Date(b.createdAt);
      });

      // Separate orders by product type
      const nonReusableOrders = sortedOrders.filter(order => 
        order.items.some(item => !item.product.isReusable)
      );

      const reusableOrders = sortedOrders.filter(order =>
        order.items.some(item => item.product.isReusable)
      );

      // Calculate fees for this tariff period
      const reusableLines = calculateTieredFee(
        tariff.slabs,
        reusableOrders,
        false  // isPercentage = false for REUSABLE
      );

      const nonReusableLines = calculateTieredFee(
        tariff.slabs,
        nonReusableOrders,
        true   // isPercentage = true for NON_REUSABLE
      );

      // Tag lines with tariff info
      [...reusableLines, ...nonReusableLines].forEach((line) => {
        line.tariffId = tariff.id;
        line.effectiveDate = periodOrders[0]?.deliveryDate || new Date();
        allLineItems.push(line);
      });
    }

    // 7. Deduplicate & merge same slab lines
    const mergedLineItems = allLineItems.reduce((acc, curr) => {
      const key = curr.slabId;
      if (!acc[key]) {
        acc[key] = { ...curr };
      } else {
        acc[key].quantity += curr.quantity;
        acc[key].amount += curr.amount;
        if (curr.baseAmount) {
          acc[key].baseAmount = (acc[key].baseAmount || 0) + curr.baseAmount;
        }
      }
      return acc;
    }, {});

    const finalLineItems = Object.values(mergedLineItems).map((item) => ({
      productType: item.productType,
      fromQty: item.fromQty,
      toQty: item.toQty,
      unitPrice: item.unitPrice,
      percentage: item.percentage,
      baseAmount: item.baseAmount,
      quantity: item.quantity,
      amount: item.amount,
      tariffId: item.tariffId,
      slabId: item.slabId,
    }));

    const totalAmount = finalLineItems.reduce((sum, li) => sum + li.amount, 0);

    // 8. Create or update invoice
    if (existingInvoice) {
      // Invoice exists but is not fully paid
      await tx.invoiceLineItem.deleteMany({ where: { invoiceId: existingInvoice.id } });

      const updatedInvoice = await tx.invoice.update({
        where: { id: existingInvoice.id },
        data: {
          totalAmount,
          generatedAt: new Date(),
          lineItems: { create: finalLineItems },
        },
        include: { lineItems: true, payments: { where: { status: "PAID" } } },
      });

      // Immediately re-run status update
      const finalInvoice = await updateInvoiceStatus(updatedInvoice.id, tx);

      return {
        message: "Invoice updated & status refreshed",
        invoice: finalInvoice
      };
    } else {
      // No existing invoice, create new one
      const newInvoice = await tx.invoice.create({
        data: {
          companyId,
          periodStart,
          periodEnd,
          totalAmount,
          dueDate: new Date(periodEnd.getTime() + 15 * 24 * 60 * 60 * 1000),
          billingStatus: "UNPAID",
          generatedAt: new Date(),
          lineItems: { create: finalLineItems },
        },
        include: { lineItems: true },
      });

      return {
        message: "Invoice generated",
        invoice: newInvoice
      };
    }
  });
}

// Optional: Generate all invoices for previous month (run via cron on 1st)
async function generateAllMonthlyInvoices() {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of previous month

  const companies = await prisma.tenant.findMany({
    where: { status: "active" },
    select: { id: true },
  });

  const results = [];
  for (const { id } of companies) {
    try {
      const result = await generateInvoiceForCompany(id, periodStart, periodEnd);
      results.push({ companyId: id, success: true, result });
    } catch (err) {
      results.push({ companyId: id, success: false, error: err.message });
    }
  }

  return results;
}

async function getInvoiceById(invoiceId) {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      lineItems: true,
      payments: {
        where: { status: "PAID" },
      },
      company: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

/**
 * GET all invoices for a company
 */
async function getInvoicesByCompany(companyId, options = {}) {
  const {
    limit = 50,
    offset = 0,
    status,
    periodStart,
    periodEnd,
    sortBy = "generatedAt",
    sortOrder = "desc",
  } = options;

  const where = { companyId };

  if (status) {
    where.billingStatus = status;
  }

  if (periodStart && periodEnd) {
    where.OR = [
      {
        periodStart: { gte: new Date(periodStart) },
        periodEnd: { lte: new Date(periodEnd) },
      },
      // Also find invoices that overlap with the period
      {
        periodStart: { lte: new Date(periodEnd) },
        periodEnd: { gte: new Date(periodStart) },
      },
    ];
  }

  const [invoices, totalCount] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        lineItems: true,
        payments: {
          where: { status: "PAID" },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: offset,
      take: limit,
    }),
    prisma.invoice.count({ where }),
  ]);

  // Calculate paid amount and updated status
  const processedInvoices = invoices.map((invoice) => {
    const totalPaid = invoice.payments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );
    const totalAmount = Number(invoice.totalAmount || 0);
    const dueAmount = totalAmount - totalPaid;

    let billingStatus = invoice.billingStatus;

    // Recalculate status for consistency
    if (totalPaid >= totalAmount) {
      billingStatus = "PAID";
    } else if (totalPaid > 0) {
      billingStatus = "PARTIAL";
    } else if (invoice.dueDate && new Date(invoice.dueDate) < new Date()) {
      billingStatus = "OVERDUE";
    }

    return {
      ...invoice,
      totalPaid,
      dueAmount,
      billingStatus, // Recalculated status
    };
  });

  return {
    invoices: processedInvoices,
    pagination: {
      total: totalCount,
      limit,
      offset,
      hasMore: offset + invoices.length < totalCount,
    },
  };
}

/**
 * GET invoice by company and period (without regeneration)
 */
async function getInvoiceByPeriod(companyId, periodStart, periodEnd) {
  return prisma.invoice.findFirst({
    where: {
      companyId,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
    },
    include: {
      lineItems: true,
      payments: {
        where: { status: "PAID" },
      },
      company: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

module.exports = {
  generateInvoiceForCompany,
  generateAllMonthlyInvoices,
  getInvoiceById,
  getInvoicesByCompany,
  getInvoiceByPeriod,
};