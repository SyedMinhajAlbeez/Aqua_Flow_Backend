// src/controllers/userController.js
const prisma = require("../prisma/client");

exports.getUsers = async (req, res) => {
  try {
    // SUPER ADMIN → sab users dikhao
    // COMPANY_ADMIN & COMPANY_USER → sirf apne tenant ke
    const where =
      req.user.role === "super_admin" ? {} : { tenantId: req.derivedTenantId };

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        tenant:
          req.user.role === "super_admin" ? { select: { name: true } } : false,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};


exports.getUsersStats = async (req, res) => {
  try {
    // SUPER ADMIN → sab users dikhao
    // COMPANY_ADMIN & COMPANY_USER → sirf apne tenant ke
    const where =
      req.user.role === "super_admin" ? {} : { tenantId: req.derivedTenantId };

    // Get total count
    const totalCount = await prisma.user.count({ where });

    // Calculate date for 1 week ago
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Count users created in the last week
    const recentUsersCount = await prisma.user.count({
      where: {
        ...where,
        createdAt: {
          gte: oneWeekAgo,
        },
      },
    });

    // Calculate percentage
    const recentUsersPercentage =
      totalCount > 0 ? ((recentUsersCount / totalCount) * 100).toFixed(2) : 0;

    res.json({
      usersStats: {
        totalCount,
        recentUsersCount,
        recentUsersPercentage: parseFloat(recentUsersPercentage),
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateCompany = async (req, res) => {
  try {
    const { name, email, phone, address, logo } = req.body;

    const updated = await prisma.tenant.update({
      where: { id: req.derivedTenantId },
      data: { name, email, phone, address, logo },
    });

    res.json({ message: "Company updated", company: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
