// paymentController.js
const prisma = require("../prisma/client");

// CREATE IMMEDIATE PAYMENT FOR NON-RECURRING ORDER
exports.createImmediatePayment = async (orderId) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!order) throw new Error("Order not found");

    const paymentItems = order.items.map((item) => ({
      orderId: order.id,
      orderItemId: item.id,
      productName: item.product.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      depositAmount: item.depositAmount,
      totalAmount: item.totalPrice,
    }));

    const payment = await prisma.payment.create({
      data: {
        paymentNumber: `PAY-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`,
        customerId: order.customerId,
        tenantId: order.tenantId,
        orderId: order.id,
        amount: order.totalAmount,
        pendingAmount: order.totalAmount,
        collectionType: "IMMEDIATE",
        dueDate: order.deliveryDate,
        status: "PENDING",
        paymentMethod: order.paymentMethod,
        // ✅ FIXED: PaymentItem → paymentItems
        paymentItems: {
          create: paymentItems,
        },
      },
    });

    // Link payment to order
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentId: payment.id,
      },
    });

    return payment;
  } catch (err) {
    console.error("Create Immediate Payment Error:", err);
    throw err;
  }
};

// DRIVER: COLLECT PAYMENT
exports.collectPayment = async (req, res) => {
  try {
    const {
      paymentId,
      collectedAmount,
      paymentMethod = "cash_on_delivery",
      notes,
    } = req.body;
    const driverId = req.user.id;
    const tenantId = req.derivedTenantId;

    const payment = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        tenantId,
        OR: [{ status: "PENDING" }, { status: "PARTIAL" }],
      },
      include: {
        order: true,
        subscription: true,
        customer: true,
      },
    });

    if (!payment) {
      return res
        .status(404)
        .json({ error: "Payment not found or already paid" });
    }

    const collectedAmountNum = parseFloat(collectedAmount);

    if (collectedAmountNum <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    // Calculate new amounts
    const newPaidAmount = payment.paidAmount + collectedAmountNum;
    const newPendingAmount = Math.max(0, payment.amount - newPaidAmount);

    let newStatus = payment.status;
    if (newPendingAmount === 0) {
      newStatus = "PAID";
    } else if (newPaidAmount > 0) {
      newStatus = "PARTIAL";
    }

    const updatedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        paidAmount: newPaidAmount,
        pendingAmount: newPendingAmount,
        status: newStatus,
        paymentMethod,
        paymentDate: new Date(),
        collectedByDriverId: driverId,
        notes,
      },
    });

    // Update customer's due amount
    await prisma.customer.update({
      where: { id: payment.customerId },
      data: {
        dueAmount: { decrement: collectedAmountNum },
      },
    });

    // If immediate payment, update order status
    if (payment.orderId) {
      await prisma.order.update({
        where: { id: payment.orderId },
        data: {
          paymentStatus: newStatus,
          paidAmount: newPaidAmount,
        },
      });
    }

    // Update driver's stats
    await prisma.driver.update({
      where: { id: driverId },
      data: {
        totalDeliveries: { increment: 1 },
      },
    });

    res.json({
      success: true,
      message: `Payment collected: ${collectedAmount}`,
      payment: updatedPayment,
      receipt: {
        paymentNumber: payment.paymentNumber,
        customerName: payment.customer.name,
        collectedAmount,
        pendingAmount: newPendingAmount,
        collectedBy: req.user.name,
        date: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("Collect Payment Error:", err);
    res.status(500).json({ error: "Failed to collect payment" });
  }
};

// GET CUSTOMER'S PAYMENT HISTORY
exports.getCustomerPayments = async (req, res) => {
  try {
    const customerId = req.user.id;
    const tenantId = req.derivedTenantId;
    const { type, status, month, year } = req.query;

    const where = {
      customerId,
      tenantId,
    };

    if (type) where.collectionType = type;
    if (status) where.status = status;
    if (month) where.month = parseInt(month);
    if (year) where.year = parseInt(year);

    const payments = await prisma.payment.findMany({
      where,
      include: {
        order: {
          select: {
            orderNumberDisplay: true,
            deliveryDate: true,
          },
        },
        subscription: {
          select: {
            recurrence: true,
            product: {
              select: {
                name: true,
              },
            },
          },
        },
        collectedByDriver: {
          select: {
            name: true,
            phone: true,
          },
        },
        paymentItems: {
          select: {
            productName: true,
            quantity: true,
            totalAmount: true,
          },
        },
      },
      orderBy: { dueDate: "desc" },
    });

    // Calculate summary
    const summary = payments.reduce(
      (acc, payment) => {
        acc.totalAmount += payment.amount;
        acc.totalPaid += payment.paidAmount;
        acc.totalPending += payment.pendingAmount;
        return acc;
      },
      { totalAmount: 0, totalPaid: 0, totalPending: 0 }
    );

    res.json({
      success: true,
      payments,
      summary,
    });
  } catch (err) {
    console.error("Get Customer Payments Error:", err);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
};
// GET DRIVER'S PAYMENTS TO COLLECT TODAY
exports.getTodaysPayments = async (req, res) => {
  try {
    const driverId = req.user.id;
    const tenantId = req.derivedTenantId;

    // ✅ FIX: Local date without timezone conversion
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ✅ Helper function for local date string
    const getLocalDateString = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    // Get driver's zone
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { zoneId: true, name: true },
    });

    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    console.log(
      `🔍 Driver ${driver.name} (${driverId}) in zone: ${driver.zoneId}`
    );

    console.log("Server Time (UTC):", new Date().toISOString());
    console.log("Server Time (Local):", new Date().toString());
    console.log("Today Local Date:", getLocalDateString(today));
    console.log("Today ISO:", today.toISOString().split("T")[0]);

    // ✅ Use local date for due date filter
    const dueWithin = new Date(today);
    dueWithin.setDate(dueWithin.getDate() + 7);

    // Get payments for customers in driver's zone
    const payments = await prisma.payment.findMany({
      where: {
        tenantId,
        status: {
          in: ["PENDING", "PARTIAL"],
        },
        dueDate: {
          lte: dueWithin, // ✅ Use local date object
        },
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
            dueAmount: true,
            empties: true,
          },
        },
        order: {
          select: {
            orderNumberDisplay: true,
            deliveryDate: true,
            withBottles: true,
          },
        },
        subscription: {
          select: {
            recurrence: true,
            product: {
              select: {
                name: true,
              },
            },
          },
        },
        // ✅ FIXED: paymentItems use karein
        paymentItems: {
          select: {
            productName: true,
            quantity: true,
            unitPrice: true,
            totalAmount: true,
            order: {
              select: {
                deliveryDate: true,
              },
            },
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { amount: "desc" }],
    });

    console.log(
      `✅ Found ${payments.length} payments for driver ${driver.name}`
    );

    // Format for driver app
    const formattedPayments = payments.map((payment) => {
      const items = payment.paymentItems.map((item) => ({
        product: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.totalAmount,
        deliveryDate: item.order?.deliveryDate || payment.order?.deliveryDate,
      }));

      // ✅ FIX: Correct overdue calculation using local dates
      const dueDate = new Date(payment.dueDate);
      const dueDateLocal = new Date(
        dueDate.getFullYear(),
        dueDate.getMonth(),
        dueDate.getDate()
      );
      const todayLocal = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );

      const daysDiff = Math.ceil(
        (dueDateLocal.getTime() - todayLocal.getTime()) / (1000 * 60 * 60 * 24)
      );
      const isOverdue = daysDiff < 0;

      // ✅ NEW: Payment status display logic
      let statusDisplay;
      if (payment.status === "PAID") {
        statusDisplay = "PAID";
      } else if (payment.status === "PARTIAL") {
        statusDisplay = "PARTIAL";
      } else if (daysDiff < 0) {
        statusDisplay = `OVERDUE ${Math.abs(daysDiff)} DAYS`;
      } else if (daysDiff === 0) {
        statusDisplay = "DUE TODAY";
      } else {
        statusDisplay = `DUE IN ${daysDiff} DAYS`;
      }

      return {
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        customer: payment.customer,
        totalAmount: payment.amount,
        paidAmount: payment.paidAmount,
        pendingAmount: payment.pendingAmount,
        dueDate: payment.dueDate,
        collectionType: payment.collectionType,
        paymentMethod: payment.paymentMethod,
        items,
        isOverdue,
        overdueDays: isOverdue ? Math.abs(daysDiff) : daysDiff, // Now overdueDays is always positive days diff (overdue or future)
        statusDisplay, // ✅ NEW: Added status display field
        notes: payment.notes,
        orderInfo: payment.order
          ? {
              orderNumber: payment.order.orderNumberDisplay,
              deliveryDate: payment.order.deliveryDate,
              withBottles: payment.order.withBottles,
            }
          : null,
        subscriptionInfo: payment.subscription
          ? {
              recurrence: payment.subscription.recurrence,
              productName: payment.subscription.product?.name,
            }
          : null,
      };
    });

    // Calculate totals
    const totals = formattedPayments.reduce(
      (acc, p) => {
        acc.totalPending += p.pendingAmount;
        acc.overdueCount += p.isOverdue ? 1 : 0;
        acc.overdueAmount += p.isOverdue ? p.pendingAmount : 0;
        return acc;
      },
      { totalPending: 0, overdueCount: 0, overdueAmount: 0 }
    );

    // Debug info
    console.log(
      `📊 Stats: ${formattedPayments.length} payments, ₹${totals.totalPending} pending, ${totals.overdueCount} overdue`
    );

    // ✅ FIX: Use local date string in response
    const todayString = getLocalDateString(today);
    console.log("Sending today as:", todayString);

    res.json({
      success: true,
      driver: {
        id: driverId,
        name: driver.name,
        zoneId: driver.zoneId,
      },
      payments: formattedPayments,
      stats: {
        totalPayments: formattedPayments.length,
        totalPendingAmount: totals.totalPending,
        overdueCount: totals.overdueCount,
        overdueAmount: totals.overdueAmount,
        collectionBreakdown: {
          immediate: formattedPayments.filter(
            (p) => p.collectionType === "IMMEDIATE"
          ).length,
          monthly: formattedPayments.filter(
            (p) => p.collectionType === "MONTHLY"
          ).length,
          weekly: formattedPayments.filter((p) => p.collectionType === "WEEKLY")
            .length,
        },
      },
      today: todayString,
    });
  } catch (err) {
    console.error("❌ Get Today's Payments Error:", err.message);
    console.error("Stack:", err.stack);
    res.status(500).json({
      success: false,
      error: "Failed to fetch today's payments",
      details: err.message,
    });
  }
};

