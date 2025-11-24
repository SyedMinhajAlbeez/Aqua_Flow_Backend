// ==================== INVENTORY CONTROLLER ====================
// src/controllers/inventoryController.js
// FULL PRODUCT-WISE INVENTORY + GLOBAL REUSABLE POOL - FIXED ORDERBY - NOV 23, 2025
// FIXED: Cross-Check Global Pool vs Product Sum for Reusables - NOV 24, 2025

const prisma = require("../prisma/client");

exports.getInventory = async (req, res) => {
  try {
    const tenantId = req.derivedTenantId;

    // 1. Product-Wise Inventory (Har product ka alag stock)
    const productInventories = await prisma.productInventory.findMany({
      where: { tenantId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            size: true,
            isReusable: true,
            price: true,
            depositAmount: true,
          },
        },
      },
      orderBy: { product: { name: "asc" } },
    });

    // 2. Global Reusable Bottle Pool (Sirf reusable products ke liye aggregate)
    const bottleInv = await prisma.bottleInventory.findUnique({
      where: { tenantId },
    });

    // FIXED: Cross-check reusable sum vs global pool (debug mismatch)
    const reusableProductSum = productInventories
      .filter((inv) => inv.product.isReusable)
      .reduce((sum, inv) => sum + inv.currentStock, 0);
    const reusableWithCustomersSum = productInventories
      .filter((inv) => inv.product.isReusable)
      .reduce((sum, inv) => sum + (inv.totalAdded - inv.currentStock), 0); // Sold as proxy for with customers
    if (bottleInv && bottleInv.inStock !== reusableProductSum) {
      console.warn(
        `Global Pool Mismatch: DB inStock=${bottleInv.inStock}, Reusable Sum=${reusableProductSum}. Sync needed!`
      );
    }
    if (bottleInv && bottleInv.withCustomers !== reusableWithCustomersSum) {
      console.warn(
        `Global WithCustomers Mismatch: DB=${bottleInv.withCustomers}, Calculated=${reusableWithCustomersSum}`
      );
    }

    // 3. Total Security Deposit from Customers
    const totalDeposit = await prisma.customer.aggregate({
      where: { tenantId },
      _sum: { securityDeposit: true },
    });

    // 4. Recent Transactions (Last 10 Order Items - Product-Wise)
    const recentTransactions = await prisma.orderItem.findMany({
      where: {
        order: { tenantId },
        product: { isReusable: true }, // Optional: Sirf reusable
      },
      include: {
        order: {
          include: {
            customer: { select: { name: true } },
            driver: { select: { name: true } },
          },
        },
        product: { select: { name: true, size: true } },
      },
      orderBy: { order: { createdAt: "desc" } }, // ← FIXED: Nested orderBy on Order.createdAt
      take: 10,
    });

    // 5. Pending Empties (Top 10 Customers with empties > 0)
    const pendingCustomers = await prisma.customer.findMany({
      where: { tenantId, empties: { gt: 0 } },
      select: {
        name: true,
        empties: true,
        bottlesGiven: true,
        securityDeposit: true,
        lastOrderDate: true,
      },
      orderBy: { empties: "desc" },
      take: 10,
    });

    // Calculate Aggregates
    const totalBottles = productInventories.reduce(
      (sum, inv) => sum + inv.totalAdded,
      0
    );
    const inStockTotal = productInventories.reduce(
      (sum, inv) => sum + inv.currentStock,
      0
    );
    const withCustomersTotal = totalBottles - inStockTotal;
    const lowStockProducts = productInventories.filter(
      (inv) => inv.currentStock < 10
    ); // Threshold 10
    const isLowStock = lowStockProducts.length > 0;

    // Bottle Stock Levels (Product-Wise Progress Bars)
    const bottleStockLevels = productInventories.map((inv) => ({
      size: inv.product.size,
      available:
        inv.totalAdded > 0
          ? Math.round((inv.currentStock / inv.totalAdded) * 100)
          : 0,
      isLow: inv.currentStock < 10,
      productName: inv.product.name,
      reusable: inv.product.isReusable,
    }));

    // Format Recent Transactions
    const formattedTransactions = recentTransactions.map((item) => ({
      customerName: item.order.customer.name,
      driverName: item.order.driver?.name || "Unassigned",
      date: item.order.createdAt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      bottles: item.quantity,
      product: `${item.product.name} (${item.product.size})`,
      status:
        item.order.status === "completed" ? "Completed" : item.order.status,
    }));

    // Format Empties Tracking
    const formattedEmpties = pendingCustomers.map((c) => ({
      customerName: c.name,
      pendingReturn: c.empties,
      lastReturn: c.lastOrderDate
        ? new Date(c.lastOrderDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "Never",
      securityDeposit: c.securityDeposit,
      bottlesGiven: c.bottlesGiven,
    }));

    res.json({
      // Aggregates
      totalBottles,
      inStock: inStockTotal,
      withCustomers: withCustomersTotal,
      totalSecurityDeposit: Number(
        (totalDeposit._sum.securityDeposit || 0).toFixed(2)
      ),

      // Low Stock Alert
      lowStockAlert: isLowStock,
      lowStockMessage: isLowStock
        ? `Low stock in ${lowStockProducts.length} products: ${lowStockProducts
            .map((p) => p.product.name)
            .join(", ")}`
        : null,

      // Product-Wise Levels (for bars/table)
      bottleStockLevels,

      // Product Inventories (Full List for Table)
      productInventories: productInventories.map((inv) => ({
        ...inv,
        currentStock: inv.currentStock,
        totalSold: inv.totalSold,
        totalAdded: inv.totalAdded,
      })),

      // Recent Transactions
      recentTransactions: formattedTransactions,

      // Pending Empties
      emptiesTracking: formattedEmpties,

      // Global Reusable Pool (Optional, for reusable aggregate)
      globalReusablePool: bottleInv || {
        totalPurchased: 0,
        inStock: 0,
        withCustomers: 0,
        damaged: 0,
        leaked: 0,
        repairable: 0,
        lost: 0,
      },
    });
  } catch (err) {
    console.error("Get Inventory Error:", err);
    res.status(500).json({ error: "Failed to load inventory" });
  }
};

