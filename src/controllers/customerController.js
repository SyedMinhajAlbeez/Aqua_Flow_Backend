const prisma = require("../prisma/client");
const { sendOTP, verifyOTP } = require("../utils/otpService");

// // CREATE CUSTOMER – AB zoneId BHI ACCEPT KAREGA
// exports.createCustomer = async (req, res) => {
//   try {
//     const {
//       name,
//       phone,
//       address,
//       email,
//       city,
//       postalCode,
//       country,
//       zoneId, // ← NEW: Zone ID from dropdown
//       securityDeposit = 0,
//     } = req.body;

//     const tenantId = req.derivedTenantId;

//     // Required fields
//     if (!name || !phone || !address) {
//       return res.status(400).json({
//         error: "Name, phone, and address are required",
//       });
//     }

//     const normalizedPhone = phone.trim();

//     // Check duplicate phone
//     const existing = await prisma.customer.findFirst({
//       where: { phone: normalizedPhone, tenantId },
//     });
//     if (existing) {
//       return res.status(400).json({ error: "Phone number already registered" });
//     }

//     // Optional: Validate zoneId belongs to this tenant
//     if (zoneId) {
//       const zone = await prisma.zone.findUnique({
//         where: { id: zoneId, tenantId },
//       });
//       if (!zone) {
//         return res.status(400).json({ error: "Invalid zone selected" });
//       }
//     }

//     const customer = await prisma.customer.create({
//       data: {
//         name: name.trim(),
//         phone: normalizedPhone,
//         address: address.trim(),
//         email: email?.trim().toLowerCase() || null,
//         city: city?.trim() || null,
//         postalCode: postalCode?.trim() || null,
//         country: country?.trim() || null,
//         zoneId: zoneId || null,
//         securityDeposit: parseFloat(securityDeposit) || 0,
//         tenantId,
//         status: "active",
//       },
//       include: {
//         zone: { select: { name: true } }, // ← Zone ka naam bhi return karo
//       },
//     });

//     res.status(201).json({
//       message: "Customer created successfully",
//       customer,
//     });
//   } catch (err) {
//     console.error("Create customer error:", err);
//     if (err.code === "P2002") {
//       return res.status(400).json({ error: "Phone number already exists" });
//     }
//     res.status(500).json({ error: "Failed to create customer" });
//   }
// };

// // GET ALL CUSTOMERS – SAB FIELDS + ZONE NAME
// // exports.getCustomers = async (req, res) => {
// //   try {
// //     const page = parseInt(req.query.page) || 1;
// //     const limit = parseInt(req.query.limit) || 10;
// //     const skip = (page - 1) * limit;
// //     const tenantId = req.derivedTenantId;

// //     const [customers, total, activeCount, inactiveCount] = await Promise.all([
// //       prisma.customer.findMany({
// //         where: { tenantId },
// //         skip,
// //         take: limit,
// //         orderBy: { createdAt: "desc" },
// //         select: {
// //           id: true,
// //           name: true,
// //           phone: true,
// //           email: true,
// //           address: true,
// //           city: true,
// //           postalCode: true,
// //           country: true,
// //           zone: { select: { id: true, name: true } }, // ← Zone ID + Name
// //           totalSpent: true,
// //           dueAmount: true,
// //           securityDeposit: true,
// //           empties: true,
// //           bottlesGiven: true,

// //           status: true,
// //           lastOrderDate: true,
// //           sleepingSince: true,

// //           createdAt: true,
// //           updatedAt: true,
// //         },
// //       }),
// //       prisma.customer.count({ where: { tenantId } }),
// //       prisma.customer.count({ where: { tenantId, status: "active" } }),
// //       prisma.customer.count({ where: { tenantId, status: "inactive" } }),
// //     ]);

