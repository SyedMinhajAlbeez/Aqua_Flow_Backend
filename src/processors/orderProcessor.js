
const DeliveryDateUtil = require("./../utils/DeliveryDateUtil");

class OrderProcessor {
  constructor(orderRepository) {
    this.orderRepository = orderRepository;
  }

  async process(order) {
    try
    {
      order.orderNumberDisplay = await this.generateOrderDisplayNumber(order.tenantId);
      order.deliveryDate =  DeliveryDateUtil.getNextDeliveryDate(order.deliveryDate, order.recurrence);
      order.nextRecurringDate = DeliveryDateUtil.getNextDeliveryDate(order.deliveryDate, order.recurrence); // Set nextRecurringDate same as deliveryDate for the first order, it will be updated in the next cycle based on the recurrence pattern
      return order;
    } 
    catch (error) {
      console.error("Error processing orders:", error);
      throw error;
    }
 
  }

  async generateOrderDisplayNumber(tenantId) {
      const orderCount = await this.orderRepository.countByTenant(tenantId);
      return `#${1000 + orderCount + 1}`;
  }
}

module.exports = OrderProcessor;