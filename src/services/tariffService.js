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


const createTariff = async (data, superAdminId) => {
  // Basic validations
  if (!data.name || !data.slabs || !data.effectiveFrom) {
    throw new Error("Name, effectiveFrom, and slabs are required");
  }

  // Validate slabs
  for (let slab of data.slabs) {
    if (slab.fromQty < 0 || (slab.toQty && slab.toQty < slab.fromQty)) {
      throw new Error(`Invalid slab for ${slab.productType}`);
    }
    if (slab.pricePerUnit <= 0) {
      throw new Error(`Price must be > 0 for ${slab.productType}`);
    }
  }

  return prisma.$transaction(async (tx) => {
    // If this tariff is default, deactivate old default
    if (data.isDefault) {
      await tx.tariff.updateMany({
        where: { isDefault: true, isActive: true },
        data: { isDefault: false }
      });
    }

    // Create the new tariff
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
      ...slab,
      tariffId: tariff.id,
    }));
    await tx.tariffSlab.createMany({ data: slabsData });

    // If default, assign to all companies without custom tariff
    if (data.isDefault) {
      const companiesWithoutCustomTariff = await tx.tenant.findMany({
        where: {
          NOT: {
            subscriptions: { some: {} } // optional filter for companies with assigned tariffs
          },
        },
      });

      const companyTariffData = companiesWithoutCustomTariff.map((company) => ({
        companyId: company.id,
        tariffId: tariff.id,
        assignedBy: superAdminId,
        // isDefaultApplied: true,
        effectiveFrom: new Date(),
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

  return prisma.$transaction(async (tx) => {
    const oldTariff = await tx.tariff.findUnique({ where: { id } });

    if (!oldTariff) {
      throw new Error("Tariff not found");
    }

    // 🔒 Deactivate old tariff
    await tx.tariff.update({
      where: { id },
      data: {
        isActive: false,
        isDefault: false,
        effectiveTo: new Date()
      }
    });

    // 🔥 Handle default logic
    if (data.isDefault) {
      await tx.tariff.updateMany({
        where: { isDefault: true },
        data: { isDefault: false }
      });
    }

    // ✅ Create new version
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
      pricePerUnit: slab.pricePerUnit
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

  if (!tariff) {
    throw new Error("Tariff not found");
  }

  if (tariff.isDefault) {
    throw new Error("Default tariff cannot be deactivated");
  }

  return prisma.tariff.update({
    where: { id },
    data: {
      isActive: false,
      effectiveTo: new Date()
    }
  });
};

/**
 * GET DEFAULT TARIFF (INTERNAL USE)
 */
const getDefaultTariff = async () => {
  return prisma.tariff.findFirst({
    where: {
      isDefault: true,
      isActive: true
    },
    include: {
      slabs: { orderBy: { fromQty: "asc" } }
    }
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