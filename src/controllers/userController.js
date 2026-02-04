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
        logo: true,
        isActive: true,
        // status: true,
        createdAt: true,
        tenant:
          req.user.role === "super_admin" ? { select: { name: true } } : false,
        // tenant:
        //   req.user.role === "super_admin"
        //     ? {
        //         select: {
        //           name: true,
        //           companyTariffs: {
        //             // <-- new relation
        //             select: {
        //               tariff: { select: { name: true, isDefault: true } },
        //               assignedAt: true,
        //             },
        //           },
        //         },
        //       }
        //     : false,
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
      },
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
      data: { name, email, phone, address, logo, isActive: true },
    });

    res.json({ message: "Company updated", company: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};




// exports.updateUserStatus = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { isActive } = req.body;
//     const tenantId = req.derivedTenantId;

//     if (!tenantId) {
//       return res.status(403).json({ message: "No company access" });
//     }

//     const user = await prisma.user.findFirst({
//       where: { id, tenantId },
//     });

//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     const updatedUser = await prisma.user.update({
//       where: { id },
//       data: { isActive },
//     });

//     res.json({
//       message: "User status updated",
//       user: updatedUser,
//     });
//   } catch (err) {
//     console.error("Update User Status Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };


exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // frontend sends { status: "active" | "inactive" }

    // Convert status string to boolean
    const isActive = status === "active";

    const requesterTenantId = req.derivedTenantId;
    const requesterRole = req.user?.role;

    let user;

    if (requesterRole === "super_admin") {
      user = await prisma.user.findUnique({ where: { id } });
    } else {
      if (!requesterTenantId) {
        return res.status(403).json({ message: "No company access" });
      }
      user = await prisma.user.findFirst({ where: { id, tenantId: requesterTenantId } });
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { isActive },
    });
//     if (user.tenantId) {
//   await prisma.tenant.update({
//     where: { id: user.tenantId },
//     data: { status: isActive ? "active" : "inactive" },
//   });
// }
// ✅ ONLY update tenant if THIS USER is company_admin
    if (user.role === "company_admin" && user.tenantId) {
      await prisma.tenant.update({
        where: { id: user.tenantId },
        data: { status: isActive ? "active" : "inactive" },
      });
    }

    res.json({
      message: "User status updated",
      user: updatedUser,
    });
  } catch (err) {
    console.error("Update User Status Error:", err);
    res.status(500).json({ error: err.message });
  }
};
