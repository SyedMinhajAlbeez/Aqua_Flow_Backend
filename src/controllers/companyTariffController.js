const prisma = require("../prisma/client");
const companyTariffService = require("../services/companyTariffService");

// POST /api/super-admin/company-tariffs
// exports.assignTariff = async (req, res) => {
//   try {
//     const { companyId, tariffId } = req.body;

//     if (!companyId || !tariffId) {
//       return res.status(400).json({ message: "companyId and tariffId are required" });
//     }

//     // 1. Check if company exists
//     const tenant = await prisma.tenant.findUnique({
//       where: { id: companyId },
//     });

//     if (!tenant) {
//       return res.status(404).json({ message: "Company not found" });
//     }

//     // 2. IMPORTANT: Check if the tariff actually exists
//     const tariff = await prisma.tariff.findUnique({
//       where: { id: tariffId },
//     });

//     if (!tariff) {
//       return res.status(404).json({ message: "Tariff not found" });
//     }

//     // Optional: extra business rule check
//     if (!tariff.isActive) {
//       return res.status(400).json({ message: "Cannot assign an inactive tariff" });
//     }

//     // 3. Deactivate existing active assignments for this company
//     await prisma.companyTariff.updateMany({
//       where: {
//         companyId: companyId,
//         isActive: true,
//       },
//       data: {
//         isActive: false,
//         // deactivatedAt: new Date()   // ← only if field exists
//       },
//     });

//     // 4. Create the new assignment
//     const assignment = await prisma.companyTariff.create({
//       data: {
//         companyId: companyId,
//         tariffId: tariffId,
//         assignedBy: req.user.id,
//         isActive: true,
//         assignedAt: new Date(),
//         // isDefaultApplied: true,     // ← add if needed
//         // effectiveFrom: new Date(),  // ← add if needed
//       },
//     });

//     return res.status(201).json({
//       message: "Tariff assigned successfully",
//       assignment,
//     });
//   } catch (err) {
//     console.error("Error assigning tariff:", err);
//     return res.status(500).json({
//       message: "Failed to assign tariff",
//       error: err.message,
//     });
//   }
// };

exports.assignTariff = async (req, res) => {
  try {
    const { companyId, tariffId } = req.body;

    if (!companyId || !tariffId) {
      return res.status(400).json({
        message: "companyId and tariffId are required",
      });
    }

    // 1️⃣ companyId = company-admin USER id
    const companyAdmin = await prisma.user.findUnique({
      where: { id: companyId },
      select: { id: true, tenantId: true, role: true },
    });

    if (!companyAdmin || companyAdmin.role !== "company_admin") {
      return res.status(404).json({
        message: "Company admin not found",
      });
    }

    const tenantId = companyAdmin.tenantId;

    // 2️⃣ Validate tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return res.status(404).json({ message: "Tenant not found" });
    }

    // 3️⃣ Validate tariff
    const tariff = await prisma.tariff.findUnique({
      where: { id: tariffId },
    });

    if (!tariff || !tariff.isActive) {
      return res.status(400).json({
        message: "Tariff not found or inactive",
      });
    }

    // 4️⃣ Deactivate existing active tariff
    await prisma.companyTariff.updateMany({
      where: {
        companyId: tenantId,   // ✅ IMPORTANT
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    // 5️⃣ Assign new tariff
    const assignment = await prisma.companyTariff.create({
      data: {
        companyId: tenantId,   // ✅ IMPORTANT
        tariffId,
        assignedBy: req.user.id,
        isActive: true,
        assignedAt: new Date(),
      },
    });

    return res.status(201).json({
      message: "Tariff assigned successfully",
      assignment,
    });
  } catch (err) {
    console.error("Tariff assignment error:", err);
    return res.status(500).json({
      message: "Failed to assign tariff",
      error: err.message,
    });
  }
};





// exports.getCompanyTariffs = async (req, res) => {
//   try {
//     const companyTariffs = await prisma.companyTariff.findMany({
//       include: {
//         tariff: true
//       }
//     });

//     res.status(200).json(companyTariffs);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Something went wrong", error: error.message });
//   }
// };
exports.getCompanyTariffs = async (req, res) => {
  try {
    const companyTariffs = await prisma.companyTariff.findMany({
      where: {
        isActive: true,           // ← only show currently active assignments
      },
      include: {
        tariff: {
          select: {
            id: true,
            name: true,
            description: true,
            isDefault: true,
          },
        },
        tenant: {                   // ← add this relation
          select: {
            id: true,
            name: true,             // ← company name – most important!
            email: true,
            phone: true,
          },
        },
        // Optional: show who assigned it
        // assignedByUser: {
        //   select: { id: true, name: true, email: true }
        // }
      },
      orderBy: [
        { assignedAt: 'desc' },     // newest first
      ],
    });

    // Optional: nicer response shape
    const formatted = companyTariffs.map((ct) => ({
      company: {
        id: ct.tenant?.id,
        name: ct.tenant?.name || "Unknown",
        email: ct.tenant?.email,
      },
      tariff: {
        id: ct.tariff.id,
        name: ct.tariff.name,
        isDefault: ct.tariff.isDefault,
      },
      assignedAt: ct.assignedAt,
      assignedBy: ct.assignedBy,      // UUID – can later join with User if needed
      // isDefaultApplied: ct.isDefaultApplied,
      effectiveFrom: ct.effectiveFrom,
      isActive: ct.isActive,
    }));

    res.status(200).json({
      count: formatted.length,
      assignments: formatted,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong", error: error.message });
  }
};