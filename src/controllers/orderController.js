// src/controllers/orderController.js
// FINAL VERSION – DRIVER ID REQUIRED + AUTO ORDER NUMBER + PROFESSIONAL

const prisma = require("../prisma/client");


// ==================== CREATE ORDER (DRIVER ID REQUIRED) ====================
exports.createOrder = async (req, res) => {
  try {
    const {
      customerId,
      items,                    // [{ productId, quantity }]
      deliveryDate,
      driverId,                 // ← AB REQUIRED HAI!
      paymentMethod = "cash_on_delivery"
    } = req.body;

    const tenantId = req.derivedTenantId;
    const createdById = req.user.id;

    // === VALIDATION ===
    if (!customerId || !items || items.length === 0 || !deliveryDate || !driverId) {
      return res.status(400).json({
        error: "Customer, items, delivery date, and driver are required"
      });
    }

    // === CUSTOMER + AUTO ADDRESS & ZONE ===
    const customer = await prisma.customer.findUnique({
      where: { id: customerId, tenantId },
      include: { zone: true }
    });
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    if (!customer.zoneId) return res.status(400).json({ error: "Customer has no zone assigned" });

    // === DRIVER VALIDATION (Same Zone + Active) ===
    const driver = await prisma.driver.findUnique({
      where: { id: driverId, tenantId },
      include: { zone: true }
    });
    if (!driver) return res.status(404).json({ error: "Driver not found" });
    if (driver.status !== "active") return res.status(400).json({ error: "Driver is not active" });
    if (driver.zoneId !== customer.zoneId) {
      return res.status(400).json({ error: "Driver must be from customer's zone" });
    }

    // === CALCULATE TOTAL + VALIDATE PRODUCTS ===
    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId, tenantId }
      });

      if (!product || product.status !== "active") {
        return res.status(400).json({ error: `Product not available: ${item.productId}` });
      }

      const quantity = parseInt(item.quantity) || 1;
      const itemTotal = quantity * product.price;
      totalAmount += itemTotal;

      orderItems.push({
        productId: product.id,
        quantity,
        unitPrice: product.price,
        totalPrice: itemTotal
      });
    }

    // === AUTO ORDER NUMBER (#1001, #1002...) ===
    const orderCount = await prisma.order.count({ where: { tenantId } });
    const orderNumberDisplay = `#${1000 + orderCount + 1}`;

    // === CREATE ORDER ===
    const order = await prisma.order.create({
      data: {
        orderNumberDisplay,
        customerId,
        driverId,
        zoneId: customer.zoneId,
        deliveryDate: new Date(deliveryDate),
        deliveryAddress: customer.address,
        totalAmount,
        paymentMethod,
        status: "in_progress",  // Driver assigned → direct in_progress
        tenantId,
        createdById,
        items: { create: orderItems }
      },
      include: {
        customer: { select: { name: true, phone: true, address: true } },
        driver: { select: { name: true, phone: true, vehicleId: true } },
        zone: { select: { name: true } },
        items: {
          include: {
            product: { select: { name: true, size: true, price: true } }
          }
        }
      }
    });

    res.status(201).json({
      message: "Order created successfully",
      order
    });

  } catch (err) {
    console.error("Create Order Error:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
};


// ==================== GET ALL ORDERS (Dashboard Ready) ====================
exports.getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 15;
    const skip = (page - 1) * limit;
    const tenantId = req.derivedTenantId;

    const [orders, total, stats] = await Promise.all([
      prisma.order.findMany({
        where: { tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          customer: { select: { name: true, phone: true } },
          driver: { select: { name: true, vehicleId: true } },
          zone: { select: { name: true } },
          items: {
            include: { product: { select: { name: true, size: true } } }
          }
        }
      }),
      prisma.order.count({ where: { tenantId } }),
      prisma.order.groupBy({
        by: ["status"],
        where: { tenantId },
        _count: { status: true }
      })
    ]);

    const statusCount = stats.reduce((acc, curr) => {
      acc[curr.status] = curr._count.status;
      return acc;
    }, {});

    res.json({
      orders,
      stats: {
        totalOrders: total,
        pending: statusCount.pending || 0,
        in_progress: statusCount.in_progress || 0,
        delivered: statusCount.delivered || 0,
        cancelled: statusCount.cancelled || 0,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error("Get Orders Error:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
};


// ==================== UPDATE ORDER STATUS (Driver/Customer App Use Karega) ====================
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const tenantId = req.derivedTenantId;

    const validStatuses = ["pending", "confirmed", "in_progress", "out_for_delivery", "delivered", "cancelled", "failed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const order = await prisma.order.update({
      where: { id, tenantId },
      data: { status },
      include: {
        customer: { select: { name: true } },
        driver: { select: { name: true } }
      }
    });

    res.json({ message: "Order status updated", order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update order" });
  }
};