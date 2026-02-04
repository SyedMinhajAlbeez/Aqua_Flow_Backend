const OrderCreationService = require("../services/orderService");
const orderRepository = require("../repositories/orderRepository");
const subscriptionRepository = require("../repositories/subscriptionRepository");

const orderCreationService = new OrderCreationService(
  subscriptionRepository,
  orderRepository
);

async function createSubscriptionOrders(req, res) {
  try {
    const result = await orderCreationService.createOrdersFromActiveSubscriptions();
    res.json({
      message: "Orders created successfully",
      ...result,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  createSubscriptionOrders,
};