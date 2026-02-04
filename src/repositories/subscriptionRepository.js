const prisma = require("../prisma/client");

class SubscriptionRepository {

//This method fetches ACTIVE subscriptions with ALL their orders completed/delivered
  async getActiveSubscriptionsWithCompletedOrders() {
   return await prisma.subscription.findMany({
      where: {
        status: "ACTIVE",
        orders: {
          every: {  // Changed from "some" to "every"
            status: {
              in: ["completed", "delivered"],
            },
          },
        },
      },
      include: {
        customer: true,
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
        include: {
            items: true,
          },
        },
      },
    });
  }
}

module.exports = new SubscriptionRepository();



 