// //     res.json({
// //       customers,
// //       counts: {
// //         totalCustomers: total,
// //         activeCustomers: activeCount,
// //         inactiveCustomers: inactiveCount,
// //       },
// //       pagination: {
// //         page,
// //         limit,
// //         total,
// //         totalPages: Math.ceil(total / limit),
// //       },
// //     });
// //   } catch (err) {
// //     console.error("Get customers error:", err);
// //     res.status(500).json({ error: "Failed to fetch customers" });
// //   }
// // };
// exports.getCustomers = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 10;
//     const search = req.query.search || "";
//     const skip = (page - 1) * limit;
//     const tenantId = req.derivedTenantId;

//     // 🔍 Search condition
//     const whereCondition = {
//       tenantId,
//       ...(search && {
//         OR: [
//           { name: { contains: search, mode: "insensitive" } },
//           { phone: { contains: search, mode: "insensitive" } },
//           { email: { contains: search, mode: "insensitive" } },
//         ],
//       }),
//     };

//     const [customers, total, activeCount, inactiveCount] = await Promise.all([
//       prisma.customer.findMany({
//         where: whereCondition,
//         skip,
//         take: limit,
//         orderBy: { createdAt: "desc" },
//         select: {
//           id: true,
//           name: true,
//           phone: true,
//           email: true,
//           address: true,
//           city: true,
//           postalCode: true,
//           country: true,
//           zone: { select: { id: true, name: true } },
//           totalSpent: true,
//           dueAmount: true,
//           securityDeposit: true,
//           empties: true,
//           bottlesGiven: true,
//           status: true,
//           lastOrderDate: true,
//           sleepingSince: true,
//           createdAt: true,
//           updatedAt: true,
//         },
//       }),
//       prisma.customer.count({ where: whereCondition }),
//       prisma.customer.count({ where: { tenantId, status: "active" } }),
//       prisma.customer.count({ where: { tenantId, status: "inactive" } }),
//     ]);

//     res.json({
//       customers,
//       counts: {
//         totalCustomers: total,
//         activeCustomers: activeCount,
//         inactiveCustomers: inactiveCount,
//       },
//       pagination: {
//         page,
//         limit,
//         total,
//         totalPages: Math.ceil(total / limit),
//       },
//     });
//   } catch (err) {
//     console.error("Get customers error:", err);
//     res.status(500).json({ error: "Failed to fetch customers" });
//   }
// };

// // In your file (e.g., customerController.js)
// const NEW_CUSTOMER_DAYS = 7; // Adjust this threshold as needed (e.g., 30 for a month)







exports.createCustomer = async (req, res) => {
  try {
    const {
      name,
      phone,
      address,
      email,
      city,
      postalCode,
      country,
      zoneId, // ← NEW: Zone ID from dropdown
      securityDeposit = 0,
    } = req.body;

    const tenantId = req.derivedTenantId;

    // Required fields
    if (!name || !phone || !address) {
      return res.status(400).json({
        error: "Name, phone, and address are required",
      });
    }

    const normalizedPhone = phone.trim();

    // Check duplicate phone
    const existing = await prisma.customer.findFirst({
      where: { phone: normalizedPhone, tenantId },
    });
    if (existing) {
      return res.status(400).json({ error: "Phone number already registered" });
    }

    // Optional: Validate zoneId belongs to this tenant
    if (zoneId) {
      const zone = await prisma.zone.findUnique({
        where: { id: zoneId, tenantId },
      });
      if (!zone) {
        return res.status(400).json({ error: "Invalid zone selected" });
      }
    }


    const customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        phone: normalizedPhone,
        address: address.trim(),
        email: email?.trim().toLowerCase() || null,
        city: city?.trim() || null,
        postalCode: postalCode?.trim() || null,
        country: country?.trim() || null,
        zoneId: zoneId || null,
        securityDeposit: parseFloat(securityDeposit) || 0,
        tenantId,
        status: "active",
      },
      include: {
        zone: { select: { name: true } }, // ← Zone ka naam bhi return karo
      },
    });

    // NEW: Optionally add isNew to the creation response (computed here for consistency)
    const now = new Date();
    customer.isNew = (now - customer.createdAt) < (NEW_CUSTOMER_DAYS * 24 * 60 * 60 * 1000);

    res.status(201).json({
      message: "Customer created successfully",
      customer,
    });
  } catch (err) {
    console.error("Create customer error:", err);
    if (err.code === "P2002") {
      return res.status(400).json({ error: "Phone number already exists" });
    }
    res.status(500).json({ error: "Failed to create customer" });
  }
};




