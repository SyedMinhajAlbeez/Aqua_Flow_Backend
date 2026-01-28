// services/customerPaymentService.js
const prisma = require("../prisma/client");

/**
 * Create customer payment (customer paying company)
 */
async function createCustomerPayment({
  tenantId,
  customerId,
  orderId = null,
  subscriptionId = null,
  amount,
  paidAmount,
  pendingAmount = 0,
  collectionType = "IMMEDIATE",
  dueDate = null,
  paymentMethod = "cash_on_delivery",
  collectedByDriverId = null,
  notes = null,
  paymentItems = []
}) {
  return await prisma.$transaction(async (tx) => {
    // 1. Create the customer payment
    const payment = await tx.customerPayment.create({
      data: {
        tenantId,
        customerId,
        orderId,
        subscriptionId,
        amount,
        paidAmount,
        pendingAmount,
        collectionType,
        dueDate,
        paymentDate: paidAmount > 0 ? new Date() : null,
        paymentMethod,
        collectedByDriverId,
        notes,
        status: paidAmount >= amount ? "PAID" : 
               paidAmount > 0 ? "PARTIAL" : "PENDING",
      },
    });

    // 2. Create payment items if provided
    if (paymentItems.length > 0) {
      await tx.paymentItem.createMany({
        data: paymentItems.map(item => ({
          paymentId: payment.id,
          orderId: item.orderId,
          orderItemId: item.orderItemId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          depositAmount: item.depositAmount || 0,
          totalAmount: item.totalAmount,
        })),
      });
    }

    // 3. Update order payment status if order exists
    if (orderId) {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { customerPayments: true },
      });

      if (order) {
        const totalPaid = order.customerPayments.reduce(
          (sum, p) => sum + p.paidAmount,
          0
        );

        let paymentStatus = "PENDING";
        if (totalPaid >= order.totalAmount) {
          paymentStatus = "PAID";
        } else if (totalPaid > 0) {
          paymentStatus = "PARTIAL";
        }

        await tx.order.update({
          where: { id: orderId },
          data: {
            paidAmount: totalPaid,
            paymentStatus,
          },
        });
      }
    }

    // 4. Update customer due amount
    await tx.customer.update({
      where: { id: customerId },
      data: {
        dueAmount: {
          decrement: paidAmount,
        },
        totalSpent: {
          increment: paidAmount,
        },
      },
    });

    return payment;
  });
}

/**
 * Get payment summary for dashboard
 */
async function getPaymentSummary(tenantId, filters = {}) {
  const where = { tenantId, ...filters };

  const [totalPayments, totalAmount, totalCollected, totalPending, recentPayments] = await Promise.all([
    prisma.customerPayment.count({ where }),
    prisma.customerPayment.aggregate({
      where,
      _sum: { amount: true },
    }),
    prisma.customerPayment.aggregate({
      where: { ...where, status: { in: ["PAID", "PARTIAL"] } },
      _sum: { paidAmount: true },
    }),
    prisma.customerPayment.aggregate({
      where: { ...where, status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } },
      _sum: { pendingAmount: true },
    }),
    prisma.customerPayment.findMany({
      where,
      include: {
        customer: {
          select: { name: true, phone: true },
        },
        order: {
          select: { orderNumberDisplay: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return {
    totalPayments: totalPayments,
    totalAmount: totalAmount._sum.amount || 0,
    totalCollected: totalCollected._sum.paidAmount || 0,
    totalPending: totalPending._sum.pendingAmount || 0,
    recentPayments,
  };
}

module.exports = {
  createCustomerPayment,
  getPaymentSummary,
};