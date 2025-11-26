// src/controllers/driverController.js
const prisma = require("../prisma/client");
const { sendOTP, verifyOTP } = require("../utils/otpService");
const jwt = require("jsonwebtoken");

// CREATE DRIVER
exports.createDriver = async (req, res) => {
  try {
    const {
      name,
      phone,
      vehicleNumber,
      vehicleType = "bike",
      zoneId,
    } = req.body;
    const tenantId = req.derivedTenantId;

    if (!name || !phone || !vehicleNumber || !zoneId) {
      return res
        .status(400)
        .json({ error: "Name, phone, vehicle number and zone are required" });
    }

    // Zone validation
    const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
    if (!zone || zone.tenantId !== tenantId) {
      return res.status(403).json({ error: "Invalid zone" });
    }

    // Duplicate checks
    const [existingPhone, existingVehicle] = await Promise.all([
      prisma.driver.findFirst({ where: { phone, tenantId } }),
      prisma.driver.findFirst({ where: { vehicleNumber, tenantId } }),
    ]);

    if (existingPhone)
      return res.status(400).json({ error: "Phone already registered" });
    if (existingVehicle)
      return res.status(400).json({ error: "Vehicle number already in use" });

    const driver = await prisma.driver.create({
      data: {
        name: name.trim(),
        phone: phone.trim(),
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        vehicleType: vehicleType.toLowerCase(),
        zoneId,
        tenantId,
        status: "active",
      },
      include: { zone: { select: { name: true } } },
    });

    res.status(201).json({ message: "Driver created successfully", driver });
  } catch (err) {
    console.error("Create driver error:", err);
    res.status(500).json({ error: "Failed to create driver" });
  }
};

