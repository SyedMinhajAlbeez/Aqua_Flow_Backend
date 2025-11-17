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
