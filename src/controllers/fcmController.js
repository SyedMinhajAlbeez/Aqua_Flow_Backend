// controllers/fcmController.js (Updated with customer functions)
const prisma = require("../prisma/client");
const admin = require("../../config/firebaseAdmin"); // ✅ SINGLE IMPORT
const notificationService = require("../utils/notificationService"); // ✅ Notification service import

/**
 * Update Driver FCM Token (Driver app se ayega)
 * POST /api/fcm/update-token
 */
exports.updateFCMToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const driverId = req.user.id;
    const driverRole = req.user.role;

    // Validation
    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    if (driverRole !== "driver") {
      return res.status(403).json({
        success: false,
        message: "Only drivers can update FCM token",
      });
    }

    // Check driver exists
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true, name: true, fcmToken: true },
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    // Update token in database
    const updatedDriver = await prisma.driver.update({
      where: { id: driverId },
      data: { fcmToken },
      select: { id: true, name: true, fcmToken: true },
    });

    console.log(`✅ FCM Token Updated for driver: ${driver.name}`);
    const companyName = driver.tenant?.name || "Aqua Flow"; // fallback agar tenant na mila
    // Send welcome notification using notificationService
    let welcomeResult = null;
    if (admin.apps.length) {
      welcomeResult = await notificationService.sendPushToDriver(
        driverId,
        {
          // title: "🔔 FCM Token Registered",
          title: `Hi ${driver.name}, Welcome!`,
          body: `Hello ${driver.name}!\n\n${companyName} Driver App notifications are live.\nStay updated with new orders & assignments.\nDrive safe!`,
          type: "FCM_REGISTRATION",
        },
        {
          driverId: driverId,
          timestamp: new Date().toISOString(),
        },
      );
    }

    // Success response
    res.json({
      success: true,
      message: "FCM token updated successfully",
      driver: {
        id: updatedDriver.id,
        name: updatedDriver.name,
        hasToken: !!updatedDriver.fcmToken,
      },
      welcomeNotification: welcomeResult,
    });
  } catch (error) {
    console.error("❌ Update FCM Token Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update FCM token",
      error: error.message,
    });
  }
};

/**
 * NEW: Update Customer FCM Token (Customer app se ayega)
 * POST /api/fcm/update-token-customer
 */
exports.updateFCMTokenCustomer = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const customerId = req.user.id; // Assuming req.user is set for authenticated customer
    const customerRole = req.user.role; // Adjust based on your auth system, e.g., "customer"

    // Validation
    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    if (customerRole !== "customer") {
      // Adjust role check as per your system
      return res.status(403).json({
        success: false,
        message: "Only customers can update FCM token",
      });
    }

    // Check customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, fcmToken: true },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Update token in database
    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: { fcmToken },
      select: { id: true, name: true, fcmToken: true },
    });

    console.log(`✅ FCM Token Updated for customer: ${customer.name}`);
    const companyName = customer.tenant?.name || "Aqua Flow"; // fallback
    // Send welcome notification using notificationService
    let welcomeResult = null;
    if (admin.apps.length) {
      welcomeResult = await notificationService.sendPushToCustomer(
        customerId,
        {
          title: `Hi ${customer.name}, Welcome!`,
          body: `Hello ${customer.name}!\n\n${companyName} Customer App notifications are live.\nStay updated with your orders & deliveries.\nEnjoy!`,
          type: "FCM_REGISTRATION",
        },
        {
          customerId: customerId,
          timestamp: new Date().toISOString(),
        },
      );
    }

    // Success response
    res.json({
      success: true,
      message: "FCM token updated successfully",
      customer: {
        id: updatedCustomer.id,
        name: updatedCustomer.name,
        hasToken: !!updatedCustomer.fcmToken,
      },
      welcomeNotification: welcomeResult,
    });
  } catch (error) {
    console.error("❌ Update Customer FCM Token Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update FCM token",
      error: error.message,
    });
  }
};

/**
 * Send notification to driver by ID (Admin use karega)
 * POST /api/fcm/send-to-driver
 */
