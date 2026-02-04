// utils/notificationService.js - UPDATED WITH CUSTOMER FUNCTIONS
const prisma = require("../prisma/client");
const admin = require("../../config/firebaseAdmin");

console.log("✅ Notification Service Initialized");

// ==================== CORE FCM FUNCTIONS ====================

/**
 * Send REAL FCM notification to driver
 */
exports.sendPushToDriver = async (driverId, notification, data = {}) => {
  try {
    // Get driver details
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { fcmToken: true, name: true, phone: true, status: true },
    });

    if (!driver) {
      return { success: false, error: "Driver not found", mock: false };
    }

    if (driver.status !== "active") {
      return { success: false, error: "Driver is not active", mock: false };
    }
    console.log("chekc===============>>>>>>>>>>>>token", driver.fcmToken);
    if (!driver.fcmToken) {
      return {
        success: false,
        error: "Driver has no FCM token",
        code: "NO_FCM_TOKEN",
        mock: false,
      };
    }

    // Check Firebase
    if (!admin.apps.length) {
      return {
        success: true,
        message: "Firebase not initialized",
        mock: true,
        driver: driver.name,
        notification: notification.title,
      };
    }

    // Prepare message
    const message = {
      token: driver.fcmToken,
      notification: {
        title: notification.title || "Water Delivery",
        body: notification.body || "New notification",
      },
      data: {
        type: notification.type || "general",
        driverId: String(driverId),
        timestamp: new Date().toISOString(),
        ...Object.keys(data).reduce((acc, key) => {
          acc[key] = String(data[key]);
          return acc;
        }, {}),
      },
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default", badge: 1 } } },
    };

    // Send notification
    const response = await admin.messaging().send(message);

    console.log(`✅ Notification sent to ${driver.name}`);

    return {
      success: true,
      messageId: response,
      mock: false,
      driver: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
      },
    };
  } catch (error) {
    console.error("❌ FCM Error:", error.message);

    // Handle invalid token
    if (
      error.code === "messaging/invalid-registration-token" ||
      error.code === "messaging/registration-token-not-registered"
    ) {
      // Remove invalid token
      await prisma.driver.update({
        where: { id: driverId },
        data: { fcmToken: null },
      });

      console.log(`Removed invalid token for driver ${driverId}`);
    }

    return {
      success: false,
      error: error.message,
      code: error.code,
      mock: false,
    };
  }
};

/**
 * NEW: Send REAL FCM notification to customer
 */
exports.sendPushToCustomer = async (customerId, notification, data = {}) => {
  try {
    // Get customer details
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { fcmToken: true, name: true, phone: true, status: true },
    });

    if (!customer) {
      return { success: false, error: "Customer not found", mock: false };
    }

    if (customer.status !== "active") {
      return { success: false, error: "Customer is not active", mock: false };
    }

    if (!customer.fcmToken) {
      return {
        success: false,
        error: "Customer has no FCM token",
        code: "NO_FCM_TOKEN",
        mock: false,
      };
    }

    // Check Firebase
    if (!admin.apps.length) {
      return {
        success: true,
        message: "Firebase not initialized",
        mock: true,
        customer: customer.name,
        notification: notification.title,
      };
    }

    // Prepare message
    const message = {
      token: customer.fcmToken,
      notification: {
        title: notification.title || "Water Delivery",
        body: notification.body || "New notification",
      },
      data: {
        type: notification.type || "general",
        customerId: String(customerId),
        timestamp: new Date().toISOString(),
        ...Object.keys(data).reduce((acc, key) => {
          acc[key] = String(data[key]);
          return acc;
        }, {}),
      },
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default", badge: 1 } } },
    };

    // Send notification
    const response = await admin.messaging().send(message);

    console.log(`✅ Notification sent to customer ${customer.name}`);

    return {
      success: true,
      messageId: response,
      mock: false,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
      },
    };
  } catch (error) {
    console.error("❌ FCM Customer Error:", error.message);

    // Handle invalid token
    if (
      error.code === "messaging/invalid-registration-token" ||
      error.code === "messaging/registration-token-not-registered"
    ) {
      // Remove invalid token
      await prisma.customer.update({
        where: { id: customerId },
        data: { fcmToken: null },
      });

      console.log(`Removed invalid token for customer ${customerId}`);
    }

    return {
      success: false,
      error: error.message,
      code: error.code,
      mock: false,
    };
  }
};

