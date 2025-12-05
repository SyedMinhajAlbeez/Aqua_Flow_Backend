// src/utils/notificationService.js

const prisma = require("../prisma/client");

// ==================== SIMPLE NOTIFICATION SYSTEM ====================

/**
 * Log notification for debugging
 */
exports.logNotification = (type, details) => {
  const timestamp = new Date().toLocaleString("en-PK");
  console.log(`[${timestamp}] 🔔 ${type}:`, details);

  // You can also save to database for future reference
  saveNotificationToDatabase(type, details);
};

/**
 * Mock push notification (for development)
 */
exports.sendPushNotification = async (customerId, notification) => {
  try {
    // Get customer details
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { name: true, phone: true },
    });

    if (!customer) {
      return { success: false, error: "Customer not found" };
    }

    const logData = {
      customerId,
      customerName: customer.name,
      customerPhone: customer.phone,
      notification: {
        title: notification.title || "Water Delivery",
        body: notification.body || "You have a new notification",
        type: notification.type || "general",
      },
      timestamp: new Date(),
      status: "logged",
    };

    // Log to console
    console.log(`
    📱 PUSH NOTIFICATION (Mock)
    =================================
    To: ${customer.name} (${customer.phone})
    Title: ${notification.title || "Water Delivery"}
    Message: ${notification.body}
    Type: ${notification.type || "general"}
    Time: ${new Date().toLocaleString("en-PK")}
    =================================
    `);

    // Save to database (optional)
    await saveNotificationToDatabase("push", logData);

    return {
      success: true,
      message: "Notification logged successfully",
      mock: true,
      ...logData,
    };
  } catch (error) {
    console.error("Error logging push notification:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Mock SMS notification (for development)
 */
exports.sendSMS = async (phoneNumber, message) => {
  try {
    // Format Pakistani phone number
    const formattedPhone = formatPhoneNumber(phoneNumber);

    const logData = {
      phone: formattedPhone,
      message,
      timestamp: new Date(),
      status: "logged",
    };

    // Log to console
    console.log(`
    📲 SMS NOTIFICATION (Mock)
    =================================
    To: ${formattedPhone}
    Message: ${message}
    Time: ${new Date().toLocaleString("en-PK")}
    =================================
    `);

    // Save to database (optional)
    await saveNotificationToDatabase("sms", logData);

    return {
      success: true,
      message: "SMS logged successfully",
      mock: true,
      ...logData,
    };
  } catch (error) {
    console.error("Error logging SMS:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Send delivery reminder (1 day before)
 */
exports.sendDeliveryReminder = async (customerId, orderDetails) => {
  try {
    const { orderId, deliveryDate, quantity, productName } = orderDetails;

    // Get customer
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { name: true, phone: true },
    });

    if (!customer) {
      return { success: false, error: "Customer not found" };
    }

    // Format delivery date
    const deliveryDay = new Date(deliveryDate).toLocaleDateString("en-PK", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Create messages
    const pushMessage = {
      title: "📦 Delivery Reminder",
      body: `Your ${quantity} ${productName} delivery is scheduled for ${deliveryDay}. Tap to edit if needed.`,
      type: "delivery_reminder",
    };

    const smsMessage = `Water Delivery: Your ${quantity} ${productName} delivery is scheduled for ${deliveryDay}. Reply STOP to unsubscribe.`;

    // Send both notifications
    const pushResult = await exports.sendPushNotification(
      customerId,
      pushMessage,
      {
        orderId,
        deliveryDate,
        quantity,
        productName,
        action: "edit_order",
      }
    );

    const smsResult = await exports.sendSMS(customer.phone, smsMessage);

    // Update order notification sent status
    await prisma.order.update({
      where: { id: orderId },
      data: { notificationSent: true },
    });

    return {
      success: true,
      push: pushResult,
      sms: smsResult,
      customer: customer.name,
      deliveryDate: deliveryDay,
    };
  } catch (error) {
    console.error("Error sending delivery reminder:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Send order status update
 */
exports.sendOrderStatusUpdate = async (
  customerId,
  orderNumber,
  status,
  driverName = null
) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { name: true, phone: true },
    });

    if (!customer) {
      return { success: false, error: "Customer not found" };
    }

    // Determine message based on status
    let title, body, smsMessage;

    switch (status) {
      case "confirmed":
        title = "✅ Order Confirmed";
        body = `Order ${orderNumber} has been confirmed and is being processed.`;
        smsMessage = `Your order ${orderNumber} has been confirmed. It will be delivered soon.`;
        break;
      case "in_progress":
        title = "🚚 Order Processing";
        body = `Order ${orderNumber} is being prepared for delivery.`;
        smsMessage = `Your order ${orderNumber} is being prepared for delivery.`;
        break;
      case "out_for_delivery":
        title = "🛵 Out for Delivery";
        body = driverName
          ? `Your order ${orderNumber} is out for delivery with ${driverName}.`
          : `Your order ${orderNumber} is out for delivery.`;
        smsMessage = `Your order ${orderNumber} is out for delivery. Driver will arrive soon.`;
        break;
      case "delivered":
        title = "🎉 Order Delivered";
        body = `Order ${orderNumber} has been delivered successfully!`;
        smsMessage = `Your order ${orderNumber} has been delivered. Thank you!`;
        break;
      case "completed":
        title = "✅ Order Completed";
        body = `Order ${orderNumber} has been completed. Thank you!`;
        smsMessage = `Your order ${orderNumber} has been completed.`;
        break;
      default:
        title = "Order Update";
        body = `Your order ${orderNumber} status has been updated to ${status}.`;
        smsMessage = `Your order ${orderNumber} status: ${status}`;
    }

    const notification = {
      title,
      body,
      type: "order_status_update",
    };

    // Send notifications
    const pushResult = await exports.sendPushNotification(
      customerId,
      notification,
      {
        orderNumber,
        status,
        driverName,
      }
    );

    const smsResult = await exports.sendSMS(customer.phone, smsMessage);

    return {
      success: true,
      push: pushResult,
      sms: smsResult,
      customer: customer.name,
    };
  } catch (error) {
    console.error("Error sending order status update:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Send driver assignment notification
 */
exports.sendDriverAssignment = async (driverId, assignmentDetails) => {
  try {
    const { orderCount, zoneName, scheduledDate } = assignmentDetails;

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { name: true, phone: true },
    });

    if (!driver) {
      return { success: false, error: "Driver not found" };
    }

    const formattedDate = new Date(scheduledDate).toLocaleDateString("en-PK", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    const notification = {
      title: "📋 New Delivery Assignment",
      body: `You have ${orderCount} delivery${
        orderCount > 1 ? "s" : ""
      } in ${zoneName} on ${formattedDate}.`,
      type: "driver_assignment",
    };

    const smsMessage = `New Assignment: ${orderCount} delivery${
      orderCount > 1 ? "s" : ""
    } in ${zoneName} on ${formattedDate}.`;

    const pushResult = await exports.sendPushNotification(
      driverId,
      notification,
      {
        driverId,
        orderCount,
        zoneName,
        scheduledDate,
      }
    );

    const smsResult = await exports.sendSMS(driver.phone, smsMessage);

    return {
      success: true,
      push: pushResult,
      sms: smsResult,
      driver: driver.name,
    };
  } catch (error) {
    console.error("Error sending driver assignment:", error);
    return { success: false, error: error.message };
  }
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Save notification to database (optional)
 */
async function saveNotificationToDatabase(type, details) {
  try {
    // Create a notifications table in your schema if you want to save
    // For now, we'll just log to console
    console.log(
      `[${new Date().toLocaleString("en-PK")}] 📝 ${type.toUpperCase()} SAVED:`,
      details
    );
  } catch (error) {
    console.error("Error saving notification to database:", error);
  }
}

/**
 * Format Pakistani phone number
 */
function formatPhoneNumber(phone) {
  if (!phone) return null;

  // Remove any non-digit characters
  const cleaned = phone.replace(/\D/g, "");

  // Pakistan number formatting
  if (cleaned.startsWith("92")) {
    return `+${cleaned}`;
  } else if (cleaned.startsWith("0")) {
    return `+92${cleaned.substring(1)}`;
  } else if (cleaned.length === 10) {
    return `+92${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith("3")) {
    return `+92${cleaned}`;
  }

  return phone; // Return as is if can't format
}

/**
 * Get notification stats
 */
exports.getNotificationStats = async (tenantId) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // You can implement actual stats when you save to database
    return {
      totalSent: 0,
      sentToday: 0,
      deliveryReminders: 0,
      statusUpdates: 0,
      driverAssignments: 0,
    };
  } catch (error) {
    console.error("Error getting notification stats:", error);
    return null;
  }
};

/**
 * Test notification service
 */
exports.testNotification = async () => {
  console.log(`
  🧪 TESTING NOTIFICATION SERVICE
  ================================
  Service: Mock/Development Mode
  Features:
  ✓ Push Notifications (Console Log)
  ✓ SMS Notifications (Console Log) 
  ✓ Delivery Reminders
  ✓ Order Status Updates
  ✓ Driver Assignments
  ================================
  `);

  return {
    status: "active",
    mode: "mock",
    message: "Notification service is working in development mode",
  };
};

console.log("✅ Simple Notification Service Initialized (Development Mode)");
