class OrderFactory {

    
  static createFromSubscription(subscription, existingOrder) {

    return {
      customerId: existingOrder.customerId,
      tenantId: existingOrder.tenantId,
      zoneId: existingOrder.zoneId,
      isRecurring: true,
      driverId: existingOrder.driverId || undefined,
      scheduledDate: new Date(),
      deliveryDate : existingOrder.deliveryDate,
      deliveryAddress: existingOrder.deliveryAddress,
      totalAmount: existingOrder.totalAmount,
      paymentMethod: existingOrder.paymentMethod,
      status: "pending",
      acceptableDepositAmount: existingOrder.acceptableDepositAmount,
      recurrence: existingOrder.recurrence,
      subscriptionId: subscription.id,
      withBottles: existingOrder.withBottles,
      createdById: existingOrder.createdById || undefined,
      items: {
        create: existingOrder.items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          depositAmount: item.depositAmount,
        })),
      },
    };
  }
}

module.exports = OrderFactory;