exports.sendToDriverById = async (req, res) => {
  try {
    const { driverId, title, body, data } = req.body;

    // Use notificationService (REAL FCM)
    const result = await notificationService.sendPushToDriver(
      driverId,
      {
        title: title || "Notification",
        body: body || "You have a new message",
        type: data?.type || "GENERAL",
      },
      data || {},
    );

    res.json(result);
  } catch (error) {
    console.error("Send to driver error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * NEW: Send notification to customer by ID (Admin use karega)
 * POST /api/fcm/send-to-customer
 */
exports.sendToCustomerById = async (req, res) => {
  try {
    const { customerId, title, body, data } = req.body;

    // Use notificationService (REAL FCM)
    const result = await notificationService.sendPushToCustomer(
      customerId,
      {
        title: title || "Notification",
        body: body || "You have a new message",
        type: data?.type || "GENERAL",
      },
      data || {},
    );

    res.json(result);
  } catch (error) {
    console.error("Send to customer error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/fcm/notify-driver-assigned (or /notifications/resend-assignment)
 * Manual resend for a specific order assignment notification
 */
exports.notifyDriverOrderAssigned = async (req, res) => {
  try {
    const { driverId, orderId } = req.body;

    if (!driverId || !orderId) {
      return res.status(400).json({
        success: false,
        message: "driverId and orderId are required",
      });
    }

    console.log(
      "[RESEND-NOTIFY] Manual resend requested | driverId:",
      driverId,
      "orderId:",
      orderId,
    );

    // Fetch richer order + driver + zone data
    const [order, driver] = await Promise.all([
      prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          orderNumberDisplay: true,
          scheduledDate: true,
          customer: {
            select: { name: true, phone: true },
          },
          // If order has zone relation (recommended)
          zone: { select: { name: true } }, // ← add this if your schema has order.zoneId @relation to Zone
          // If no zone relation on order, fetch from customer instead (below)
        },
      }),
      prisma.driver.findUnique({
        where: { id: driverId },
        select: { id: true, name: true },
      }),
    ]);

    if (!order) {
      console.log("[RESEND-NOTIFY] Order not found:", orderId);
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (!driver) {
      console.log("[RESEND-NOTIFY] Driver not found:", driverId);
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });
    }

    // Get zone name — prefer order.zone if exists, else fallback to customer's zone
    let zoneName = order.zone?.name;
    if (!zoneName) {
      // Fallback: get from customer (assuming customer has zoneId)
      const customerZone = await prisma.customer.findUnique({
        where: { id: order.customerId }, // assuming order has customerId
        select: { zone: { select: { name: true } } },
      });
      zoneName = customerZone?.zone?.name || "Zone";
    }

    // Build rich details
    const assignmentDetails = {
      orderId: order.id,
      orderNumber:
        order.orderNumber ||
        order.orderNumberDisplay ||
        `ORD-${orderId.slice(0, 8)}`,
      customerName: order.customer?.name || "Customer",
      zone: zoneName,
      deliveryTime: order.scheduledDate
        ? order.scheduledDate.toISOString()
        : new Date().toISOString(),
      totalOrders: 1,
      customerCount: 1,
      isBulk: false,
    };

    console.log(
      "[RESEND-NOTIFY] Sending resend with details:",
      assignmentDetails,
    );

    const result = await notificationService.notifyOrderAssigned(
      driverId,
      assignmentDetails,
    );

    console.log("[RESEND-NOTIFY] Result:", {
      success: result.success,
      mock: result.mock || false,
      messageId: result.messageId || "N/A",
      error: result.error || null,
    });

    return res.json({
      success: true,
      message: `Assignment notification re-sent to ${driver.name}`,
      driverName: driver.name,
      orderNumber: assignmentDetails.orderNumber,
      customerName: assignmentDetails.customerName,
      zone: assignmentDetails.zone,
      notificationResult: result,
    });
  } catch (error) {
    console.error("[RESEND-NOTIFY] Error during resend:", error.message);
    console.error("[RESEND-NOTIFY] Full error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.notifyDriverOrderStatusChange = async (req, res) => {
  try {
    const { driverId, orderId, status } = req.body;

    // Required fields
    if (!driverId || !orderId || !status) {
      return res.status(400).json({
        success: false,
        message: "driverId, orderId, and status are required",
      });
    }

    console.log("[STATUS-NOTIFY] Manual status change requested", {
      driverId,
      orderId,
      status,
    });

    // Fetch real order & driver data for better accuracy
    const [order, driver] = await Promise.all([
      prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          orderNumberDisplay: true,
          status: true, // current DB status (for logging)
          customer: {
            select: { name: true },
          },
        },
      }),
      prisma.driver.findUnique({
        where: { id: driverId },
        select: { id: true, name: true },
      }),
    ]);

    if (!order) {
      console.log("[STATUS-NOTIFY] Order not found:", orderId);
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (!driver) {
      console.log("[STATUS-NOTIFY] Driver not found:", driverId);
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });
    }

    // Use real values when available, fallback to request body
    const statusDetails = {
      orderId: order.id,
      orderNumber:
        order.orderNumber ||
        order.orderNumberDisplay ||
        `ORD-${orderId.slice(0, 8)}`,
      status: status, // from request
      customerName: order.customer?.name || "Customer",
    };

    console.log(
      "[STATUS-NOTIFY] Sending status update with details:",
      statusDetails,
    );

    const result = await notificationService.notifyOrderStatusChange(
      driverId,
      statusDetails,
    );

    console.log("[STATUS-NOTIFY] Result:", {
      success: result.success,
      mock: result.mock || false,
      messageId: result.messageId || "N/A",
      error: result.error || null,
    });

    return res.json({
      success: true,
      message: `Order status "${status}" notification sent to ${driver.name}`,
      driverName: driver.name,
      orderNumber: statusDetails.orderNumber,
      customerName: statusDetails.customerName,
      status,
      notificationResult: result,
    });
  } catch (error) {
    console.error("[STATUS-NOTIFY] Error:", error.message);
    console.error("[STATUS-NOTIFY] Full error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to send status notification",
    });
  }
};

