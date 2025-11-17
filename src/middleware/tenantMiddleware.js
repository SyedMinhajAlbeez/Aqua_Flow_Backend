// src/middleware/tenantMiddleware.js
// FINAL VERSION – COMPATIBLE WITH ENUMS

const prisma = require("../prisma/client");

module.exports = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) return res.status(401).json({ message: "Unauthorized" });

    // SUPER ADMIN → Full access
    if (user.role === "super_admin") {
      req.derivedTenantId = req.headers["x-tenant-id"] || null;
      req.tenantFilter = req.derivedTenantId
        ? { tenantId: req.derivedTenantId }
        : {};
      return next();
    }

    // COMPANY_ADMIN or STAFF
    if (user.role !== "company_admin" && user.role !== "company_user") {
      return res.status(403).json({ message: "Access denied – Invalid role" });
    }

    if (!user.tenantId) {
      return res.status(403).json({ message: "No company assigned" });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
    });

    if (!tenant || tenant.status !== "active") {
      return res.status(403).json({ message: "Company not active" });
    }

    req.derivedTenantId = user.tenantId;
    req.tenantFilter = { tenantId: user.tenantId };

    next();
  } catch (err) {
    console.error("Tenant Middleware Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
