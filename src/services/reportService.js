const prisma = require("../prisma/client");

// Helper functions
const getStartOfMonthUTC = (date = new Date()) => {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
};

const getEndOfMonthUTC = (date = new Date()) => {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
};

const getPreviousMonthUTC = (date = new Date()) => {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
};

// Calculate billing for a company (reusable)
const calculateCompanyBilling = async (companyId, periodStart, periodEnd) => {
  try {
    // Get orders in period
    const orders = await prisma.order.findMany({
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
      return {
        totalOrders: 0,
        totalSales: 0,
        estimatedCommission: 0,
        hasOrders: false
      };
    }

    // Get tariffs
    const companyTariffs = await prisma.companyTariff.findMany({
      where: { companyId },
      include: { tariff: { include: { slabs: true } } },
      orderBy: { effectiveFrom: "asc" },
    });

    if (companyTariffs.length === 0) {
      return {
        totalOrders: orders.length,
        totalSales: orders.reduce((sum, order) => sum + order.totalAmount, 0),
        estimatedCommission: 0,
        hasOrders: true,
        hasTariff: false
      };
    }

    // Simplified calculation (same logic as before)
    let totalReusableQty = 0;
    let totalNonReusableQty = 0;
    let totalNonReusableSales = 0;
    let totalReusableSales = 0;

    for (const order of orders) {
      for (const item of order.items) {
        if (item.product.isReusable) {
          totalReusableQty += item.quantity;
          totalReusableSales += item.totalPrice;
        } else {
          totalNonReusableQty += item.quantity;
          totalNonReusableSales += item.totalPrice;
        }
      }
    }

    // Find applicable tariffs (simplified for report)
    const latestTariff = companyTariffs[companyTariffs.length - 1]?.tariff;
    let totalCommission = 0;

    if (latestTariff) {
      // Calculate commission based on slabs
      const nonReusableSlabs = latestTariff.slabs.filter(s => 
        s.productType === "NON_REUSABLE" && s.percentage !== null
      ).sort((a, b) => a.fromQty - b.fromQty);

      const reusableSlabs = latestTariff.slabs.filter(s => 
        s.productType === "REUSABLE" && s.pricePerUnit !== null
      ).sort((a, b) => a.fromQty - b.fromQty);

      // Calculate NON_REUSABLE commission
      let remainingQty = totalNonReusableQty;
      let processedQty = 0;
      
      for (const slab of nonReusableSlabs) {
        if (remainingQty <= 0) break;
        
        const slabStart = slab.fromQty;
        const slabEnd = slab.toQty ?? Infinity;
        const slabCapacity = slabEnd - slabStart;
        
        const qtyInSlab = Math.min(remainingQty, slabCapacity);
        if (qtyInSlab <= 0) continue;
        
        // Calculate portion of sales for this slab
        const unitPrice = totalNonReusableSales / totalNonReusableQty;
        const slabSales = qtyInSlab * unitPrice;
        const slabCommission = slabSales * (Number(slab.percentage) / 100);
        
        totalCommission += slabCommission;
        remainingQty -= qtyInSlab;
        processedQty += qtyInSlab;
      }

      // Calculate REUSABLE commission
      remainingQty = totalReusableQty;
      
      for (const slab of reusableSlabs) {
        if (remainingQty <= 0) break;
        
        const slabStart = slab.fromQty;
        const slabEnd = slab.toQty ?? Infinity;
        const slabCapacity = slabEnd - slabStart;
        
        const qtyInSlab = Math.min(remainingQty, slabCapacity);
        if (qtyInSlab <= 0) continue;
        
        const slabCommission = qtyInSlab * Number(slab.pricePerUnit);
        totalCommission += slabCommission;
        remainingQty -= qtyInSlab;
      }
    }

    return {
      totalOrders: orders.length,
      totalSales: totalReusableSales + totalNonReusableSales,
      estimatedCommission: totalCommission,
      breakdown: {
        reusable: {
          quantity: totalReusableQty,
          sales: totalReusableSales
        },
        nonReusable: {
          quantity: totalNonReusableQty,
          sales: totalNonReusableSales
        }
      },
      hasOrders: true,
      hasTariff: !!latestTariff,
      tariffName: latestTariff?.name || "No Tariff"
    };
  } catch (error) {
    console.error(`Error calculating billing for company ${companyId}:`, error);
    return {
      totalOrders: 0,
      totalSales: 0,
      estimatedCommission: 0,
      hasOrders: false,
      error: error.message
    };
  }
};

// Get dashboard overview for super admin
const getDashboardOverview = async () => {
  const now = new Date();
  const currentMonthStart = getStartOfMonthUTC(now);
  const currentMonthEnd = getEndOfMonthUTC(now);
  const previousMonthStart = getPreviousMonthUTC(now);
  const previousMonthEnd = new Date(currentMonthStart.getTime() - 1);

  // Get all active companies
  const companies = await prisma.tenant.findMany({
    where: { status: "active" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      orders: {
        where: {
          status: { in: ["delivered", "completed"] },
        },
        select: { totalAmount: true, deliveryDate: true },
      },
      invoices: {
        include: {
          payments: {
            where: { status: "PAID" },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Calculate statistics for each company
  const companyReports = [];
  let totalCurrentMonthSales = 0;
  let totalCurrentMonthCommission = 0;
  let totalOutstanding = 0;
  let totalPaid = 0;

  for (const company of companies) {
    // Current month billing
    const currentMonthBilling = await calculateCompanyBilling(
      company.id,
      currentMonthStart,
      currentMonthEnd
    );

    // Previous month billing
    const previousMonthBilling = await calculateCompanyBilling(
      company.id,
      previousMonthStart,
      previousMonthEnd
    );

    // Calculate invoice stats
    const invoiceStats = {
      totalInvoices: company.invoices.length,
      paidInvoices: company.invoices.filter(inv => inv.billingStatus === "PAID").length,
      outstandingInvoices: company.invoices.filter(inv => 
        inv.billingStatus === "UNPAID" || inv.billingStatus === "PARTIAL"
      ).length,
      overdueInvoices: company.invoices.filter(inv => 
        inv.billingStatus === "OVERDUE"
      ).length,
      totalPaid: company.invoices.reduce((sum, inv) => 
        sum + inv.payments.reduce((pSum, p) => pSum + Number(p.amount || 0), 0), 0
      ),
      totalDue: company.invoices.reduce((sum, inv) => 
        sum + (Number(inv.totalAmount || 0) - 
        inv.payments.reduce((pSum, p) => pSum + Number(p.amount || 0), 0)), 0
      ),
    };

    // Total company sales (all time)
    const totalCompanySales = company.orders.reduce((sum, order) => 
      sum + order.totalAmount, 0
    );

    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentOrders = company.orders.filter(order => 
      order.deliveryDate >= thirtyDaysAgo
    ).length;

    const companyReport = {
      id: company.id,
      name: company.name,
      email: company.email,
      phone: company.phone,
      joinedDate: company.createdAt,
      status: "active",
      
      // Current month stats
      currentMonth: {
        sales: currentMonthBilling.totalSales,
        commission: currentMonthBilling.estimatedCommission,
        orders: currentMonthBilling.totalOrders,
        growth: previousMonthBilling.totalSales > 0 
          ? ((currentMonthBilling.totalSales - previousMonthBilling.totalSales) / previousMonthBilling.totalSales * 100).toFixed(1)
          : currentMonthBilling.totalSales > 0 ? 100 : 0
      },
      
      // All time stats
      allTime: {
        totalSales: totalCompanySales,
        totalOrders: company.orders.length,
        averageOrderValue: company.orders.length > 0 
          ? totalCompanySales / company.orders.length 
          : 0
      },
      
      // Invoice stats
      invoices: invoiceStats,
      
      // Activity
      recentActivity: {
        ordersLast30Days: recentOrders,
        lastInvoice: company.invoices.length > 0 
          ? company.invoices[company.invoices.length - 1].generatedAt 
          : null,
        lastPayment: invoiceStats.totalPaid > 0 
          ? company.invoices.flatMap(inv => inv.payments)
              .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))[0]?.paidAt 
          : null
      },
      
      // Breakdown
      breakdown: currentMonthBilling.breakdown || {
        reusable: { quantity: 0, sales: 0 },
        nonReusable: { quantity: 0, sales: 0 }
      },
      
      // Flags
      flags: {
        hasTariff: currentMonthBilling.hasTariff,
        hasOrders: currentMonthBilling.hasOrders,
        isActive: true
      }
    };

    companyReports.push(companyReport);
    
    // Update totals
    totalCurrentMonthSales += currentMonthBilling.totalSales;
    totalCurrentMonthCommission += currentMonthBilling.estimatedCommission;
    totalOutstanding += invoiceStats.totalDue;
    totalPaid += invoiceStats.totalPaid;
  }

  // Calculate summary statistics
  const totalCompanies = companies.length;
  const activeCompanies = companies.filter(c => c.orders.length > 0).length;
  const inactiveCompanies = totalCompanies - activeCompanies;

  // Get month-over-month growth
  const previousMonthTotal = await getPreviousMonthTotalSales();
  const salesGrowth = previousMonthTotal > 0 
    ? ((totalCurrentMonthSales - previousMonthTotal) / previousMonthTotal * 100).toFixed(1)
    : totalCurrentMonthSales > 0 ? 100 : 0;

  // Get top performing companies
  const topCompanies = [...companyReports]
    .sort((a, b) => b.currentMonth.sales - a.currentMonth.sales)
    .slice(0, 5);

  // Get overdue companies
  const overdueCompanies = companyReports
    .filter(company => company.invoices.overdueInvoices > 0)
    .sort((a, b) => b.invoices.totalDue - a.invoices.totalDue);

  return {
    summary: {
      totalCompanies,
      activeCompanies,
      inactiveCompanies,
      totalCurrentMonthSales,
      totalCurrentMonthCommission,
      totalOutstanding,
      totalPaid,
      salesGrowth: `${salesGrowth}%`,
      averageCommissionRate: totalCurrentMonthSales > 0 
        ? ((totalCurrentMonthCommission / totalCurrentMonthSales) * 100).toFixed(2)
        : 0,
      currency: "PKR"
    },
    
    companies: companyReports,
    
    highlights: {
      topPerformingCompanies: topCompanies,
      overdueCompanies,
      companiesWithoutTariff: companyReports.filter(c => !c.flags.hasTariff),
      newCompanies: companyReports.filter(c => 
        new Date(c.joinedDate) >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      )
    },
    
    timeline: {
      currentPeriod: {
        start: currentMonthStart,
        end: currentMonthEnd
      },
      previousPeriod: {
        start: previousMonthStart,
        end: previousMonthEnd
      },
      generatedAt: new Date()
    }
  };
};

// Helper function to get previous month total sales
const getPreviousMonthTotalSales = async () => {
  const now = new Date();
  const previousMonthStart = getPreviousMonthUTC(now);
  const previousMonthEnd = new Date(getStartOfMonthUTC(now).getTime() - 1);

  const orders = await prisma.order.findMany({
    where: {
      deliveryDate: { gte: previousMonthStart, lte: previousMonthEnd },
      status: { in: ["delivered", "completed"] },
    },
    select: { totalAmount: true },
  });

  return orders.reduce((sum, order) => sum + order.totalAmount, 0);
};

// Get detailed company report
const getCompanyDetailReport = async (companyId, periodStart, periodEnd) => {
  const company = await prisma.tenant.findUnique({
    where: { id: companyId },
    include: {
      orders: {
        where: {
          deliveryDate: { gte: periodStart, lte: periodEnd },
          status: { in: ["delivered", "completed"] },
        },
        include: {
          items: {
            include: { product: true }
          },
          customer: {
            select: { name: true, phone: true }
          },
          driver: {
            select: { name: true, vehicleNumber: true }
          }
        },
        orderBy: { deliveryDate: "desc" }
      },
      invoices: {
        where: {
          periodStart: { gte: periodStart },
          periodEnd: { lte: periodEnd }
        },
        include: {
          payments: true,
          lineItems: true
        }
      },
      companyTariffs: {
        include: {
          tariff: { include: { slabs: true } }
        },
        orderBy: { effectiveFrom: "desc" }
      }
    }
  });

  if (!company) {
    throw new Error("Company not found");
  }

  // Calculate billing
  const billing = await calculateCompanyBilling(companyId, periodStart, periodEnd);

  // Get customer stats
  const customers = await prisma.customer.findMany({
    where: { tenantId: companyId },
    select: {
      id: true,
      name: true,
      phone: true,
      totalSpent: true,
      lastOrderDate: true,
      orders: {
        where: {
          deliveryDate: { gte: periodStart, lte: periodEnd },
          status: { in: ["delivered", "completed"] }
        },
        select: { totalAmount: true }
      }
    }
  });

  // Calculate top customers
  const topCustomers = customers
    .map(customer => ({
      ...customer,
      periodSpent: customer.orders.reduce((sum, order) => sum + order.totalAmount, 0)
    }))
    .sort((a, b) => b.periodSpent - a.periodSpent)
    .slice(0, 10);

  // Get product stats
  const products = await prisma.product.findMany({
    where: { tenantId: companyId, status: "active" },
    select: {
      id: true,
      name: true,
      price: true,
      isReusable: true,
      orderItems: {
        where: {
          order: {
            deliveryDate: { gte: periodStart, lte: periodEnd },
            status: { in: ["delivered", "completed"] }
          }
        },
        select: { quantity: true, totalPrice: true }
      }
    }
  });

  // Calculate top products
  const topProducts = products
    .map(product => ({
      ...product,
      totalQuantity: product.orderItems.reduce((sum, item) => sum + item.quantity, 0),
      totalRevenue: product.orderItems.reduce((sum, item) => sum + item.totalPrice, 0)
    }))
    .filter(p => p.totalQuantity > 0)
    .sort((a, b) => b.totalQuantity - a.totalQuantity)
    .slice(0, 10);

  // Get daily trend
  const dailyOrders = {};
  company.orders.forEach(order => {
    const date = order.deliveryDate.toISOString().split('T')[0];
    if (!dailyOrders[date]) {
      dailyOrders[date] = { date, orders: 0, sales: 0 };
    }
    dailyOrders[date].orders += 1;
    dailyOrders[date].sales += order.totalAmount;
  });

  const dailyTrend = Object.values(dailyOrders)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    companyInfo: {
      id: company.id,
      name: company.name,
      email: company.email,
      phone: company.phone,
      address: company.address
    },
    
    period: {
      start: periodStart,
      end: periodEnd
    },
    
    billingSummary: billing,
    
    orders: {
      total: company.orders.length,
      list: company.orders.map(order => ({
        id: order.id,
        orderNumber: order.orderNumberDisplay,
        date: order.deliveryDate,
        customer: order.customer?.name || "N/A",
        driver: order.driver?.name || "N/A",
        amount: order.totalAmount,
        items: order.items.map(item => ({
          product: item.product.name,
          quantity: item.quantity,
          price: item.unitPrice,
          total: item.totalPrice
        }))
      })).slice(0, 20), // Last 20 orders
      totalSales: billing.totalSales
    },
    
    invoices: {
      total: company.invoices.length,
      list: company.invoices.map(invoice => ({
        id: invoice.id,
        period: `${new Date(invoice.periodStart).toLocaleDateString()} - ${new Date(invoice.periodEnd).toLocaleDateString()}`,
        amount: invoice.totalAmount,
        paid: invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0),
        due: Number(invoice.totalAmount) - invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0),
        status: invoice.billingStatus,
        dueDate: invoice.dueDate,
        generatedAt: invoice.generatedAt
      }))
    },
    
    customers: {
      total: customers.length,
      active: customers.filter(c => c.lastOrderDate && 
        new Date(c.lastOrderDate) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      ).length,
      topCustomers
    },
    
    products: {
      total: products.length,
      active: products.filter(p => p.orderItems.length > 0).length,
      topProducts
    },
    
    dailyTrend,
    
    currentTariff: company.companyTariffs[0]?.tariff || null,
    
    generatedAt: new Date()
  };
};

// Get revenue report with filters
const getRevenueReport = async (filters = {}) => {
  const {
    periodStart,
    periodEnd,
    companyId,
    productType,
    sortBy = "sales",
    sortOrder = "desc",
    limit = 50,
    offset = 0
  } = filters;

  const where = {
    deliveryDate: {},
    status: { in: ["delivered", "completed"] }
  };

  if (periodStart && periodEnd) {
    where.deliveryDate.gte = new Date(periodStart);
    where.deliveryDate.lte = new Date(periodEnd);
  }

  if (companyId) {
    where.tenantId = companyId;
  }

  // Get orders with pagination
  const [orders, totalOrders] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        items: {
          include: { product: true }
        },
        customer: {
          select: { name: true }
        },
        tenant: {
          select: { name: true }
        }
      },
      orderBy: { deliveryDate: "desc" },
      skip: offset,
      take: limit
    }),
    prisma.order.count({ where })
  ]);

  // Calculate totals
  const totalSales = orders.reduce((sum, order) => sum + order.totalAmount, 0);

  // Group by company
  const companyGroups = {};
  orders.forEach(order => {
    const companyId = order.tenantId;
    if (!companyGroups[companyId]) {
      companyGroups[companyId] = {
        companyId,
        companyName: order.tenant.name,
        orders: 0,
        sales: 0,
        products: {}
      };
    }
    
    companyGroups[companyId].orders += 1;
    companyGroups[companyId].sales += order.totalAmount;
    
    // Count products
    order.items.forEach(item => {
      const productKey = item.product.id;
      if (!companyGroups[companyId].products[productKey]) {
        companyGroups[companyId].products[productKey] = {
          name: item.product.name,
          type: item.product.isReusable ? "REUSABLE" : "NON_REUSABLE",
          quantity: 0,
          sales: 0
        };
      }
      
      companyGroups[companyId].products[productKey].quantity += item.quantity;
      companyGroups[companyId].products[productKey].sales += item.totalPrice;
    });
  });

  // Convert to array and sort
  const companySummaries = Object.values(companyGroups).map(company => ({
    ...company,
    products: Object.values(company.products).sort((a, b) => b.sales - a.sales)
  }));

  // Sort company summaries
  companySummaries.sort((a, b) => {
    if (sortBy === "sales") {
      return sortOrder === "desc" ? b.sales - a.sales : a.sales - b.sales;
    } else if (sortBy === "orders") {
      return sortOrder === "desc" ? b.orders - a.orders : a.orders - b.orders;
    }
    return 0;
  });

  return {
    filters,
    summary: {
      totalOrders,
      totalSales,
      averageOrderValue: totalOrders > 0 ? totalSales / totalOrders : 0,
      companies: Object.keys(companyGroups).length
    },
    companies: companySummaries,
    pagination: {
      total: totalOrders,
      limit,
      offset,
      hasMore: offset + orders.length < totalOrders
    }
  };
};

module.exports = {
  getDashboardOverview,
  getCompanyDetailReport,
  getRevenueReport,
  calculateCompanyBilling
};