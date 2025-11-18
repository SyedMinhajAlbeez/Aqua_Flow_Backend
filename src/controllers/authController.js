// src/controllers/authController.js
const prisma = require("../prisma/client");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// SUPER ADMIN: Create Company + First Admin User
exports.createCompany = async (req, res) => {
  try {
    const { name, email, password, phone, address, logo } = req.body;

    if (req.user?.role !== "super_admin") {
      return res
        .status(403)
        .json({ message: "Only Super Admin can create company" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing)
      return res.status(400).json({ message: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "company_admin", // ← YEH UPDATE KIYA
        phone,
        address,
        logo,
      },
    });

    const tenant = await prisma.tenant.create({
      data: {
        name,
        email,
        phone,
        address,
        logo,
        status: "active",
        keeperId: user.id,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { tenantId: tenant.id },
    });

    const token = jwt.sign(
      { id: user.id, tenantId: tenant.id, role: "company_admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "Company & Admin created successfully!",
      token,
      user: {
        id: user.id,
        name,
        email,
        role: "company_admin",
        tenantId: tenant.id,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// COMPANY ADMIN: Create COMPANY USER (Same Company)
exports.createCompanyUser = async (req, res) => {
  try {
    const { name, email, password, phone, role = "company_user" } = req.body;
    const tenantId = req.derivedTenantId;

    if (!tenantId)
      return res.status(403).json({ message: "No company access" });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing)
      return res.status(400).json({ message: "Email already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        role, // "company_user" or "company_admin"
        phone,
        tenantId,
      },
    });

    res.status(201).json({ message: "Company User created", user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// LOGIN (Works for all roles)
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: { select: { name: true } } },
    });

    if (!user || !user.password) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid password" });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastActivity: new Date() },
    });

    const token = jwt.sign(
      { id: user.id, tenantId: user.tenantId, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login Successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        company: user.tenant?.name || null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
