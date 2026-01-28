const prisma = require("../prisma/client");

/**
 * CREATE TARIFF
 */
// const createTariff = async (data, superAdminId) => {
//   if (!data.name || !data.slabs || !data.effectiveFrom) {
//     throw new Error("Name, effectiveFrom, and slabs are required");
//   }

//   if (!Array.isArray(data.slabs) || data.slabs.length === 0) {
//     throw new Error("At least one slab is required");
//   }

//   // Validate slabs
//   for (const slab of data.slabs) {
//     if (slab.fromQty < 0) {
//       throw new Error(`Invalid fromQty for ${slab.productType}`);
//     }

//     if (slab.toQty !== null && slab.toQty !== undefined) {
//       if (slab.toQty < slab.fromQty) {
//         throw new Error(`toQty must be >= fromQty for ${slab.productType}`);
//       }
//     }

//     if (slab.pricePerUnit <= 0) {
//       throw new Error(`Price must be > 0 for ${slab.productType}`);
//     }
//   }

//   return prisma.$transaction(async (tx) => {
//     // 🔥 Ensure only ONE default tariff exists
//     if (data.isDefault) {
//       await tx.tariff.updateMany({
//         where: { isDefault: true },
//         data: { isDefault: false }
//       });
//     }

//     const tariff = await tx.tariff.create({
//       data: {
//         name: data.name,
//         description: data.description || null,
//         effectiveFrom: new Date(data.effectiveFrom),
//         isDefault: data.isDefault ?? false,
//         createdBy: superAdminId
//       }
//     });

//     const slabsData = data.slabs.map((slab) => ({
//       tariffId: tariff.id,
//       productType: slab.productType,
//       fromQty: slab.fromQty,
//       toQty: slab.toQty ?? null,
//       pricePerUnit: slab.pricePerUnit
//     }));

//     await tx.tariffSlab.createMany({
//       data: slabsData
//     });

//     return tariff;
//   });
// };
const getStartOfDayUTC = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
};

/**
 * Helper: Get start of month in UTC (for retroactive default tariffs)
 */
const getStartOfMonthUTC = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
};

const createTariff = async (data, superAdminId) => {
  if (!data.name || !data.slabs || !data.effectiveFrom) {
    throw new Error("Name, effectiveFrom, and slabs are required");
  }

  if (!Array.isArray(data.slabs) || data.slabs.length === 0) {
    throw new Error("At least one slab is required");
  }

  // Validate slabs (REUSABLE=pricePerUnit, NON_REUSABLE=percentage)
  for (let slab of data.slabs) {
    if (slab.fromQty < 0 || (slab.toQty && slab.toQty < slab.fromQty)) {
      throw new Error(`Invalid quantity range for ${slab.productType}`);
    }
    if (slab.productType === 'REUSABLE') {
      if (!slab.pricePerUnit || slab.pricePerUnit <= 0) {
        throw new Error(`pricePerUnit must be > 0 for REUSABLE`);
      }
      if (slab.percentage) {
        throw new Error(`percentage not allowed for REUSABLE`);
      }
    } else if (slab.productType === 'NON_REUSABLE') {
      if (!slab.percentage || slab.percentage <= 0) {
        throw new Error(`percentage must be > 0 for NON_REUSABLE`);
      }
      if (slab.pricePerUnit) {
        throw new Error(`pricePerUnit not allowed for NON_REUSABLE`);
      }
    } else {
      throw new Error(`Invalid productType: ${slab.productType}`);
    }
  }

  return prisma.$transaction(async (tx) => {
    // Deactivate old default tariffs
    if (data.isDefault) {
      await tx.tariff.updateMany({
        where: { isDefault: true, isActive: true },
        data: { isDefault: false }
      });
    }

    // Create tariff
    const tariff = await tx.tariff.create({
      data: {
        name: data.name,
        description: data.description,
        effectiveFrom: new Date(data.effectiveFrom),
        createdBy: superAdminId,
        isDefault: data.isDefault || false,
      },
    });

    // Create slabs
    const slabsData = data.slabs.map((slab) => ({
      tariffId: tariff.id,
      productType: slab.productType,
      fromQty: slab.fromQty,
      toQty: slab.toQty ?? null,
      pricePerUnit: slab.pricePerUnit ?? null,
      percentage: slab.percentage ?? null,
    }));
    await tx.tariffSlab.createMany({ data: slabsData });

    // 🔥 FIXED: Default tariff auto-assignment se start-of-DAY/MONTH
    if (data.isDefault) {
      const companiesWithoutCustomTariff = await tx.tenant.findMany({
        where: {
          companyTariffs: { none: { isActive: true } },
        },
      });

      // ✅ START OF DAY (recommended for most cases)
      const effectiveFrom = getStartOfDayUTC();
      
      // ✅ OR START OF MONTH (if you want retroactive for whole month testing)
      // const effectiveFrom = getStartOfMonthUTC();

      const companyTariffData = companiesWithoutCustomTariff.map((company) => ({
        companyId: company.id,
        tariffId: tariff.id,
        assignedBy: superAdminId,
        isActive: true,
        effectiveFrom: effectiveFrom,  // ← FIXED: No more new Date() timestamp hell
      }));

      if (companyTariffData.length > 0) {
        await tx.companyTariff.createMany({ data: companyTariffData });
      }
    }

    return tariff;
  });
};