exports.getCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const skip = (page - 1) * limit;
    const tenantId = req.derivedTenantId;

    // 🔍 Search condition
    const whereCondition = {
      tenantId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          {zone: {
              name: { contains: search, mode: "insensitive" },
            },
          },
        ],
      }),
    };

    // NEW: Calculate the date threshold for "new" customers
    const newThreshold = new Date(Date.now() - (NEW_CUSTOMER_DAYS * 24 * 60 * 60 * 1000));

    const [customers, total, activeCount, inactiveCount, newCount] = await Promise.all([
      prisma.customer.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          address: true,
          city: true,
          postalCode: true,
          country: true,
          zone: { select: { id: true, name: true } },
          totalSpent: true,
          dueAmount: true,
          securityDeposit: true,
          empties: true,
          bottlesGiven: true,
          status: true,
          lastOrderDate: true,
          sleepingSince: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.customer.count({ where: whereCondition }),
      prisma.customer.count({ where: { tenantId, status: "active" } }),
      prisma.customer.count({ where: { tenantId, status: "inactive" } }),
      // NEW: Count new customers (active ones created recently)
      prisma.customer.count({ 
        where: { 
          tenantId, 
          status: "active", 
          createdAt: { gte: newThreshold } 
        } 
      }),
    ]);

    // NEW: Add isNew flag to each customer in the list
    const now = new Date();
    const enhancedCustomers = customers.map(customer => ({
      ...customer,
      isNew: (now - customer.createdAt) < (NEW_CUSTOMER_DAYS * 24 * 60 * 60 * 1000),
    }));

    res.json({
      customers: enhancedCustomers, // Updated with isNew
      counts: {
        totalCustomers: total,
        activeCustomers: activeCount,
        inactiveCustomers: inactiveCount,
        newCustomers: newCount, // NEW: For easy difference (e.g., total - newCustomers = non-new)
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Get customers error:", err);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
};

// In your file (e.g., customerController./js)
const NEW_CUSTOMER_DAYS = 7; // Adjust this threshold as needed (e.g., 30 for a month)







// exports.getCustomers = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 10;
//     const search = req.query.search || "";
//     const skip = (page - 1) * limit;
//     const tenantId = req.derivedTenantId;

//     // 🔍 Search condition
//     const whereCondition = {
//       tenantId,
//       ...(search && {
//         OR: [
//           { name: { contains: search, mode: "insensitive" } },
//           { phone: { contains: search, mode: "insensitive" } },
//           { email: { contains: search, mode: "insensitive" } },
//         ],
//       }),
//     };

//     // NEW: Calculate the date threshold for "new" customers
//     const newThreshold = new Date(Date.now() - (NEW_CUSTOMER_DAYS * 24 * 60 * 60 * 1000));

//     const [customers, total, activeCount, inactiveCount, newCount] = await Promise.all([
//       prisma.customer.findMany({
//         where: whereCondition,
//         skip,
//         take: limit,
//         orderBy: { createdAt: "desc" },
//         select: {
//           id: true,
//           name: true,
//           phone: true,
//           email: true,
//           address: true,
//           city: true,
//           postalCode: true,
//           country: true,
//           zone: { select: { id: true, name: true } },
//           totalSpent: true,
//           dueAmount: true,
//           securityDeposit: true,
//           empties: true,
//           bottlesGiven: true,
//           status: true,
//           lastOrderDate: true,
//           sleepingSince: true,
//           createdAt: true,
//           updatedAt: true,
//         },
//       }),
//       prisma.customer.count({ where: whereCondition }),
//       prisma.customer.count({ where: { tenantId, status: "active" } }),
//       prisma.customer.count({ where: { tenantId, status: "inactive" } }),
//       // NEW: Count new customers (active ones created recently)
//       prisma.customer.count({ 
//         where: { 
//           tenantId, 
//           status: "active", 
//           createdAt: { gte: newThreshold } 
//         } 
//       }),
//     ]);

//     // NEW: Add isNew flag to each customer in the list
//     const now = new Date();
//     const enhancedCustomers = customers.map(customer => ({
//       ...customer,
//       isNew: (now - customer.createdAt) < (NEW_CUSTOMER_DAYS * 24 * 60 * 60 * 1000),
//     }));

//     res.json({
//       customers: enhancedCustomers, // Updated with isNew
//       counts: {
//         totalCustomers: total,
//         activeCustomers: activeCount,
//         inactiveCustomers: inactiveCount,
//         newCustomers: newCount, // NEW: For easy difference (e.g., total - newCustomers = non-new)
//       },
//       pagination: {
//         page,
//         limit,
//         total,
//         totalPages: Math.ceil(total / limit),
//       },
//     });
//   } catch (err) {
//     console.error("Get customers error:", err);
//     res.status(500).json({ error: "Failed to fetch customers" });
//   }
// };






// UPDATE CUSTOMER – AB zoneId BHI UPDATE HOGA
exports.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.derivedTenantId;
    const {
      name,
      phone,
      address,
      email,
      city,
      postalCode,
      country,
      zoneId,
      securityDeposit,
      status,
    } = req.body;

    // Validation
    if (name !== undefined && !name.trim())
      return res.status(400).json({ error: "Name cannot be empty" });
    if (phone !== undefined && !phone.trim())
      return res.status(400).json({ error: "Phone cannot be empty" });
    if (address !== undefined && !address.trim())
      return res.status(400).json({ error: "Address cannot be empty" });

    // Phone duplicate check
    if (phone) {
      const normalizedPhone = phone.trim();
      const existing = await prisma.customer.findFirst({
        where: { phone: normalizedPhone, tenantId, NOT: { id } },
      });
      if (existing)
        return res
          .status(400)
          .json({ error: "Phone already used by another customer" });
    }

    // Validate zoneId
    if (zoneId) {
      const zone = await prisma.zone.findUnique({
        where: { id: zoneId, tenantId },
      });
      if (!zone)
        return res.status(400).json({ error: "Invalid zone selected" });
    }

    const data = {
      ...(name && { name: name.trim() }),
      ...(phone && { phone: phone.trim() }),
      ...(address && { address: address.trim() }),
      ...(email !== undefined && {
        email: email?.trim().toLowerCase() || null,
      }),
      ...(city !== undefined && { city: city?.trim() || null }),
      ...(postalCode !== undefined && {
        postalCode: postalCode?.trim() || null,
      }),
      ...(country !== undefined && { country: country?.trim() || null }),
      ...(zoneId !== undefined && { zoneId: zoneId || null }),
      ...(securityDeposit !== undefined && {
        securityDeposit: parseFloat(securityDeposit),
      }),
      ...(status && { status }),
    };

    const customer = await prisma.customer.update({
      where: { id, tenantId },
      data,
      include: {
        zone: { select: { name: true } },
      },
    });

    res.json({
      message: "Customer updated successfully",
      customer,
    });
  } catch (err) {
    console.error("Update customer error:", err);
    if (err.code === "P2002") {
      return res.status(400).json({ error: "Phone number already exists" });
    }
    res.status(500).json({ error: "Failed to update customer" });
  }
};

