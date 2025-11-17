// src/controllers/driverController.js
const prisma = require("../prisma/client");
const { sendOTP, verifyOTP } = require("../utils/otpService");
const jwt = require("jsonwebtoken");

// CREATE DRIVER (Company Admin)
exports.createDriver = async (req, res) => {
  try {
    const { name, phone, vehicleId, zoneId } = req.body;
    const tenantId = req.derivedTenantId;

    if (!name || !phone || !vehicleId || !zoneId) {
      return res.status(400).json({ error: "All fields required" });
    }

    // Check if zone belongs to this company
    const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
    if (!zone || zone.tenantId !== tenantId) {
      return res.status(403).json({ error: "Invalid zone" });
    }

    const existing = await prisma.driver.findFirst({
      where: { phone, tenantId },
    });
    if (existing)
      return res.status(400).json({ error: "Driver phone already exists" });

    const driver = await prisma.driver.create({
      data: { name: name.trim(), phone, vehicleId, zoneId, tenantId },
    });

    res.status(201).json({ message: "Driver created", driver });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET ALL DRIVERS + STATS
exports.getDrivers = async (req, res) => {
  try {
    const tenantId = req.derivedTenantId;
    const [drivers, total, active, todayStats] = await Promise.all([
      prisma.driver.findMany({
        where: { tenantId },
        include: { zone: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.driver.count({ where: { tenantId } }),
      prisma.driver.count({ where: { tenantId, status: "active" } }),
      prisma.driver.findMany({
        where: { tenantId },
        select: { todayDeliveries: true, totalDeliveries: true },
      }),
    ]);

    const totalToday = todayStats.reduce((a, b) => a + b.todayDeliveries, 0);

    res.json({
      drivers,
      stats: {
        totalDrivers: total,
        activeNow: active,
        deliveriesToday: totalToday,
        activeRoutes: drivers.filter((d) => d.status === "active").length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE DRIVER (Company Admin)
exports.updateDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.derivedTenantId;
    const { name, phone, vehicleId, zoneId, status } = req.body;

    // Find driver first
    const driver = await prisma.driver.findUnique({
      where: { id, tenantId },
    });

    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    // If phone is being changed → check duplicate in same company
    if (phone && phone !== driver.phone) {
      const existing = await prisma.driver.findFirst({
        where: { phone, tenantId, NOT: { id } },
      });
      if (existing) {
        return res
          .status(400)
          .json({ error: "Phone already used by another driver" });
      }
    }

    // If zone is being changed → validate zone belongs to company
    if (zoneId && zoneId !== driver.zoneId) {
      const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
      if (!zone || zone.tenantId !== tenantId) {
        return res.status(403).json({ error: "Invalid zone selected" });
      }
    }

    // Prepare update data
    const updateData = {
      ...(name && { name: name.trim() }),
      ...(phone && { phone: phone.trim() }),
      ...(vehicleId && { vehicleId: vehicleId.trim() }),
      ...(zoneId && { zoneId }),
      ...(status && { status }), // active/inactive
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
  const { id } = req.params;
  const tenantId = req.derivedTenantId;

  const driver = await prisma.driver.findUnique({ where: { id, tenantId } });
  if (!driver) return res.status(404).json({ error: "Driver not found" });

  const updated = await prisma.driver.update({
    where: { id },
    data: { status: driver.status === "active" ? "inactive" : "active" },
  });

  res.json({ message: "Status updated", status: updated.status });
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