/**
 * GET ALL TARIFFS
 */
const getAllTariffs = async () => {
  return prisma.tariff.findMany({
    include: {
      slabs: { orderBy: { fromQty: "asc" } }
    },
    orderBy: { createdAt: "desc" }
  });
};

/**
 * GET TARIFF BY ID
 */
const getTariffById = async (id) => {
  return prisma.tariff.findUnique({
    where: { id },
    include: {
      slabs: { orderBy: { fromQty: "asc" } }
    }
  });
};

/**
 * UPDATE TARIFF (VERSIONED)
 */
const updateTariff = async (id, data, superAdminId) => {
  if (!data.name || !data.slabs || !data.effectiveFrom) {
    throw new Error("Name, effectiveFrom, and slabs are required");
  }

  // Slab validation (same as create)
  for (let slab of data.slabs) {
    if (slab.fromQty < 0 || (slab.toQty && slab.toQty < slab.fromQty)) {
      throw new Error(`Invalid quantity range for ${slab.productType}`);
    }
    if (slab.productType === 'REUSABLE') {
      if (!slab.pricePerUnit || slab.pricePerUnit <= 0) {
        throw new Error(`pricePerUnit must be > 0 for REUSABLE`);
      }
    } else if (slab.productType === 'NON_REUSABLE') {
      if (!slab.percentage || slab.percentage <= 0) {
        throw new Error(`percentage must be > 0 for NON_REUSABLE`);
      }
    }
  }

  return prisma.$transaction(async (tx) => {
    const oldTariff = await tx.tariff.findUnique({ where: { id } });
    if (!oldTariff) throw new Error("Tariff not found");

    // Deactivate old version
    await tx.tariff.update({
      where: { id },
      data: { isActive: false, isDefault: false, effectiveTo: new Date() }
    });

    if (data.isDefault) {
      await tx.tariff.updateMany({
        where: { isDefault: true },
        data: { isDefault: false }
      });
    }

    // Create new version
    const newTariff = await tx.tariff.create({
      data: {
        name: data.name,
        description: data.description || null,
        effectiveFrom: new Date(data.effectiveFrom),
        isDefault: data.isDefault ?? false,
        createdBy: superAdminId
      }
    });

    const slabsData = data.slabs.map((slab) => ({
      tariffId: newTariff.id,
      productType: slab.productType,
      fromQty: slab.fromQty,
      toQty: slab.toQty ?? null,
      pricePerUnit: slab.pricePerUnit ?? null,
      percentage: slab.percentage ?? null,
    }));
    await tx.tariffSlab.createMany({ data: slabsData });

    return newTariff;
  });
};

/**
 * DEACTIVATE TARIFF
 */
const deactivateTariff = async (id) => {
  const tariff = await prisma.tariff.findUnique({ where: { id } });
  if (!tariff) throw new Error("Tariff not found");
  if (tariff.isDefault) throw new Error("Default tariff cannot be deactivated");

  return prisma.tariff.update({
    where: { id },
    data: { isActive: false, effectiveTo: new Date() }
  });
};

/**
 * GET DEFAULT TARIFF (INTERNAL USE)
 */
const getDefaultTariff = async () => {
  return prisma.tariff.findFirst({
    where: { isDefault: true, isActive: true },
    include: { slabs: { orderBy: { fromQty: "asc" } } }
  });
};

module.exports = {
  createTariff,
  getAllTariffs,
  getTariffById,
  updateTariff,
  deactivateTariff,
  getDefaultTariff
};