// TOGGLE STATUS (same)
exports.toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.derivedTenantId;

    const customer = await prisma.customer.findUnique({
      where: { id, tenantId },
      select: { status: true },
    });

    if (!customer)
      return res.status(404).json({ message: "Customer not found" });

    const updated = await prisma.customer.update({
      where: { id, tenantId },
      data: {
        status: customer.status === "active" ? "inactive" : "active",
      },
    });

    res.json({ message: "Status updated", status: updated.status });
  } catch (err) {
    console.error("Toggle status error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
};

// SEND OTP TO CUSTOMER PHONE
exports.sendCustomerOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    const tenantId = req.derivedTenantId;

    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    const normalizedPhone = phone.trim();

    const customer = await prisma.customer.findFirst({
      where: { phone: normalizedPhone, tenantId },
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    if (customer.status !== "active") {
      return res.status(403).json({ error: "Account is inactive" });
    }

    const sent = await sendOTP(normalizedPhone);
    if (!sent) {
      return res.status(500).json({ error: "Failed to send OTP" });
    }

    res.json({ message: "OTP sent to your phone" });
  } catch (err) {
    console.error("Send OTP error:", err);
    res.status(500).json({ error: "Failed to send OTP" });
  }
};

// VERIFY OTP & LOGIN
exports.verifyCustomerOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const tenantId = req.derivedTenantId;

    if (!phone || !otp) {
      return res.status(400).json({ error: "Phone and OTP are required" });
    }

    const normalizedPhone = phone.trim();

    // Verify OTP
    const isValid = await verifyOTP(normalizedPhone, otp);
    if (!isValid) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    const customer = await prisma.customer.findFirst({
      where: { phone: normalizedPhone, tenantId },
    });

    if (!customer || customer.status !== "active") {
      return res.status(403).json({ error: "Invalid customer" });
    }

    // Generate JWT
    const token = require("jsonwebtoken").sign(
      {
        id: customer.id,
        role: "customer",
        tenantId: customer.tenantId,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address:customer.address,
        // zone: customer.zone.name,
        zoneId: customer.zoneId,
      },
    });
  } catch (err) {
    console.error("Verify OTP error:", err);
    res.status(500).json({ error: "Login failed" });
  }
};

