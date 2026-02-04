// controllers/deliveryOperationsController.js - UPDATED

const prisma = require("../prisma/client");
const notificationService = require("../utils/notificationService"); // adjust path if needed

exports.getCustomersByZone = async (req, res) => {
  try {
    const tenantId = req.derivedTenantId;
    const { zoneId } = req.params;

    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const zone = await prisma.zone.findUnique({
      where: { id: zoneId },
      select: { id: true, tenantId: true, name: true },
    });

    if (!zone) return res.status(404).json({ error: "Zone not found" });
    if (zone.tenantId !== tenantId)
      return res.status(403).json({ error: "Access denied" });

    const customers = await prisma.customer.findMany({
      where: {
        zoneId,
        tenantId,
        orders: {
          some: {
            status: "pending",
            tenantId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        empties: true,
        lastOrderDate: true,
        _count: { select: { orders: { where: { status: "pending" } } } },
        orders: {
          where: { status: "pending" },
          select: {
            id: true,
            totalAmount: true,
            orderNumberDisplay: true,
            items: {
              select: {
                quantity: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                    isReusable: true,
                    requiresEmptyReturn: true,
                  },
                },
              },
            },
          },
          take: 5,
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ orders: { _count: "desc" } }, { name: "asc" }],
    });

    if (customers.length === 0) {
      return res.json({
        success: true,
        zone: zone.name,
        message: "No pending deliveries in this zone",
        customers: [],
      });
    }

    const formatted = customers.map((c) => {
      const totalPending = c.orders.reduce((sum, o) => sum + o.totalAmount, 0);
      let deliverableBottles = 0;

      c.orders.forEach((order) => {
        order.items.forEach((item) => {
          if (item.product.isReusable) {
            deliverableBottles += item.quantity;
          }
        });
      });

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        address: c.address,
        empties: c.empties || 0,
        deliverableBottles: deliverableBottles,
        pendingOrdersCount: c._count.orders,
        totalPendingAmount: Number(totalPending.toFixed(2)),
        pendingOrders: c.orders.map((o) => ({
          id: o.id,
          number: o.orderNumberDisplay || `#${o.id.slice(-6)}`,
          amount: o.totalAmount,
        })),
        lastDelivery: c.lastOrderDate
          ? new Date(c.lastOrderDate).toISOString().split("T")[0]
          : "Never",
      };
    });

    res.json({
      success: true,
      zone: zone.name,
      message: `${formatted.length} customers ready for delivery`,
      customers: formatted,
    });
  } catch (error) {
    console.error("getCustomersByZone ERROR:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// exports.assignDriverToCustomers = async (req, res) => {
//   try {
//     const tenantId = req.derivedTenantId;
//     const { zoneId, driverId, scheduledDate, customerIds } = req.body;

//     if (!tenantId) return res.status(401).json({ error: "Unauthorized" });
//     if (
//       !zoneId ||
//       !driverId ||
//       !scheduledDate ||
//       !Array.isArray(customerIds) ||
//       customerIds.length === 0
//     ) {
//       return res.status(400).json({ error: "Missing required fields" });
//     }

//     const scheduled = new Date(scheduledDate);
//     if (isNaN(scheduled.getTime()))
//       return res.status(400).json({ error: "Invalid date" });

//     const [zone, driver] = await Promise.all([
//       prisma.zone.findUnique({ where: { id: zoneId } }),
//       prisma.driver.findUnique({ where: { id: driverId } }),
//     ]);

//     if (!zone || zone.tenantId !== tenantId)
//       return res.status(404).json({ error: "Zone not found" });
//     // if (!driver || driver.zoneId !== zoneId || driver.tenantId !== tenantId) {
//     //   return res.status(404).json({ error: "Driver not in this zone" });
//     // }

//     const result = { assigned: 0, skipped: [] };

//     for (const custId of customerIds) {
//       const customer = await prisma.customer.findUnique({
//         where: { id: custId },
//         select: { id: true, tenantId: true, zoneId: true },
//       });

//       if (
//         !customer ||
//         customer.tenantId !== tenantId ||
//         customer.zoneId !== zoneId
//       ) {
//         result.skipped.push({ customerId: custId, reason: "Invalid customer" });
//         continue;
//       }

//       const updated = await prisma.order.updateMany({
//         where: { customerId: custId, status: "pending", tenantId },
//         data: {
//           driverId,
//           status: "in_progress",
//           scheduledDate: scheduled,
//         },
//       });

//       if (updated.count > 0) {
//         result.assigned += updated.count;
//       } else {
//         result.skipped.push({
//           customerId: custId,
//           reason: "No pending orders",
//         });
//       }
//     }

//     res.json({
//       success: true,
//       message: `${result.assigned} orders assigned to ${
//         driver.name || "Driver"
//       }`,
//       driver: driver.name || "Unknown",
//       date: scheduled.toISOString().split("T")[0],
//       summary: {
//         customersRequested: customerIds.length,
//         ordersAssigned: result.assigned,
//         skipped: result.skipped.length,
//       },
//       skippedDetails: result.skipped,
//     });
//   } catch (error) {
//     console.error("assignDriver ERROR:", error);
//     res.status(500).json({ error: "Assignment failed" });
//   }
// };



// exports.assignDriverToCustomers = async (req, res) => {
//   try {
//     const tenantId = req.derivedTenantId;
//     const { zoneId, driverId, scheduledDate, customerIds,orderId } = req.body;

//     /* ─────────────── Auth & Payload Validation ─────────────── */
//     if (!tenantId) {
//       return res.status(401).json({ error: "Unauthorized" });
//     }

//     if (
//       !zoneId ||
//       !driverId ||
//       !orderId ||
//       !scheduledDate ||
//       !Array.isArray(customerIds) ||
//       customerIds.length === 0
//     ) {
//       return res.status(400).json({ error: "Missing required fields" });
//     }

//     /* ─────────────── Date Validation (NO PAST) ─────────────── */
//     const scheduled = new Date(scheduledDate);

//     if (isNaN(scheduled.getTime())) {
//       return res.status(400).json({ error: "Invalid scheduled date" });
//     }

//     const today = new Date();
//     today.setHours(0, 0, 0, 0);
//     scheduled.setHours(0, 0, 0, 0);

//     if (scheduled < today) {
//       return res
//         .status(400)
//         .json({ error: "Scheduled date cannot be in the past" });
//     }

//     /* ─────────────── Zone & Driver Validation ─────────────── */
//     const [zone, driver, order] = await Promise.all([
//       prisma.zone.findUnique({ where: { id: zoneId } }),
//       prisma.order.findUnique({ where: { id: orderId } }),
//       prisma.driver.findUnique({ where: { id: driverId } }),
//     ]);

//     if (!zone || zone.tenantId !== tenantId) {
//       return res.status(404).json({ error: "Zone not found" });
//     }
//     if (!order || order.tenantId !== tenantId) {
//       return res.status(404).json({ error: "Order not found" });
//     }

//     if (!driver || driver.tenantId !== tenantId) {
//       return res.status(404).json({ error: "Driver not found" });
//     }

//     /* ─────────────── Assignment Logic ─────────────── */
//     const result = {
//       assigned: 0,
//       skipped: [],
//     };

//     for (const customerId of customerIds) {
//       const customer = await prisma.customer.findUnique({
//         where: { id: customerId },
//         select: { id: true, tenantId: true, zoneId: true },
//       });

//       if (
//         !customer ||
//         customer.tenantId !== tenantId ||
//         customer.zoneId !== zoneId
//       ) {
//         result.skipped.push({
//           customerId,
//           reason: "Invalid customer or zone mismatch",
//         });
//         continue;
//       }

//       const updatedOrders = await prisma.order.updateMany({
//         where: {
//           customerId,
//           tenantId,
//           status: "pending",
//         },
//         data: {
//           driverId,
//           status: "in_progress",
//           scheduledDate: scheduled,
//         },
//       });

//       if (updatedOrders.count > 0) {
//         result.assigned += updatedOrders.count;
//       } else {
//         result.skipped.push({
//           customerId,
//           reason: "No pending orders",
//         });
//       }
//     }

//     /* ─────────────── Response ─────────────── */
//     return res.json({
//       success: true,
//       message: `${result.assigned} orders assigned to ${
//         driver.name || "Driver"
//       }`,
//       driver: driver.name || "Unknown",
//       date: scheduled.toISOString().split("T")[0],
//       summary: {
//         customersRequested: customerIds.length,
//         ordersAssigned: result.assigned,
//         skippedCustomers: result.skipped.length,
//       },
//       skippedDetails: result.skipped,
//     });
//   } catch (error) {
//     console.error("assignDriverToCustomers ERROR:", error);
//     return res.status(500).json({ error: "Assignment failed" });
//   }
// };


// without notifications
// exports.assignDriverToCustomers = async (req, res) => {
//   try {
//     const tenantId = req.derivedTenantId;
//     console.log("[ASSIGN] Starting assignment | tenantId:", tenantId);

//     const { zoneId, driverId, scheduledDate, customerIds } = req.body;
//     console.log("[ASSIGN] Request body:", { zoneId, driverId, scheduledDate, customerIds });

//     if (!tenantId) {
//       console.log("[ASSIGN] Unauthorized - no tenantId");
//       return res.status(401).json({ error: "Unauthorized" });
//     }

//     if (
//       !zoneId ||
//       !driverId ||
//       !scheduledDate ||
//       !Array.isArray(customerIds) ||
//       customerIds.length === 0
//     ) {
//       console.log("[ASSIGN] Validation failed - missing fields");
//       return res.status(400).json({ error: "Missing required fields" });
//     }

//     const scheduled = new Date(scheduledDate);
//     if (isNaN(scheduled.getTime())) {
//       console.log("[ASSIGN] Invalid scheduledDate:", scheduledDate);
//       return res.status(400).json({ error: "Invalid date" });
//     }

//     console.log("[ASSIGN] Fetching zone and driver...");
//     const [zone, driver] = await Promise.all([
//       prisma.zone.findUnique({ where: { id: zoneId } }),
//       prisma.driver.findUnique({ where: { id: driverId } }),
//     ]);

//     if (!zone || zone.tenantId !== tenantId) {
//       console.log("[ASSIGN] Zone not found or wrong tenant");
//       return res.status(404).json({ error: "Zone not found" });
//     }

//     if (!driver) {
//       console.log("[ASSIGN] Driver not found:", driverId);
//       return res.status(404).json({ error: "Driver not found" });
//     }

//     console.log("[ASSIGN] Processing", customerIds.length, "customers for driver:", driver.name || driverId);

//     const result = { assigned: 0, skipped: [] };
//     let totalAssignedOrders = 0;
//     let affectedCustomers = 0;

//     for (const custId of customerIds) {
//       console.log("[ASSIGN] Checking customer:", custId);

//       const customer = await prisma.customer.findUnique({
//         where: { id: custId },
//         select: {
//           id: true,
//           tenantId: true,
//           zoneId: true,
//           name: true,
//         },
//       });

//       if (
//         !customer ||
//         customer.tenantId !== tenantId ||
//         customer.zoneId !== zoneId
//       ) {
//         console.log("[ASSIGN] Skipping customer:", custId, "reason: invalid");
//         result.skipped.push({ customerId: custId, reason: "Invalid customer" });
//         continue;
//       }

//       console.log("[ASSIGN] Updating pending orders for customer:", custId);

//       const updated = await prisma.order.updateMany({
//         where: {
//           customerId: custId,
//           status: "pending",
//           tenantId,
//         },
//         data: {
//           driverId,
//           status: "in_progress",
//           scheduledDate: scheduled,
//         },
//       });

//       console.log("[ASSIGN] Updated count for customer", custId, ":", updated.count);

//       if (updated.count > 0) {
//         result.assigned += updated.count;
//         totalAssignedOrders += updated.count;
//         affectedCustomers++;
//         console.log("[ASSIGN] Successfully assigned", updated.count, "orders for customer", custId);
//       } else {
//         console.log("[ASSIGN] No pending orders for customer", custId);
//         result.skipped.push({
//           customerId: custId,
//           reason: "No pending orders",
//         });
//       }
//     }

//     console.log("[ASSIGN] Final result:", {
//       assigned: result.assigned,
//       skipped: result.skipped.length,
//       totalAssignedOrders,
//       affectedCustomers,
//     });
//     // ────────────────────────────────────────────────────────────────
//     // AUTOMATIC NOTIFICATION TRIGGER
//     // ────────────────────────────────────────────────────────────────
//     if (result.assigned > 0 && driver?.id) {
//       console.log("[NOTIFY] === Entering notification block ===");
//       console.log("[NOTIFY] Driver ID:", driver.id);
//       console.log("[NOTIFY] Driver name:", driver.name || "Unknown");

//       try {
//         let assignmentDetails;

//         // Single customer + single order → fetch the real assigned order
//         if (affectedCustomers === 1 && totalAssignedOrders === 1) {
//           console.log("[NOTIFY] Single assignment detected — fetching real order details");

//           // Find the order we just assigned (match customer + driver + scheduledDate)
//           const assignedOrder = await prisma.order.findFirst({
//             where: {
//               customerId: customerIds[0],          // the only customer in this assignment
//               driverId: driver.id,
//               scheduledDate: scheduled,
//               status: "in_progress",               // we just set this
//             },
//             select: {
//               id: true,
//               orderNumber: true,
//               orderNumberDisplay: true,
//               customer: {
//                 select: { name: true },
//               },
//             },
//             orderBy: { createdAt: "desc" },        // most recent match
//           });

//           if (assignedOrder) {
//             console.log("[NOTIFY] Found assigned order:", assignedOrder.id);
//             assignmentDetails = {
//               orderId: assignedOrder.id,
//               orderNumber: assignedOrder.orderNumber || assignedOrder.orderNumberDisplay || `ORD-${assignedOrder.id.slice(0, 8)}`,
//               customerName: assignedOrder.customer?.name || "Customer",
//               zone: zone.name || "Zone",
//               deliveryTime: scheduled.toISOString(),
//               totalOrders: 1,
//               customerCount: 1,
//               isBulk: false,
//             };
//           } else {
//             console.log("[NOTIFY] Warning: Could not find the assigned order for details — using fallback");
//             assignmentDetails = { /* fallback below */ };
//           }
//         }

//         // If not single or fetch failed → use generic fallback
//         if (!assignmentDetails) {
//           assignmentDetails = {
//             orderId: null,
//             orderNumber: null,
//             customerName: null,
//             zone: zone.name || "Zone",
//             deliveryTime: scheduled.toISOString(),
//             totalOrders: totalAssignedOrders,
//             customerCount: affectedCustomers,
//             isBulk: totalAssignedOrders > 1 || affectedCustomers > 1,
//           };
//         }

//         console.log("[NOTIFY] Final assignment details being sent:", assignmentDetails);

//         const notifyResult = await notificationService.notifyOrderAssigned(
//           driver.id,
//           assignmentDetails
//         );

//         console.log("[NOTIFY] === Notification result ===", {
//           success: notifyResult.success,
//           mock: notifyResult.mock || false,
//           messageId: notifyResult.messageId || "N/A",
//           error: notifyResult.error || null,
//         });
//       } catch (notifyErr) {
//         console.error("[NOTIFY] Failed to send notification:", notifyErr.message);
//         console.error("[NOTIFY] Full error:", notifyErr);
//       }
//     } else {
//       console.log("[NOTIFY] No notification sent - reason: no orders assigned or no driver");
//     }

//     // Final response
//     res.json({
//       success: true,
//       message: `${result.assigned} orders assigned to ${driver.name || "Driver"}`,
//       driver: driver.name || "Unknown",
//       date: scheduled.toISOString().split("T")[0],
//       summary: {
//         customersRequested: customerIds.length,
//         ordersAssigned: result.assigned,
//         skipped: result.skipped.length,
//       },
//       skippedDetails: result.skipped,
//     });
//   } catch (error) {
//     console.error("[ASSIGN] CRITICAL ERROR:", error.message);
//     console.error("[ASSIGN] Full error stack:", error);
//     res.status(500).json({
//       success: false,
//       error: "Assignment failed",
//       details: error.message
//     });
//   }
// };


// with notifications 

exports.assignDriverToCustomers = async (req, res) => {
  try {
    const tenantId = req.derivedTenantId;
    console.log("[ASSIGN] Starting assignment | tenantId:", tenantId);

    const { zoneId, driverId, scheduledDate, customerIds } = req.body;
    console.log("[ASSIGN] Request body:", { zoneId, driverId, scheduledDate, customerIds });

    if (!tenantId) {
      console.log("[ASSIGN] Unauthorized - no tenantId");
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (
      !zoneId ||
      !driverId ||
      !scheduledDate ||
      !Array.isArray(customerIds) ||
      customerIds.length === 0
    ) {
      console.log("[ASSIGN] Validation failed - missing fields");
      return res.status(400).json({ error: "Missing required fields" });
    }

    const scheduled = new Date(scheduledDate);
    if (isNaN(scheduled.getTime())) {
      console.log("[ASSIGN] Invalid scheduledDate:", scheduledDate);
      return res.status(400).json({ error: "Invalid date" });
    }

    console.log("[ASSIGN] Fetching zone and driver...");
    const [zone, driver] = await Promise.all([
      prisma.zone.findUnique({ where: { id: zoneId } }),
      prisma.driver.findUnique({ where: { id: driverId } }),
    ]);

    if (!zone || zone.tenantId !== tenantId) {
      console.log("[ASSIGN] Zone not found or wrong tenant");
      return res.status(404).json({ error: "Zone not found" });
    }

    if (!driver) {
      console.log("[ASSIGN] Driver not found:", driverId);
      return res.status(404).json({ error: "Driver not found" });
    }

    console.log("[ASSIGN] Processing", customerIds.length, "customers for driver:", driver.name || driverId);

    const result = { assigned: 0, skipped: [] };
    let totalAssignedOrders = 0;
    let affectedCustomers = 0;

    for (const custId of customerIds) {
      console.log("[ASSIGN] Checking customer:", custId);

      const customer = await prisma.customer.findUnique({
        where: { id: custId },
        select: {
          id: true,
          tenantId: true,
          zoneId: true,
          name: true,
        },
      });

      if (
        !customer ||
        customer.tenantId !== tenantId ||
        customer.zoneId !== zoneId
      ) {
        console.log("[ASSIGN] Skipping customer:", custId, "reason: invalid");
        result.skipped.push({ customerId: custId, reason: "Invalid customer" });
        continue;
      }

      console.log("[ASSIGN] Updating pending orders for customer:", custId);

      const updated = await prisma.order.updateMany({
        where: {
          customerId: custId,
          status: "pending",
          tenantId,
        },
        data: {
          driverId,
          status: "in_progress",
          scheduledDate: scheduled,
        },
      });

      console.log("[ASSIGN] Updated count for customer", custId, ":", updated.count);

      if (updated.count > 0) {
        result.assigned += updated.count;
        totalAssignedOrders += updated.count;
        affectedCustomers++;
        console.log("[ASSIGN] Successfully assigned", updated.count, "orders for customer", custId);
      } else {
        console.log("[ASSIGN] No pending orders for customer", custId);
        result.skipped.push({
          customerId: custId,
          reason: "No pending orders",
        });
      }
    }

    console.log("[ASSIGN] Final result:", {
      assigned: result.assigned,
      skipped: result.skipped.length,
      totalAssignedOrders,
      affectedCustomers,
    });

    // ────────────────────────────────────────────────────────────────
    // AUTOMATIC NOTIFICATION TRIGGER - SIMPLE & CLEAR VERSION
    // ────────────────────────────────────────────────────────────────
    if (result.assigned > 0 && driver?.id) {
      console.log("[NOTIFY] Sending assignment notification to driver:", driver.id);

      try {
        const dateStr = scheduled.toLocaleDateString("en-PK", {
          weekday: "short",
          day: "numeric",
          month: "short",
        });

        const notificationPayload = {
          title: "🛵 New Orders Assigned!",
          body: `Bhai ${driver.name || "Driver"}! Aapko ${result.assigned} new order${
            result.assigned > 1 ? "s" : ""
          } assign hue hain${
            affectedCustomers > 1 ? ` (${affectedCustomers} customers ke)` : ""
          } for ${dateStr}. App kholo aur check karo! 🚚`,
          type: "ORDER_ASSIGNED",
        };

        const dataPayload = {
          driverId: driver.id,
          totalAssigned: result.assigned,
          customersAffected: affectedCustomers,
          scheduledDate: scheduled.toISOString(),
          zoneName: zone.name || "Your Zone",
          isBulk: affectedCustomers > 1 || result.assigned > 1,
          timestamp: new Date().toISOString(),
        };

        console.log("[NOTIFY] Sending payload →", { notification: notificationPayload, data: dataPayload });

        // Notification bhej do (tumhare service ke hisaab se adjust kar lena)
        const notifyResult = await notificationService.sendPushToDriver(
          driver.id,
          notificationPayload,
          dataPayload
        );

        console.log("[NOTIFY] Result:", {
          success: notifyResult.success,
          messageId: notifyResult.messageId || "N/A",
          error: notifyResult.error || null,
        });
      } catch (notifyErr) {
        console.error("[NOTIFY] Failed to send notification (assignment still succeeded):", notifyErr.message);
        // Important: Notification fail hone se assignment fail nahi hona chahiye
      }
    } else {
      console.log("[NOTIFY] No notification sent - no orders assigned or no driver");
    }

    // Final response
    res.json({
      success: true,
      message: `${result.assigned} order${result.assigned !== 1 ? "s" : ""} assigned to ${
        driver.name || "selected driver"
      }`,
      driver: driver.name || driverId,
      date: scheduled.toISOString().split("T")[0],
      summary: {
        customersRequested: customerIds.length,
        ordersAssigned: result.assigned,
        customersAffected: affectedCustomers,
        skipped: result.skipped.length,
      },
      skippedDetails: result.skipped,
    });
  } catch (error) {
    console.error("[ASSIGN] CRITICAL ERROR:", error.message);
    console.error("[ASSIGN] Full error stack:", error);
    res.status(500).json({
      success: false,
      error: "Assignment failed",
      details: error.message
    });
  }
};





