/**
 * NEW: POST /api/fcm/notify-customer-status-change
 * Manual send for customer order status change notification
 */
exports.notifyCustomerOrderStatusChange = async (req, res) => {
  try {
    const { customerId, orderId, status } = req.body;

    // Required fields
    if (!customerId || !orderId || !status) {
      return res.status(400).json({
        success: false,
        message: "customerId, orderId, and status are required",
      });
    }

    console.log("[CUSTOMER-STATUS-NOTIFY] Manual status change requested", {
      customerId,
      orderId,
      status,
    });

    // Fetch real order & customer data for better accuracy
    const [order, customer] = await Promise.all([
      prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          orderNumberDisplay: true,
          status: true, // current DB status (for logging)
          driver: {
            select: { name: true },
          },
        },
      }),
      prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true, name: true },
      }),
    ]);

    if (!order) {
      console.log("[CUSTOMER-STATUS-NOTIFY] Order not found:", orderId);
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (!customer) {
      console.log("[CUSTOMER-STATUS-NOTIFY] Customer not found:", customerId);
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    // Use real values when available, fallback to request body
    const statusDetails = {
      orderId: order.id,
      orderNumber:
        order.orderNumber ||
        order.orderNumberDisplay ||
        `ORD-${orderId.slice(0, 8)}`,
      status: status, // from request
      driverName: order.driver?.name || "Driver",
    };

    console.log(
      "[CUSTOMER-STATUS-NOTIFY] Sending status update with details:",
      statusDetails,
    );

    const result = await notificationService.notifyOrderStatusChangeToCustomer(
      customerId,
      statusDetails,
    );

    console.log("[CUSTOMER-STATUS-NOTIFY] Result:", {
      success: result.success,
      mock: result.mock || false,
      messageId: result.messageId || "N/A",
      error: result.error || null,
    });

    return res.json({
      success: true,
      message: `Order status "${status}" notification sent to ${customer.name}`,
      customerName: customer.name,
      orderNumber: statusDetails.orderNumber,
      driverName: statusDetails.driverName,
      status,
      notificationResult: result,
    });
  } catch (error) {
    console.error("[CUSTOMER-STATUS-NOTIFY] Error:", error.message);
    console.error("[CUSTOMER-STATUS-NOTIFY] Full error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to send status notification",
    });
  }
};

/**
 * Public test endpoint (Direct token se test)
 * POST /api/fcm/test-fcm
 */
exports.testNotification = async (req, res) => {
  try {
    const { fcmToken, title = "Test", body = "Test notification" } = req.body;

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    // Check Firebase
    if (!admin.apps.length) {
      return res.json({
        success: true,
        message: "Test mode: Add serviceAccountKey.json for real notifications",
        testData: { token: fcmToken, title, body },
      });
    }

    // Send direct FCM
    const message = {
      token: fcmToken,
      notification: { title, body },
      data: { type: "TEST", timestamp: new Date().toISOString() },
    };

    const response = await admin.messaging().send(message);

    res.json({
      success: true,
      message: "Test notification sent successfully!",
      fcmResponse: response,
    });
  } catch (error) {
    console.error("Test Notification Error:", error);

    let userMessage = "Failed to send test notification";
    if (error.code === "messaging/invalid-registration-token") {
      userMessage = "Invalid FCM token";
    }

    res.status(400).json({
      success: false,
      message: userMessage,
      error: error.message,
      code: error.code,
    });
  }
};

/**
 * NEW: Test customer notification by customer ID
 * POST /api/fcm/test-customer
 */
exports.testCustomerNotification = async (req, res) => {
  try {
    const customerId = req.user.id; // Logged-in customer
    const { title = "Test", body = "Test notification to customer" } = req.body;

    const result = await notificationService.testRealFCMCustomer(customerId, {
      title,
      body,
    });

    res.json(result);
  } catch (error) {
    console.error("Test customer notification error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
