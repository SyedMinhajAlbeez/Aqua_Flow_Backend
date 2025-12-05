// // src/middleware/tenantMiddleware.js
// // FINAL VERSION – COMPATIBLE WITH ENUMS

// const prisma = require("../prisma/client");

// module.exports = async (req, res, next) => {
//   try {
//     const user = req.user;

//     if (!user) return res.status(401).json({ message: "Unauthorized" });

//     // SUPER ADMIN → Full access
//     if (user.role === "super_admin") {
//       req.derivedTenantId = req.headers["x-tenant-id"] || null;
//       req.tenantFilter = req.derivedTenantId
//         ? { tenantId: req.derivedTenantId }
//         : {};
//       return next();
//     }

//     // COMPANY_ADMIN or COMPANY_USER
//     if (user.role !== "company_admin" && user.role !== "company_user") {
//       return res.status(403).json({ message: "Access denied – Invalid role" });
//     }

//     if (!user.tenantId) {
//       return res.status(403).json({ message: "No company assigned" });
//     }

//     const tenant = await prisma.tenant.findUnique({
//       where: { id: user.tenantId },
//     });

//     if (!tenant || tenant.status !== "active") {
//       return res.status(403).json({ message: "Company not active" });
//     }

//     req.derivedTenantId = user.tenantId;
//     req.tenantFilter = { tenantId: user.tenantId };

//     next();
//   } catch (err) {
//     console.error("Tenant Middleware Error:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// ==================== FILE 2: src/middleware/tenantMiddleware.js ====================
const prisma = require("../prisma/client");

module.exports = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // ==================== SUPER ADMIN ====================
    if (user.role === "super_admin") {
      req.derivedTenantId = req.headers["x-tenant-id"] || null;
      req.tenantFilter = req.derivedTenantId
        ? { tenantId: req.derivedTenantId }
        : {};
      return next();
    }

    // ==================== COMPANY_ADMIN or COMPANY_USER ====================
    if (user.role === "company_admin" || user.role === "company_user") {
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
      return next();
    }

    // ==================== DRIVER ====================
    if (user.role === "driver") {
      if (!user.tenantId) {
        return res.status(403).json({ message: "No tenant assigned" });
      }

      // Optional: Check if driver is active
      const driver = await prisma.driver.findUnique({
        where: { id: user.id },
        select: { status: true },
      });

      if (!driver || driver.status !== "active") {
        return res.status(403).json({ message: "Driver account inactive" });
      }

      req.derivedTenantId = user.tenantId;
      req.tenantFilter = { tenantId: user.tenantId };
      return next();
    }

    // ==================== CUSTOMER ====================
    if (user.role === "customer") {
      if (!user.tenantId) {
        return res.status(403).json({ message: "No tenant assigned" });
      }

      // Optional: Check if customer is active
      const customer = await prisma.customer.findUnique({
        where: { id: user.id },
        select: { status: true },
      });

      if (!customer || customer.status !== "active") {
        return res.status(403).json({ message: "Customer account inactive" });
      }

      req.derivedTenantId = user.tenantId;
      req.tenantFilter = { tenantId: user.tenantId };
      return next();
    }

    // ==================== INVALID ROLE ====================
    return res.status(403).json({ message: "Access denied – Invalid role" });
  } catch (err) {
    console.error("Tenant Middleware Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
