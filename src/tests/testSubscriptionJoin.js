// src/routes/testSubscriptionJoin.js
const express = require("express");
const { createSubscriptionOrders } = require("../controllers/testController");
const router = express.Router();

router.get("/subscriptions-ready-for-orders", createSubscriptionOrders);

// Detailed view - see all active subscriptions with their order status
router.get("/subscriptions-detailed", async (req, res) => {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const subscriptions = await prisma.subscription.findMany({
      where: {
        status: "ACTIVE",
        nextDeliveryDate: {
          gte: tomorrow,
          lte: nextWeek,
        },
      },
      include: {
        product: true,
        orders: {
          where: {
            status: {
              in: ["completed", "delivered"],
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
    });

    const detailed = subscriptions.map((sub) => ({
      id: sub.id,
      status: sub.status,
      nextDeliveryDate: sub.nextDeliveryDate,
      productName: sub.product.name,
      hasCompletedPreviousOrder: sub.orders.length > 0,
      lastCompletedOrder: sub.orders[0] || null,
      readyForNewOrder: sub.orders.length > 0,
    }));

    res.json({
      success: true,
      total: subscriptions.length,
      readyCount: detailed.filter((d) => d.readyForNewOrder).length,
      subscriptions: detailed,
    });
  } catch (error) {
    console.error("Error fetching detailed subscriptions:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;