// ==================== SPECIFIC NOTIFICATION TYPES ====================

/**
 * Notify driver when order is assigned
 */
exports.notifyOrderAssigned = async (driverId, assignmentDetails) => {
  const {
    orderId = null, // can be null in bulk
    orderNumber = null,
    customerName = null,
    zone = "Zone",
    deliveryTime,
    totalOrders = 1, // ← new: important for bulk
    customerCount = 1, // ← new
    isBulk = false,
  } = assignmentDetails;

  let title, body;

  if (isBulk || totalOrders > 1) {
    title = "📦 New Deliveries Assigned";
    body =
      `You have ${totalOrders} order${totalOrders === 1 ? "" : "s"} ` +
      `for ${customerCount} customer${customerCount === 1 ? "" : "s"} ` +
      `on ${new Date(deliveryTime).toLocaleDateString("en-PK")}`;
  } else {
    title = "📦 New Delivery Assigned";
    body = `Order #${orderNumber} - ${customerName || "Customer"}`;
  }

  return await this.sendPushToDriver(
    driverId,
    {
      title,
      body,
      type: "ORDER_ASSIGNED",
    },
    {
      orderId: orderId || "bulk",
      orderNumber: orderNumber || `Bulk (${totalOrders})`,
      customerName:
        customerName || (customerCount > 1 ? "Multiple" : "Customer"),
      zone,
      deliveryTime,
      totalOrders,
      customerCount,
      isBulk: isBulk || totalOrders > 1,
      action: "VIEW_ASSIGNMENTS", // slightly different action for bulk
    },
  );
};

/**
 * Notify driver when order status changes
 */
exports.notifyOrderStatusChange = async (driverId, statusDetails) => {
  const { orderId, orderNumber, status, customerName } = statusDetails;

  let title, body;
  switch (status) {
    case "out_for_delivery":
      title = "🛵 Out for Delivery";
      body = `Order #${orderNumber} is on the way`;
      break;
    case "delivered":
      title = "✅ Order Delivered";
      body = `Order #${orderNumber} delivered to ${customerName}`;
      break;
    default:
      title = "Order Updated";
      body = `Order #${orderNumber} status: ${status}`;
  }

  return await this.sendPushToDriver(
    driverId,
    { title, body, type: "ORDER_STATUS_CHANGE" },
    { orderId, orderNumber, status, customerName },
  );
};

/**
 * NEW: Notify customer when order status changes
 */
exports.notifyOrderStatusChangeToCustomer = async (
  customerId,
  statusDetails,
) => {
  const { orderId, orderNumber, status, driverName } = statusDetails;

  let title, body;
  switch (status) {
    case "confirmed":
      title = "✅ Order Confirmed";
      // body = `Your Order #${orderNumber} has been confirmed`;
      body = `Aap ka order ${orderNumber} confirm ho gaya hai.`;
      break;
    case "out_for_delivery":
      title = "🛵 On the Way";
      body = `Aap ka order ${orderNumber} delivery ke liye nikal gaya hai${`${driverName} deliver kar rahe hain`}. Jald hi pohanch jayega!`;
      break;
    case "delivered":
      title = "📦 Delivered";
      body = `Aap ka order ${orderNumber} successfully deliver ho gaya hai.`;
      break;
    default:
      title = "Order Updated";
      body = `Aap ke order ${orderNumber} ka status update ho gaya hai: ${status}. Details check karein!`;
  }

  return await this.sendPushToCustomer(
    customerId,
    { title, body, type: "ORDER_STATUS_CHANGE" },
    { orderId, orderNumber, status, driverName },
  );
};

