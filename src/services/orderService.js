const OrderFactory = require("../factories/orderFactory");
const OrderProcessor = require("../processors/orderProcessor");

class OrderService {

  constructor(subscriptionRepository, orderRepository) {
    this.subscriptionRepository = subscriptionRepository;
    this.orderRepository = orderRepository;
    this.orderProcessor = new OrderProcessor(orderRepository);
  }

  async createOrdersFromActiveSubscriptions() {
    try {
      const subscriptions = await this.subscriptionRepository.getActiveSubscriptionsWithCompletedOrders();

  
      const createdOrders = [];
      for (const subscription of subscriptions) {
        for (const existingOrder of subscription.orders) {
             
          let newOrderData = OrderFactory.createFromSubscription(
            subscription,
            existingOrder
          );

            const data =  await this.orderProcessor.process(newOrderData);
            const newOrder = await this.orderRepository.create(data);
       
          createdOrders.push(newOrder);
        }
      }

      return {
        success: true,
        count: createdOrders.length,
        orders: createdOrders,
      };
    } catch (error) {
      console.error("Error creating orders from subscriptions:", error);
      throw error;
    }
  }
}

module.exports = OrderService;