// RESEND OTP (Customer)
exports.resendCustomerOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    const tenantId = req.derivedTenantId;

    if (!phone) {
      return res.status(400).json({ error: "Phone required" });
    }

    const normalizedPhone = phone.trim();

    const customer = await prisma.customer.findFirst({
      where: {
        phone: normalizedPhone,
        tenantId,
      },
    });

    if (!customer || customer.status !== "active") {
      return res.status(403).json({ error: "Customer not active" });
    }

    // true = isResend (cooldown logic inside sendOTP)
    const sent = await sendOTP(normalizedPhone, true);

    if (!sent) {
      return res.status(429).json({
        error: "Please wait 20 seconds before resending OTP",
      });
    }

    res.json({
      message: "OTP resent to customer",
    });
  } catch (err) {
    console.error("Resend customer OTP error:", err);
    res.status(500).json({ error: "Failed to resend OTP" });
  }
};


// GET SINGLE CUSTOMER BY ID
exports.getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.derivedTenantId;

    // Validate ID format (optional but recommended)
    if (!id || typeof id !== "string" || id.trim() === "") {
      return res.status(400).json({ error: "Invalid customer ID" });
    }

    const customer = await prisma.customer.findUnique({
      where: {
        id,
        tenantId, // Ensures customer belongs to the current tenant
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        address: true,
        city: true,
        postalCode: true,
        country: true,
        zone: {
          select: {
            id: true,
            name: true,
          },
        },
        totalSpent: true,
        dueAmount: true,
        securityDeposit: true,
        empties: true,
        bottlesGiven: true,
        status: true,
        lastOrderDate: true,
        sleepingSince: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Return consistent response format
    res.json({
      message: "Customer fetched successfully",
      customer,
    });
  } catch (err) {
    console.error("Get customer by ID error:", err);
    res.status(500).json({ error: "Failed to fetch customer" });
  }
};



// PERMANENT DELETE CUSTOMER BY ID
exports.deleteCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.derivedTenantId;

    if (!id || typeof id !== "string" || id.trim() === "") {
      return res.status(400).json({ error: "Invalid customer ID" });
    }

    // 1️⃣ Verify customer belongs to tenant
    const customer = await prisma.customer.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // 2️⃣ PERMANENT DELETE (UNIQUE FIELD ONLY)
    await prisma.customer.delete({
      where: {
        id: customer.id,
      },
    });

    res.json({
      message: "Customer permanently deleted",
      customerId: id,
    });
  } catch (err) {
    console.error("Permanent delete customer error:", err);
    res.status(500).json({ error: "Failed to permanently delete customer" });
  }
}