// notificationService.js

exports.notifyPaymentCollectedToCustomer = async (
  customerId,
  paymentDetails,
) => {
  const { paymentId, amount, orderNumber, status, customerName } =
    paymentDetails;

  const title = "💰 Payment Received";
  const body = `Aap ke order #${orderNumber || "N/A"} ky liye Rs${amount} mil gaye hain. Apka Bohat shukriya!`;

  const dataPayload = {
    type: "payment", // ← the key you want
    paymentId: String(paymentId),
    orderId: paymentDetails.orderId || null,
    orderNumber: orderNumber || null,
    amount: String(amount),
    status,
    timestamp: new Date().toISOString(),
  };

  return await this.sendPushToCustomer(
    customerId,
    { title, body, type: "PAYMENT_COLLECTED" }, // or keep "ORDER_STATUS_CHANGE" if you prefer
    dataPayload,
  );
};

/**
 * Notify driver that a payment was collected
 */
exports.notifyPaymentCollected = async (driverId, paymentDetails) => {
  const { paymentId, amount, orderNumber, customerName, status } =
    paymentDetails;

  return await this.sendPushToDriver(
    driverId,
    {
      title: "💰 Payment Collected",
      body: `Pkr${amount} collected from ${customerName || "Customer"} (Order #${orderNumber || "N/A"})`,
      type: "PAYMENT_COLLECTED",
    },
    {
      paymentId,
      amount: String(amount),
      orderNumber: orderNumber || "N/A",
      customerName: customerName || "Customer",
      status,
      action: "VIEW_PAYMENT",
    },
  );
};

/**
 * Notify driver about payment collection
 */
exports.notifyPaymentDue = async (driverId, paymentDetails) => {
  const { customerName, amount, address } = paymentDetails;

  return await this.sendPushToDriver(
    driverId,
    {
      title: "💰 Payment Due",
      body: `Collect Rs${amount} from ${customerName}`,
      type: "PAYMENT_REMINDER",
    },
    { customerName, amount, address },
  );
};

/**
 * Test notification to driver
 */
exports.testRealFCM = async (driverId, testDetails = {}) => {
  return await this.sendPushToDriver(
    driverId,
    {
      title: testDetails.title || "🔔 Test Notification",
      body: testDetails.body || "This is a test notification",
      type: "TEST",
    },
    { test: "true" },
  );
};

/**
 * NEW: Test notification to customer
 */
exports.testRealFCMCustomer = async (customerId, testDetails = {}) => {
  return await this.sendPushToCustomer(
    customerId,
    {
      title: testDetails.title || "🔔 Test Notification",
      body: testDetails.body || "This is a test notification",
      type: "TEST",
    },
    { test: "true" },
  );
};

// ==================== BULK OPERATIONS ====================

/**
 * Notify all active drivers
 */