exports.addStock = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const tenantId = req.derivedTenantId;
    const userId = req.user.id; // Track who added

    if (!productId || !quantity || quantity <= 0) {
      return res
        .status(400)
        .json({ error: "Product ID aur positive quantity required" });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId, tenantId },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Upsert ProductInventory (Agar nahi hai to create, else update)
    const updatedInventory = await prisma.productInventory.upsert({
      where: { productId_tenantId: { productId, tenantId } },
      update: {
        currentStock: { increment: Number(quantity) },
        totalAdded: { increment: Number(quantity) },
        userId, // Last updated by
      },
      create: {
        productId,
        tenantId,
        currentStock: Number(quantity),
        totalAdded: Number(quantity),
        totalSold: 0,
        userId,
      },
    });

    // Global Reusable Pool Update (Sirf reusable products ke liye)
    if (product.isReusable) {
      await prisma.bottleInventory.upsert({
        where: { tenantId },
        update: {
          totalPurchased: { increment: Number(quantity) },
          inStock: { increment: Number(quantity) },
        },
        create: {
          tenantId,
          totalPurchased: Number(quantity),
          inStock: Number(quantity),
          withCustomers: 0,
          damaged: 0,
          leaked: 0,
          repairable: 0,
          lost: 0,
        },
      });
    }

    res.status(201).json({
      message: `${quantity} units of ${product.name} (${product.size}) stock mein add ho gaye!`,
      product,
      inventory: updatedInventory,
    });
  } catch (err) {
    console.error("Add Stock Error:", err);
    res.status(500).json({ error: "Stock add karne mein error" });
  }
};