// GET PAYMENT REPORTS FOR ADMIN
exports.getPaymentReports = async (req, res) => {
  try {
    const tenantId = req.derivedTenantId;
    const { startDate, endDate, driverId, customerId, status, collectionType } =
      req.query;

    const where = { tenantId };

    if (startDate && endDate) {
      where.paymentDate = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    if (driverId) where.collectedByDriverId = driverId;
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    if (collectionType) where.collectionType = collectionType;

    const payments = await prisma.payment.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            zone: {
              select: {
                name: true,
              },
            },
          },
        },
        collectedByDriver: {
          select: {
            id: true,
            name: true,
            vehicleNumber: true,
          },
        },
        order: {
          select: {
            orderNumberDisplay: true,
          },
        },
        subscription: {
          select: {
            recurrence: true,
          },
        },
        paymentItems: {
          select: {
            productName: true,
            quantity: true,
            totalAmount: true,
          },
        },
      },
      orderBy: { paymentDate: "desc" },
    });

    // Summary by collection type
    const summaryByType = await prisma.payment.groupBy({
      by: ["collectionType", "status"],
      where,
      _sum: {
        amount: true,
        paidAmount: true,
        pendingAmount: true,
      },
      _count: true,
    });

    // Summary by driver
    const summaryByDriver = await prisma.payment.groupBy({
      by: ["collectedByDriverId"],
      where: {
        ...where,
        collectedByDriverId: { not: null },
      },
      _sum: {
        paidAmount: true,
      },
      _count: true,
    });

    // Get driver names for summary
    const driverSummaries = await Promise.all(
      summaryByDriver.map(async (summary) => {
        if (!summary.collectedByDriverId) return null;
        const driver = await prisma.driver.findUnique({
          where: { id: summary.collectedByDriverId },
          select: { name: true, vehicleNumber: true },
        });
        return {
          driverId: summary.collectedByDriverId,
          driverName: driver?.name,
          vehicleNumber: driver?.vehicleNumber,
          totalCollected: summary._sum.paidAmount,
          collectionCount: summary._count,
        };
      })
    );

    const filteredDriverSummaries = driverSummaries.filter(Boolean);

    res.json({
      success: true,
      payments,
      summary: {
        total: payments.length,
        totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
        totalCollected: payments.reduce((sum, p) => sum + p.paidAmount, 0),
        totalPending: payments.reduce((sum, p) => sum + p.pendingAmount, 0),
        byType: summaryByType,
        byDriver: filteredDriverSummaries,
      },
      filters: {
        startDate,
        endDate,
        driverId,
        customerId,
        status,
        collectionType,
      },
    });
  } catch (err) {
    console.error("Get Payment Reports Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch reports",
      details: err.message,
    });
  }
};

