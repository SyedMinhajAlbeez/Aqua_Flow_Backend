const prisma = require("../prisma/client");

class OrderRepository {
  async create(orderData) {
    return await prisma.order.create({
      data: orderData,
      include: {
        items: true,
        customer: true,

      },
    });
  }

  async countByTenant(tenantId) {
    return await prisma.order.count({
      where: { tenantId },
    });
  }

  async findById(id) {
    return await prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        customer: true,
      },
    });
  }
}

module.exports = new OrderRepository();