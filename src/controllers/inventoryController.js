// ==================== INVENTORY CONTROLLER ====================
// src/controllers/inventoryController.js
// FULL PRODUCT-WISE INVENTORY + GLOBAL REUSABLE POOL - FIXED ORDERBY - NOV 23, 2025
// FIXED: Cross-Check Global Pool vs Product Sum for Reusables - NOV 24, 2025

const prisma = require("../prisma/client");

exports.getInventory = async (req, res) => {
  try {
    const tenantId = req.derivedTenantId;

    // 1. Product-Wise Inventory
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

    // 2. Global Reusable Bottle Pool
    const bottleInv = await prisma.bottleInventory.findUnique({
      where: { tenantId },
    });

    // 3. Total Security Deposit
    const totalDeposit = await prisma.customer.aggregate({
      where: { tenantId },
      _sum: { securityDeposit: true },
    });

    // 4. Recent Transactions
    const recentTransactions = await prisma.orderItem.findMany({
      where: {
        order: { tenantId },
        product: { isReusable: true },
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
      orderBy: { order: { createdAt: "desc" } },
      take: 10,
    });

    // 🔴 UPDATED: Get customers with next delivery info
    const pendingCustomers = await prisma.customer.findMany({
      where: {
        tenantId,
        empties: { gt: 0 },
        // Only customers with active orders/deliveries
        orders: {
          some: {
            status: { in: ["pending", "in_progress", "delivered"] },
          },
        },
      },
      select: {
        name: true,
        empties: true,
        bottlesGiven: true,
        securityDeposit: true,
        lastOrderDate: true,
        id: true, // Needed for order query
      },
      orderBy: { empties: "desc" },
      take: 10,
    });

    // 🔴 NEW: Calculate expected empties for each customer's next delivery
    const formattedEmpties = await Promise.all(
      pendingCustomers.map(async (c) => {
        // Find next order for this customer
        const nextOrder = await prisma.order.findFirst({
          where: {
            customerId: c.id,
            tenantId,
            status: { in: ["pending", "in_progress", "delivered"] },
            deliveryDate: { gte: new Date() }, // Upcoming or today
          },
          include: {
            items: {
              include: {
                product: {
                  select: {
                    isReusable: true,
                    requiresEmptyReturn: true,
                  },
                },
              },
            },
          },
          orderBy: { deliveryDate: "asc" },
        });

        let expectedEmpties = 0;
        let orderType = "No upcoming order";

        if (nextOrder) {
          // Check if it's a refill order (withBottles: false)
          if (nextOrder.withBottles === false) {
            const reusableItems = nextOrder.items.filter(
              (item) =>
                item.product.isReusable && item.product.requiresEmptyReturn
            );
            expectedEmpties = reusableItems.reduce(
              (sum, item) => sum + item.quantity,
              0
            );
            orderType = "Refill Order";
          } else {
            orderType = "First-time Delivery";
            // First-time delivery - no empties expected
            expectedEmpties = 0;
          }
        }

        return {
          customerName: c.name,
          totalEmptiesWithCustomer: c.empties, // Total empties customer has
          pendingReturn: expectedEmpties, // Expected empties in next delivery
          lastReturn: c.lastOrderDate
            ? new Date(c.lastOrderDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "Never",
          securityDeposit: c.securityDeposit,
          bottlesGiven: c.bottlesGiven,
          nextOrderType: orderType,
          note:
            expectedEmpties > 0
              ? `Next delivery: Collect ${expectedEmpties} empties`
              : orderType === "First-time Delivery"
              ? "First-time delivery - delivering bottles"
              : "No empties expected",
        };
      })
    );

    // 5. Calculate Aggregates
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
    );
    const isLowStock = lowStockProducts.length > 0;

    // 6. Bottle Stock Levels
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

    // 7. Format Recent Transactions
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

      // Product-Wise Levels
      bottleStockLevels,

      // Product Inventories
      productInventories: productInventories.map((inv) => ({
        ...inv,
        currentStock: inv.currentStock,
        totalSold: inv.totalSold,
        totalAdded: inv.totalAdded,
      })),

      // Recent Transactions
      recentTransactions: formattedTransactions,

      // 🔴 UPDATED: Pending Empties (Expected for next delivery)
      emptiesTracking: formattedEmpties.filter((e) => e.pendingReturn > 0),

      // Optional: Customers with empties but no upcoming delivery
      customersWithEmpties: formattedEmpties
        .filter((e) => e.totalEmptiesWithCustomer > 0 && e.pendingReturn === 0)
        .map((c) => ({
          customerName: c.customerName,
          totalEmpties: c.totalEmptiesWithCustomer,
          note: "Customer has empties but no upcoming delivery scheduled",
        })),

      // Global Reusable Pool
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