// GET ALL DRIVERS + STATS
exports.getDrivers = async (req, res) => {
  try {
    const tenantId = req.derivedTenantId;

    const [drivers, stats] = await Promise.all([
      prisma.driver.findMany({
        where: { tenantId },
        include: {
          zone: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.driver.aggregate({
        where: { tenantId },
        _count: { id: true },
        _avg: { rating: true },
        _sum: { todayDeliveries: true, totalDeliveries: true },
      }),
    ]);

    const activeDrivers = drivers.filter((d) => d.status === "active").length;

    res.json({
      drivers,
      stats: {
        totalDrivers: stats._count.id,
        activeDrivers,
        avgRating: stats._avg.rating
          ? Number(stats._avg.rating.toFixed(2))
          : null,
        deliveriesToday: stats._sum.todayDeliveries || 0,
        totalDeliveriesEver: stats._sum.totalDeliveries || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE DRIVER
exports.updateDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.derivedTenantId;
    const { name, phone, vehicleNumber, vehicleType, zoneId, status } =
      req.body;

    const driver = await prisma.driver.findUnique({
      where: { id, tenantId },
    });

    if (!driver) return res.status(404).json({ error: "Driver not found" });

    // Duplicate checks if changing phone/vehicle
    if (phone && phone !== driver.phone) {
      const existing = await prisma.driver.findFirst({
        where: { phone, tenantId, NOT: { id } },
      });
      if (existing)
        return res.status(400).json({ error: "Phone already in use" });
    }

    if (vehicleNumber && vehicleNumber !== driver.vehicleNumber) {
      const existing = await prisma.driver.findFirst({
        where: { vehicleNumber, tenantId, NOT: { id } },
      });
      if (existing)
        return res.status(400).json({ error: "Vehicle number already in use" });
    }

    if (zoneId && zoneId !== driver.zoneId) {
      const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
      if (!zone || zone.tenantId !== tenantId) {
        return res.status(403).json({ error: "Invalid zone" });
      }
    }

    const updateData = {
      ...(name && { name: name.trim() }),
      ...(phone && { phone: phone.trim() }),
      ...(vehicleNumber && {
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
      }),
      ...(vehicleType && { vehicleType: vehicleType.toLowerCase() }),
      ...(zoneId && { zoneId }),
      ...(status && { status }),
    };

    const updatedDriver = await prisma.driver.update({
      where: { id },
      data: updateData,
      include: { zone: { select: { name: true } } },
    });

    res.json({
      message: "Driver updated successfully",
      driver: updatedDriver,
    });
  } catch (err) {
    console.error("Update driver error:", err);
    res.status(500).json({ error: "Failed to update driver" });
  }
};

// TOGGLE STATUS
exports.toggleDriverStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.derivedTenantId;

    const driver = await prisma.driver.findUnique({ where: { id, tenantId } });
    if (!driver) return res.status(404).json({ error: "Driver not found" });

    const newStatus = driver.status === "active" ? "inactive" : "active";

    const updated = await prisma.driver.update({
      where: { id },
      data: { status: newStatus },
    });

    res.json({
      message: "Status updated",
      status: newStatus,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DRIVER KO SIRF USKE ASSIGNED ORDERS DIKHAO
// FIXED: Role check added, tenantId consistency, stats date filter for deliveredToday - NOV 26, 2025
exports.getMyAssignedOrders = async (req, res) => {
  try {
    // ✅ NEW: Role check – sirf driver hi access kare
    if (req.user.role !== "driver") {
      return res
        .status(403)
        .json({ error: "Only drivers can access their orders" });
    }

    const driverId = req.user.id; // JWT se
    const tenantId = req.derivedTenantId; // ✅ FIXED: Consistency with other functions (from middleware)

    const orders = await prisma.order.findMany({
      where: {
        driverId, // Important: sirf jis driver ka hai
        tenantId,
        status: {
          in: ["pending", "in_progress", "delivered"], // jo driver ko dikhane hain
        },
      },
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
            address: true,
          },
        },
        zone: { select: { name: true } },
        items: {
          include: {
            product: {
              select: {
                name: true,
                size: true,
                isReusable: true,
                requiresEmptyReturn: true,
              },
            },
          },
        },
      },
      orderBy: [
        { status: "asc" }, // pending pehle
        { deliveryDate: "asc" },
        { createdAt: "desc" },
      ],
    });

    // Extra info for driver
    const today = new Date().toDateString();
    const stats = {
      totalToday: orders.filter(
        (o) => new Date(o.deliveryDate).toDateString() === today
      ).length,
      pending: orders.filter((o) => o.status === "pending").length,
      inProgress: orders.filter((o) => o.status === "in_progress").length, // ✅ Consistent naming
      // ✅ FIXED: Date filter add kiya deliveredToday ke liye
      deliveredToday: orders.filter(
        (o) =>
          o.status === "delivered" &&
          new Date(o.deliveryDate).toDateString() === today
      ).length,
    };

    res.json({
      message: "Your assigned orders",
      stats,
      orders,
    });
  } catch (err) {
    console.error("Get My Orders Error:", err);
    res.status(500).json({ error: "Failed to fetch your orders" });
  }
};

// SEND OTP (Public)
exports.sendDriverOTP = async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone required" });

  const driver = await prisma.driver.findFirst({ where: { phone } });
  if (!driver || driver.status !== "active") {
    return res.status(403).json({ error: "Driver not active" });
  }

  await sendOTP(phone);
  res.json({ message: "OTP sent to driver" });
};

// VERIFY OTP & LOGIN (Public)
exports.verifyDriverOTP = async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp)
    return res.status(400).json({ error: "Phone & OTP required" });

  if (!(await verifyOTP(phone, otp))) {
    return res.status(400).json({ error: "Invalid OTP" });
  }

  const driver = await prisma.driver.findFirst({ where: { phone } });
  if (!driver || driver.status !== "active") {
    return res.status(403).json({ error: "Driver not active" });
  }

  const token = jwt.sign(
    { id: driver.id, role: "driver", tenantId: driver.tenantId },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    message: "Driver login successful",
    token,
    driver: {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      zoneId: driver.zoneId,
    },
  });
};
