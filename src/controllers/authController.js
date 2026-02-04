// src/controllers/authController.js
const prisma = require("../prisma/client");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const companyTariffService = require("../services/companyTariffService"); // <-- our new service

const fs = require("fs");
const path = require("path");

const UPLOAD_DIR = path.join(process.cwd(), "public", "images");

// Helper: Purani image delete karo
const deleteOldImage = (imageUrl) => {
  if (!imageUrl) return;
  const filename = imageUrl.startsWith("/images/")
    ? imageUrl.slice(8)
    : path.basename(imageUrl);
  const fullPath = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    console.log("Old image deleted:", filename);
  }
};

// exports.createCompany = async (req, res) => {
//   try {
//     console.log("📥 BODY:", req.body);
//     console.log("📥 USER:", req.user);
//     console.log("📥 FILE:", req.file);

//     const { name, email, password, phone, address, role } = req.body;
//     const imageUrl = req.file ? `/images/${req.file.filename}` : null;

//     if (req.user?.role !== "super_admin") {
//       return res.status(403).json({
//         message: "Only Super Admin can create company",
//       });
//     }

//     if (!email) {
//       return res.status(400).json({
//         message: "Email is required",
//       });
//     }
//     const normalizedEmail = email.toLowerCase().trim();
//     const existing = await prisma.user.findFirst({
//       where: { email: normalizedEmail },
//     });

//     // const existing = await prisma.user.findFirst({
//     //   where: { email },
//     // });

//     if (existing) {
//       return res.status(400).json({
//         message: "Email already exists",
//       });
//     }

//     const hashedPassword = await bcrypt.hash(password, 10);

//     const user = await prisma.user.create({
//       data: {
//         name,
//         email,
//         password: hashedPassword,
//         // role: "company_admin",
//         role: req.user.tenantId
//         ? "company_user"
//         : "company_admin",

//         phone,
//         address,
//         logo: imageUrl,
//       },
//     });

//     const tenant = await prisma.tenant.create({
//       data: {
//         name,
//         email,
//         phone,
//         address,
//         logo: imageUrl,
//         status: "active",
//         keeperId: user.id,
//       },
//     });

//     await prisma.user.update({
//       where: { id: user.id },
//       data: { tenantId: tenant.id },
//     });

//     const token = jwt.sign(
//       { id: user.id, tenantId: tenant.id, role: "company_admin" },
//       process.env.JWT_SECRET,
//       { expiresIn: "7d" }
//     );

//     const responsePayload = {
//       message: "Company & Admin created successfully!",
//       token,
//       user: {
//         id: user.id,
//         name,
//         logo: imageUrl,
//         email,
//         role: "company_admin",
//         tenantId: tenant.id,
//       },
//     };

//     console.log("📤 RESPONSE:", responsePayload);

//     return res.status(201).json(responsePayload);
//   } catch (err) {
//     if (req.file) fs.unlinkSync(req.file.path);
//     console.error("🔥 ERROR:", err);
//     return res.status(500).json({ error: err.message });
//   }
// };

//hussain
// // SUPER ADMIN: Create Company + First Admin User
// exports.createCompany = async (req, res) => {
//   try {
//     const { name, email, password, phone, address, logo } = req.body;

//     if (req.user?.role !== "super_admin") {
//       return res
//         .status(403)
//         .json({ message: "Only Super Admin can create company" });
//     }

//     const existing = await prisma.user.findUnique({ where: { email } });
//     if (existing)
//       return res.status(400).json({ message: "Email already exists" });

//     const hashedPassword = await bcrypt.hash(password, 10);

//     const user = await prisma.user.create({
//       data: {
//         name,
//         email,
//         password: hashedPassword,
//         role: "company_admin", // ← YEH UPDATE KIYA
//         phone,
//         address,
//         logo,
//       },
//     });

//     const tenant = await prisma.tenant.create({
//       data: {
//         name,
//         email,
//         phone,
//         address,
//         logo,
//         status: "active",
//         keeperId: user.id,
//       },
//     });

//     await prisma.user.update({
//       where: { id: user.id },
//       data: { tenantId: tenant.id },
//     });

//     const token = jwt.sign(
//       { id: user.id, tenantId: tenant.id, role: "company_admin" },
//       process.env.JWT_SECRET,
//       { expiresIn: "7d" }
//     );

