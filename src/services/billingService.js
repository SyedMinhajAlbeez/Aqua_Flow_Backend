const prisma = require("../prisma/client");


const { OrderStatus } = require("@prisma/client");

async function getBillingOverview() {
  const tenants = await prisma.tenant.findMany({
    include: {
      companyTariffs: {
        where: { isActive: true },
        include: { tariff: true },
        take: 1,
      },
      orders: {
        where: {
          status: {
            in: [OrderStatus.delivered, OrderStatus.completed],
          },
        },
      },
      payments: true,
    },
  });

  return tenants.map((tenant) => {
    const totalBilled = tenant.orders.reduce(
      (sum, o) => sum + Number(o.totalAmount || 0),
      0
    );

    const totalPaid = tenant.payments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );

    return {
      tenantId: tenant.id,
      companyName: tenant.name,
      plan: tenant.companyTariffs[0]?.tariff?.name ?? "—",
      totalBilled,
      totalPaid,
      dueAmount: totalBilled - totalPaid,
      paymentStatus:
        totalPaid >= totalBilled
          ? "PAID"
          : totalPaid > 0
          ? "PARTIAL"
          : "UNPAID",
    };
  });
}



module.exports = { getBillingOverview };