exports.notifyAllDrivers = async (tenantId, notification, data = {}) => {
  try {
    const drivers = await prisma.driver.findMany({
      where: {
        tenantId,
        status: "active",
        fcmToken: { not: null },
      },
      select: { id: true, name: true },
    });

    const results = [];
    for (const driver of drivers) {
      const result = await this.sendPushToDriver(driver.id, notification, {
        ...data,
        bulk: true,
      });
      results.push({ driverId: driver.id, driverName: driver.name, ...result });
    }

    return {
      success: true,
      total: drivers.length,
      results,
    };
  } catch (error) {
    console.error("Bulk notification error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * NEW: Notify all active customers
 */
exports.notifyAllCustomers = async (tenantId, notification, data = {}) => {
  try {
    const customers = await prisma.customer.findMany({
      where: {
        tenantId,
        status: "active",
        fcmToken: { not: null },
      },
      select: { id: true, name: true },
    });

    const results = [];
    for (const customer of customers) {
      const result = await this.sendPushToCustomer(customer.id, notification, {
        ...data,
        bulk: true,
      });
      results.push({
        customerId: customer.id,
        customerName: customer.name,
        ...result,
      });
    }

    return {
      success: true,
      total: customers.length,
      results,
    };
  } catch (error) {
    console.error("Bulk customer notification error:", error);
    return { success: false, error: error.message };
  }
};

// ==================== UTILITY FUNCTIONS ====================

/**
 * Get driver's FCM status
 */
exports.getDriverFCMStatus = async (driverId) => {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { name: true, fcmToken: true, status: true },
  });

  return {
    hasToken: !!driver?.fcmToken,
    driverName: driver?.name,
    status: driver?.status,
    tokenLength: driver?.fcmToken?.length || 0,
    firebaseReady: admin.apps.length > 0,
  };
};

/**
 * NEW: Get customer's FCM status
 */
exports.getCustomerFCMStatus = async (customerId) => {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, fcmToken: true, status: true },
  });

  return {
    hasToken: !!customer?.fcmToken,
    customerName: customer?.name,
    status: customer?.status,
    tokenLength: customer?.fcmToken?.length || 0,
    firebaseReady: admin.apps.length > 0,
  };
};

/**
 * Get notification statistics
 */
exports.getNotificationStats = async (tenantId) => {
  const drivers = await prisma.driver.findMany({
    where: { tenantId },
    select: { fcmToken: true, status: true },
  });

  const total = drivers.length;
  const withToken = drivers.filter((d) => d.fcmToken).length;
  const activeWithToken = drivers.filter(
    (d) => d.fcmToken && d.status === "active",
  ).length;

  return {
    totalDrivers: total,
    withFCM: withToken,
    activeWithFCM: activeWithToken,
    coverage: total > 0 ? Math.round((withToken / total) * 100) : 0,
    firebaseReady: admin.apps.length > 0,
  };
};

/**
 * NEW: Get customer notification statistics
 */
exports.getCustomerNotificationStats = async (tenantId) => {
  const customers = await prisma.customer.findMany({
    where: { tenantId },
    select: { fcmToken: true, status: true },
  });

  const total = customers.length;
  const withToken = customers.filter((c) => c.fcmToken).length;
  const activeWithToken = customers.filter(
    (c) => c.fcmToken && c.status === "active",
  ).length;

  return {
    totalCustomers: total,
    withFCM: withToken,
    activeWithFCM: activeWithToken,
    coverage: total > 0 ? Math.round((withToken / total) * 100) : 0,
    firebaseReady: admin.apps.length > 0,
  };
};

// ==================== COMPATIBILITY FUNCTIONS (Aapke existing code ke liye) ====================

/**
 * For compatibility with existing sendDriverAssignment calls
 */
exports.sendDriverAssignment = async (driverId, assignmentDetails) => {
  return await this.notifyOrderAssigned(driverId, {
    orderId: assignmentDetails.orderId,
    orderNumber:
      assignmentDetails.orderNumber ||
      `#${assignmentDetails.orderId?.slice(0, 8)}`,
    customerName: assignmentDetails.customerName || "Customer",
    zone: assignmentDetails.zoneName || "Zone",
    deliveryTime: assignmentDetails.scheduledDate || new Date().toISOString(),
  });
};

/**
 * Updated: Real implementation for customer order status update
 */
exports.sendOrderStatusUpdate = async (
  customerId,
  orderNumber,
  status,
  driverName = null,
  orderId = null,
) => {
  console.log(`Order status update for customer ${customerId}: ${status}`);

  return await this.notifyOrderStatusChangeToCustomer(customerId, {
    orderId,
    orderNumber,
    status,
    driverName: driverName || "Driver",
  });
};