// GET PAYMENT BY ID
exports.getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.derivedTenantId;

    const payment = await prisma.payment.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
            dueAmount: true,
            empties: true,
            zone: {
              select: {
                name: true,
              },
            },
          },
        },
        order: {
          select: {
            id: true,
            orderNumberDisplay: true,
            deliveryDate: true,
            status: true,
            withBottles: true,
          },
        },
        subscription: {
          select: {
            id: true,
            recurrence: true,
            status: true,
            product: {
              select: {
                name: true,
                size: true,
              },
            },
          },
        },
        collectedByDriver: {
          select: {
            id: true,
            name: true,
            phone: true,
            vehicleNumber: true,
          },
        },
        paymentItems: {
          include: {
            order: {
              select: {
                deliveryDate: true,
              },
            },
          },
        },
      },
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: "Payment not found",
      });
    }

    res.json({
      success: true,
      payment,
    });
  } catch (err) {
    console.error("Get Payment By ID Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch payment",
    });
  }
};

// GET ALL PAYMENTS (ADMIN)
exports.getAllPayments = async (req, res) => {
  try {
    const tenantId = req.derivedTenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const {
      status,
      collectionType,
      customerId,
      driverId,
      startDate,
      endDate,
      search,
    } = req.query;

    const where = { tenantId };

    if (status) where.status = status;
    if (collectionType) where.collectionType = collectionType;
    if (customerId) where.customerId = customerId;
    if (driverId) where.collectedByDriverId = driverId;

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    if (search) {
      where.OR = [
        { paymentNumber: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { customer: { phone: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
          collectedByDriver: {
            select: {
              id: true,
              name: true,
            },
          },
          order: {
            select: {
              orderNumberDisplay: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.payment.count({ where }),
    ]);

    // Get summary stats
    const stats = await prisma.payment.groupBy({
      by: ["status"],
      where: { tenantId },
      _sum: {
        amount: true,
        paidAmount: true,
        pendingAmount: true,
      },
      _count: true,
    });

    res.json({
      success: true,
      payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: stats.reduce((acc, stat) => {
        acc[stat.status] = {
          count: stat._count,
          totalAmount: stat._sum.amount,
          paidAmount: stat._sum.paidAmount,
          pendingAmount: stat._sum.pendingAmount,
        };
        return acc;
      }, {}),
    });
  } catch (err) {
    console.error("Get All Payments Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch payments",
    });
  }
};

// UPDATE PAYMENT (ADMIN)
exports.updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.derivedTenantId;
    const updates = req.body;

    // Check if payment exists
    const existingPayment = await prisma.payment.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!existingPayment) {
      return res.status(404).json({
        success: false,
        error: "Payment not found",
      });
    }

    // Allowed fields to update
    const allowedUpdates = [
      "status",
      "paymentMethod",
      "dueDate",
      "notes",
      "month",
      "year",
      "cycleStartDate",
      "cycleEndDate",
    ];

    const filteredUpdates = {};
    Object.keys(updates).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    // If status is being updated to PAID, update amounts
    if (
      filteredUpdates.status === "PAID" &&
      existingPayment.status !== "PAID"
    ) {
      filteredUpdates.paidAmount = existingPayment.amount;
      filteredUpdates.pendingAmount = 0;
      filteredUpdates.paymentDate = new Date();
    }

    const updatedPayment = await prisma.payment.update({
      where: { id },
      data: filteredUpdates,
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
          },
        },
      },
    });

    // If payment is marked as PAID, update customer due amount
    if (
      filteredUpdates.status === "PAID" &&
      existingPayment.status !== "PAID"
    ) {
      await prisma.customer.update({
        where: { id: updatedPayment.customerId },
        data: {
          dueAmount: {
            decrement: updatedPayment.amount - updatedPayment.paidAmount,
          },
        },
      });
    }

    res.json({
      success: true,
      message: "Payment updated successfully",
      payment: updatedPayment,
    });
  } catch (err) {
    console.error("Update Payment Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update payment",
    });
  }
};

