// controllers/deliveryOperationsController.js - UPDATED

const prisma = require("../prisma/client");

exports.getCustomersByZone = async (req, res) => {
  try {
    const tenantId = req.derivedTenantId;
    const { zoneId } = req.params;

    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const zone = await prisma.zone.findUnique({
      where: { id: zoneId },
      select: { id: true, tenantId: true, name: true },
    });

    if (!zone) return res.status(404).json({ error: "Zone not found" });
    if (zone.tenantId !== tenantId)
      return res.status(403).json({ error: "Access denied" });

    const customers = await prisma.customer.findMany({
      where: {
        zoneId,
        tenantId,
        orders: {
          some: {
            status: "pending",
            tenantId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        empties: true,
        lastOrderDate: true,
        _count: { select: { orders: { where: { status: "pending" } } } },
        orders: {
          where: { status: "pending" },
          select: {
            id: true,
            totalAmount: true,
            orderNumberDisplay: true,
            items: {
              select: {
                quantity: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                    isReusable: true,
                    requiresEmptyReturn: true,
                  },
                },
              },
            },
          },
          take: 5,
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ orders: { _count: "desc" } }, { name: "asc" }],
    });

    if (customers.length === 0) {
      return res.json({
        success: true,
        zone: zone.name,
        message: "No pending deliveries in this zone",
        customers: [],
      });
    }

    const formatted = customers.map((c) => {
      const totalPending = c.orders.reduce((sum, o) => sum + o.totalAmount, 0);
      let deliverableBottles = 0;

      c.orders.forEach((order) => {
        order.items.forEach((item) => {
          if (item.product.isReusable) {
            deliverableBottles += item.quantity;
          }
        });
      });

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        address: c.address,
        empties: c.empties || 0,
        deliverableBottles: deliverableBottles,
        pendingOrdersCount: c._count.orders,
        totalPendingAmount: Number(totalPending.toFixed(2)),
        pendingOrders: c.orders.map((o) => ({
          id: o.id,
          number: o.orderNumberDisplay || `#${o.id.slice(-6)}`,
          amount: o.totalAmount,
        })),
        lastDelivery: c.lastOrderDate
          ? new Date(c.lastOrderDate).toISOString().split("T")[0]
          : "Never",
      };
    });

    res.json({
      success: true,
      zone: zone.name,
      message: `${formatted.length} customers ready for delivery`,
      customers: formatted,
    });
  } catch (error) {
    console.error("getCustomersByZone ERROR:", error);
    res.status(500).json({ error: "Server error" });
  }
};

exports.assignDriverToCustomers = async (req, res) => {
  try {
    const tenantId = req.derivedTenantId;
    const { zoneId, driverId, scheduledDate, customerIds } = req.body;

    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });
    if (
      !zoneId ||
      !driverId ||
      !scheduledDate ||
      !Array.isArray(customerIds) ||
      customerIds.length === 0
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const scheduled = new Date(scheduledDate);
    if (isNaN(scheduled.getTime()))
      return res.status(400).json({ error: "Invalid date" });

    const [zone, driver] = await Promise.all([
      prisma.zone.findUnique({ where: { id: zoneId } }),
      prisma.driver.findUnique({ where: { id: driverId } }),
    ]);

    if (!zone || zone.tenantId !== tenantId)
      return res.status(404).json({ error: "Zone not found" });
    // if (!driver || driver.zoneId !== zoneId || driver.tenantId !== tenantId) {
    //   return res.status(404).json({ error: "Driver not in this zone" });
    // }

    const result = { assigned: 0, skipped: [] };

    for (const custId of customerIds) {
      const customer = await prisma.customer.findUnique({
        where: { id: custId },
        select: { id: true, tenantId: true, zoneId: true },
      });

      if (
        !customer ||
        customer.tenantId !== tenantId ||
        customer.zoneId !== zoneId
      ) {
        result.skipped.push({ customerId: custId, reason: "Invalid customer" });
        continue;
      }

      const updated = await prisma.order.updateMany({
        where: { customerId: custId, status: "pending", tenantId },
        data: {
          driverId,
          status: "in_progress",
          scheduledDate: scheduled,
        },
      });

      if (updated.count > 0) {
        result.assigned += updated.count;
      } else {
        result.skipped.push({
          customerId: custId,
          reason: "No pending orders",
        });
      }
    }

    res.json({
      success: true,
      message: `${result.assigned} orders assigned to ${
        driver.name || "Driver"
      }`,
      driver: driver.name || "Unknown",
      date: scheduled.toISOString().split("T")[0],
      summary: {
        customersRequested: customerIds.length,
        ordersAssigned: result.assigned,
        skipped: result.skipped.length,
      },
      skippedDetails: result.skipped,
    });
  } catch (error) {
    console.error("assignDriver ERROR:", error);
    res.status(500).json({ error: "Assignment failed" });
  }
};