//     res.status(201).json({
//       message: "Company & Admin created successfully!",
//       token,
//       user: {
//         id: user.id,
//         name,
//         email,
//         role: "company_admin",
//         tenantId: tenant.id,
//       },
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: err.message });
//   }
// };

exports.createCompany = async (req, res) => {
  try {
    console.log("📥 BODY:", req.body);
    console.log("📥 USER:", req.user);
    console.log("📥 FILE:", req.file);

    const { name, email, password, phone, address } = req.body;
    const imageUrl = req.file ? `/images/${req.file.filename}` : null;

    if (req.user?.role !== "super_admin") {
      return res.status(403).json({
        message: "Only Super Admin can create company",
      });
    }

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findFirst({
      where: { email: normalizedEmail },
    });
    if (existing)
      return res.status(400).json({ message: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    // 1️⃣ Create company-admin user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: req.user.tenantId ? "company_user" : "company_admin",
        phone,
        address,
        logo: imageUrl,
      },
    });

    // 2️⃣ Create tenant/company
    const tenant = await prisma.tenant.create({
      data: {
        name,
        email,
        phone,
        address,
        logo: imageUrl,
        status: "active",
        keeperId: user.id,
      },
    });

    // 3️⃣ Link tenant to company-admin
    await prisma.user.update({
      where: { id: user.id },
      data: { tenantId: tenant.id },
    });

    // 4️⃣ Auto-assign default tariff
    await companyTariffService.autoAssignDefault(tenant.id, req.user.id);

    // 5️⃣ Generate JWT token
    const token = jwt.sign(
      { id: user.id, tenantId: tenant.id, role: "company_admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    const responsePayload = {
      message: "Company & Admin created successfully!",
      token,
      user: {
        id: user.id,
        name,
        logo: imageUrl,
        email,
        role: "company_admin",
        tenantId: tenant.id,
      },
    };

    console.log("📤 RESPONSE:", responsePayload);
    return res.status(201).json(responsePayload);
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    console.error("🔥 ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
};

// COMPANY ADMIN: Create COMPANY USER (Same Company)
exports.createCompanyUser = async (req, res) => {
  try {
    const { name, email, password, phone, role = "company_user", } = req.body;
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
        isActive:true,
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
      include: { tenant: { select: { name: true, logo: true, status: true } } },
    });

    
if (!user) {
  console.log('User not found for email:', email);
  return res.status(400).json({ message: "Invalid credentials" });
}

// Now safe to log user details
console.log(`Logging in user: ${user.email}`);
// console.log('Tenant ID:', user.tenantId);
console.log('Tenant status:', user.tenant?.status);
console.log('Tenant object:', user.tenant);

console.log('Tenant ID:', user.tenantId);
    
    if (!user || !user.password) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // ✅ Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        message: "User is inactive. Please contact your admin.",
      });
    }
    
// Check if company (tenant) is active by status field
// if (user.tenant?.status !== "active") {
//   return res.status(403).json({
//     message: "Company is inactive. Please contact your admin.",
//   });
// }
// Only check tenant status if tenantId exists (skip super admins)
if (user.tenantId) {
  if (!user.tenant || user.tenant.status !== "active") {
    return res.status(403).json({
      message: "Company is inactive. Please contact your admin.",
    });
  }
}


    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid password" });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastActivity: new Date() },
    });

    const token = jwt.sign(
      { id: user.id, tenantId: user.tenantId, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
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
        status: user.tenant?.status || null,
        isActive: user.isActive || null,
        company: user.tenant?.name || null,
        companyLogo: user.tenant?.logo || null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};



exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // 1️⃣ Required fields
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current password and new password are required",
      });
    }

    // 2️⃣ Minimum length
    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters long",
      });
    }

    // 3️⃣ Prevent same password
    if (currentPassword === newPassword) {
      return res.status(400).json({
        message: "New password must be different from current password",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 4️⃣ Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Current password is incorrect",
      });
    }

    // 5️⃣ Extra safety (hash-level comparison)
    const isSameAsOld = await bcrypt.compare(newPassword, user.password);
    if (isSameAsOld) {
      return res.status(400).json({
        message: "New password must be different from previous password",
      });
    }

    // 6️⃣ Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(), // optional
      },
    });

    return res.status(200).json({
      message: "Password updated successfully",
    });
  } catch (err) {
    console.error("🔥 Change Password Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


