// src/controllers/zoneController.js
const prisma = require("../prisma/client");

// CREATE ZONE
exports.createZone = async (req, res) => {
  try {
    const { name, description } = req.body;
    const tenantId = req.derivedTenantId;

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const zone = await prisma.zone.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        tenantId,
        status: "active",
      },
    });

    res.status(201).json({ message: "Zone created", zone });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET ALL ZONES (Paginated)
exports.getZones = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const tenantId = req.derivedTenantId;

    const [zones, total] = await Promise.all([
      prisma.zone.findMany({
        where: { tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.zone.count({ where: { tenantId } }),
    ]);

    res.json({
      zones,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE ZONE
exports.updateZone = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.derivedTenantId;
    const { name, description } = req.body;

    if (name !== undefined && !name) {
      return res.status(400).json({ error: "name cannot be empty" });
    }

    const data = {
      ...(name && { name: name.trim() }),
      ...(description !== undefined && {
        description: description?.trim() || null,
      }),
    };

    const zone = await prisma.zone.update({
      where: { id, tenantId },
      data,
    });

    res.json({ message: "Zone updated", zone });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH ZONE (Soft Delete → status = inactive)
exports.deleteZone = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.derivedTenantId;

    const zone = await prisma.zone.findUnique({
      where: { id, tenantId },
      select: { status: true },
    });

    const updated = await prisma.zone.update({
      where: { id, tenantId },
      data: { status: zone.status === "active" ? "inactive" : "active" },
    });

    res.json({ message: "Status updated", status: updated.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
