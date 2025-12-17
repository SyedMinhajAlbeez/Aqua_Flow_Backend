// src/controllers/dashboardController.js - FINAL FIXED VERSION

const prisma = require("../prisma/client");

exports.getDashboardOverview = async (req, res) => {
  try {
    const tenantId = req.derivedTenantId;

    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);

    // Generate last 12 months labels
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = date.toLocaleString("default", { month: "short" });
      months.push(`${monthName} ${date.getFullYear()}`);
    }

    // Parallel queries
    const [
      totalOrders,
      totalRevenue,
      activeCustomersCount,
      activeDriversCount,
      recentOrders,
      topCustomers,
      allActiveProducts,
      salesDataRaw, // We'll get order items with deliveryDate
    ] = await Promise.all([
      prisma.order.count({ where: { tenantId } }),

      prisma.order.aggregate({
        where: {
          tenantId,
          status: { in: ["delivered", "completed"] },
        },
        _sum: { totalAmount: true },
      }),

      // 3. Active Customers – Recommended logic
      prisma.customer.count({
        where: {
          tenantId,
          status: "active",
          OR: [
            { lastOrderDate: null },
            {
              lastOrderDate: {
                gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days
              },
            },
          ],
        },
      }),
      prisma.driver.count({
        where: { tenantId, status: "active" },
      }),

      prisma.order.findMany({
        where: { tenantId },
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          customer: { select: { name: true } },
          items: {
            include: { product: { select: { name: true, size: true } } },
          },
        },
      }),

      prisma.customer.findMany({
        where: {
          tenantId,
          orders: {
            some: { status: { in: ["delivered", "completed"] } }, // at least one completed order
          },
        },
        take: 5,
        orderBy: [{ orders: { _count: "desc" } }, { totalSpent: "desc" }],
        include: {
          orders: {
            where: { status: { in: ["delivered", "completed"] } },
            select: { id: true },
          },
        },
      }),

      prisma.product.findMany({
        where: { tenantId, status: "active" },
        select: { id: true, name: true, size: true },
        orderBy: { name: "asc" },
      }),

      // ✅ CORRECT WAY: Get order items with order's deliveryDate
      prisma.orderItem.findMany({
        where: {
          order: {
            tenantId,
            status: { in: ["delivered", "completed"] },
            deliveryDate: { gte: twelveMonthsAgo },
          },
        },
        select: {
          productId: true,
          totalPrice: true,
          order: {
            select: {
              deliveryDate: true,
            },
          },
        },
      }),
    ]);

    // Aggregate product sales by month
    const productSalesByMonth = {};

    salesDataRaw.forEach((item) => {
      const deliveryDate = item.order.deliveryDate;
      if (!deliveryDate) return;

      const monthKey = deliveryDate.toLocaleString("default", {
        month: "short",
        year: "numeric",
      }); // e.g., "Jan 2025"

      const productId = item.productId;
      const revenue = item.totalPrice || 0;

      if (!productSalesByMonth[monthKey]) {
        productSalesByMonth[monthKey] = {};
      }
      if (!productSalesByMonth[monthKey][productId]) {
        productSalesByMonth[monthKey][productId] = 0;
      }
      productSalesByMonth[monthKey][productId] += revenue;
    });

    // Build datasets
    const datasets = allActiveProducts.map((product) => {
      const productFullName = `${product.name} (${product.size})`;
      const data = months.map((month) => {
        return Math.round(productSalesByMonth[month]?.[product.id] || 0);
      });

      return {
        productId: product.id,
        productName: productFullName,
        data,
      };
    });

    // Format recent orders
    const formattedRecentOrders = recentOrders.map((order) => {
      const timeAgo = formatTimeAgo(order.createdAt);
      return {
        id: order.id,
        orderNumber: order.orderNumberDisplay,
        timeAgo,
        status: order.status,
        amount: order.totalAmount,
        customerName: order.customer.name,
        items: order.items.map((i) => ({
          product: `${i.product.name} (${i.product.size})`,
          quantity: i.quantity,
        })),
      };
    });

    // Format top customers
    const formattedTopCustomers = topCustomers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      totalSpent: customer.totalSpent || 0,
      ordersCount: customer.orders.length,
    }));

    res.json({
      success: true,
      data: {
        stats: {
          totalOrders,
          revenue: Math.round(totalRevenue._sum.totalAmount || 0),
          activeCustomers: activeCustomersCount,
          activeDrivers: activeDriversCount,
        },
        recentOrders: formattedRecentOrders,
        topCustomers: formattedTopCustomers,
        salesChart: {
          labels: months,
          datasets: datasets,
        },
      },
    });
  } catch (err) {
    console.error("Dashboard Overview Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to load dashboard data",
      details: err.message,
    });
  }
};

function formatTimeAgo(date) {
  const now = new Date();
  const diffInMs = now - new Date(date);
  const diffInMins = Math.floor(diffInMs / 60000);
  const diffInHours = Math.floor(diffInMins / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInMins < 60) return `${diffInMins} mins ago`;
  if (diffInHours < 24)
    return `${diffInHours} ${diffInHours === 1 ? "hour" : "hours"} ago`;
  return `${diffInDays} ${diffInDays === 1 ? "day" : "days"} ago`;
}