// DRIVER: GET COLLECTION HISTORY WITH PAGINATION
exports.getDriverCollectionHistory = async (req, res) => {
  try {
    const driverId = req.user.id;
    const tenantId = req.derivedTenantId;
    
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Filter parameters
    const { 
      startDate, 
      endDate, 
      customerId, 
      paymentMethod, 
      status,
      search 
    } = req.query;

    // Base where clause
    const where = {
      tenantId,
      collectedByDriverId: driverId,
      paidAmount: { gt: 0 } // Only collected payments
    };

    // Date filter
    if (startDate && endDate) {
      where.paymentDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    } else if (startDate) {
      where.paymentDate = { gte: new Date(startDate) };
    } else if (endDate) {
      where.paymentDate = { lte: new Date(endDate) };
    }

    // Other filters
    if (customerId) where.customerId = customerId;
    if (paymentMethod) where.paymentMethod = paymentMethod;
    if (status) where.status = status;
    
    // Search by customer name/phone or payment number
    if (search) {
      where.OR = [
        { paymentNumber: { contains: search, mode: 'insensitive' } },
        {
          customer: {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } }
            ]
          }
        }
      ];
    }

    // Get payments with pagination
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              address: true,
              zone: {
                select: {
                  name: true
                }
              }
            }
          },
          order: {
            select: {
              orderNumberDisplay: true,
              deliveryDate: true
            }
          },
          subscription: {
            select: {
              recurrence: true,
              product: {
                select: {
                  name: true
                }
              }
            }
          },
          paymentItems: {
            select: {
              productName: true,
              quantity: true,
              totalAmount: true
            }
          }
        },
        orderBy: { paymentDate: 'desc' }
      }),
      prisma.payment.count({ where })
    ]);

    // Calculate summary stats
    const stats = await prisma.payment.aggregate({
      where,
      _sum: {
        paidAmount: true,
        amount: true
      },
      _count: true
    });

    // Get daily collection summary for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const dailySummary = await prisma.payment.groupBy({
      by: ['paymentDate'],
      where: {
        ...where,
        paymentDate: { gte: sevenDaysAgo }
      },
      _sum: {
        paidAmount: true
      },
      _count: true,
      orderBy: {
        paymentDate: 'desc'
      }
    });

    // Format daily summary
    const formattedDailySummary = dailySummary.map(day => ({
      date: day.paymentDate,
      totalCollected: day._sum.paidAmount,
      collectionCount: day._count
    }));

    // Format response
    const formattedPayments = payments.map(payment => ({
      id: payment.id,
      paymentNumber: payment.paymentNumber,
      paymentDate: payment.paymentDate,
      collectedAmount: payment.paidAmount,
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      notes: payment.notes,
      customer: {
        id: payment.customer.id,
        name: payment.customer.name,
        phone: payment.customer.phone,
        address: payment.customer.address,
        zone: payment.customer.zone?.name
      },
      items: payment.paymentItems.map(item => ({
        product: item.productName,
        quantity: item.quantity,
        amount: item.totalAmount
      })),
      orderInfo: payment.order ? {
        orderNumber: payment.order.orderNumberDisplay,
        deliveryDate: payment.order.deliveryDate
      } : null,
      subscriptionInfo: payment.subscription ? {
        recurrence: payment.subscription.recurrence,
        productName: payment.subscription.product?.name
      } : null
    }));

    res.json({
      success: true,
      payments: formattedPayments,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      },
      summary: {
        totalCollections: stats._count,
        totalAmountCollected: stats._sum.paidAmount || 0,
        averageCollection: stats._count > 0 ? (stats._sum.paidAmount / stats._count) : 0
      },
      dailySummary: formattedDailySummary,
      filters: {
        startDate,
        endDate,
        customerId,
        paymentMethod,
        status,
        search
      }
    });

  } catch (err) {
    console.error("❌ Get Driver Collection History Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch collection history",
      details: err.message
    });
  }
};

// DELETE PAYMENT (ADMIN)
exports.deletePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.derivedTenantId;

    // Check if payment exists
    const payment = await prisma.payment.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: "Payment not found",
      });
    }

    // Check if payment has been collected
    if (payment.paidAmount > 0) {
      return res.status(400).json({
        success: false,
        error:
          "Cannot delete payment that has been partially or fully collected",
      });
    }

    // Use transaction to delete payment items first
    await prisma.$transaction(async (tx) => {
      // Delete payment items
      await tx.paymentItem.deleteMany({
        where: { paymentId: id },
      });

      // Remove payment reference from order
      if (payment.orderId) {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { paymentId: null },
        });
      }

      // Delete the payment
      await tx.payment.delete({
        where: { id },
      });
    });

    res.json({
      success: true,
      message: "Payment deleted successfully",
    });
  } catch (err) {
    console.error("Delete Payment Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to delete payment",
    });
  }
};
