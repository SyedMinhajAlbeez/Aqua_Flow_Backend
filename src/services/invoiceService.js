const prisma = require("../prisma/client");

/**
 * Generate invoice for a company (tenant) within a period
 * Handles mid-period tariff changes automatically
 */
async function generateInvoiceForCompany(companyId, periodStart, periodEnd) {
  try {
    // 1️⃣ Get completed/delivered orders in the period
    const orders = await prisma.order.findMany({
      where: {
        tenantId: companyId,
        deliveryDate: { gte: periodStart, lte: periodEnd },
        status: { in: ["delivered", "completed"] },
      },
      include: {
        items: { include: { product: true } },
      },
    });

    if (!orders.length)
      return { message: "No orders for this period", invoice: null };

    // 2️⃣ Get all company tariffs (ordered by effectiveFrom)
    const companyTariffs = await prisma.companyTariff.findMany({
      where: { companyId },
      include: { tariff: { include: { slabs: true } } },
      orderBy: { effectiveFrom: "asc" },
    });

    if (!companyTariffs.length)
      throw new Error("No active tariffs found for company");

    // 3️⃣ Helper: find tariff for a specific date
    const getTariffForDate = (date) => {
      return companyTariffs.find((ct) => {
        const from = ct.effectiveFrom ?? new Date(0);
        const to = ct.effectiveTo ?? new Date(9999, 1, 1);
        return date >= from && date <= to;
      });
    };

    // 4️⃣ Helper: calculate order item amount using slabs
    const calculateOrderAmount = (orderItem, slabs) => {
      const slab = slabs.find(
        (s) =>
          s.productType ===
            (orderItem.product.isReusable ? "REUSABLE" : "NON_REUSABLE") &&
          orderItem.quantity >= s.fromQty &&
          (s.toQty === null || orderItem.quantity <= s.toQty),
      );
      if (!slab)
        throw new Error("No matching tariff slab found for order item");
      return orderItem.quantity * parseFloat(slab.pricePerUnit.toString());
    };

    // 5️⃣ Build invoice line items, split by tariff effective date
    const lineItems = [];
    for (const order of orders) {
      const ct = getTariffForDate(order.deliveryDate);
      if (!ct)
        throw new Error(
          `No tariff found for order date: ${order.deliveryDate}`,
        );

      for (const item of order.items) {
        const amount = calculateOrderAmount(item, ct.tariff.slabs);
        console.log(
          "Order item:",
          item.quantity,
          "Selected slab:",
          ct.tariff.slabs,
        );
        console.log("Calculated amount:", amount);
        lineItems.push({
          productType: item.product.isReusable ? "REUSABLE" : "NON_REUSABLE",
          fromQty: ct.tariff.slabs[0]?.fromQty ?? 0,
          toQty: ct.tariff.slabs[0]?.toQty ?? null,
          unitPrice: ct.tariff.slabs[0]?.pricePerUnit ?? 0,
          quantity: item.quantity,
          amount,
        });
      }
    }

    // 6️⃣ Total amount
    const totalAmount = lineItems.reduce((sum, li) => sum + li.amount, 0);

    // 7️⃣ Check if invoice exists for this company and period
    const existingInvoice = await prisma.invoice.findFirst({
      where: { companyId, periodStart, periodEnd },
    });

    if (existingInvoice) {
      // 8️⃣ Update existing invoice
      const updatedInvoice = await prisma.invoice.update({
        where: { id: existingInvoice.id },
        data: {
          totalAmount,
          status: "GENERATED",
          lineItems: {
            deleteMany: {}, // remove old line items
            create: lineItems, // insert newly calculated line items
          },
        },
        include: { lineItems: true },
      });

      return {
        message: "Invoice updated successfully",
        invoice: updatedInvoice,
      };
    } else {
      // 9️⃣ Create new invoice
      const newInvoice = await prisma.invoice.create({
        data: {
          companyId,
          periodStart,
          periodEnd,
          totalAmount,
          status: "GENERATED",
          lineItems: { create: lineItems },
        },
        include: { lineItems: true },
      });

      return { message: "Invoice generated successfully", invoice: newInvoice };
    }
  } catch (error) {
    console.error("Invoice generation error:", error);
    throw error;
  }
}

module.exports = { generateInvoiceForCompany };
