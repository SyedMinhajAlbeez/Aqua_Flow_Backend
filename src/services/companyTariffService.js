const prisma = require("../prisma/client");

/**
 * Auto-assign default tariff to a company (used on company creation)
 */
const autoAssignDefault = async (companyId, superAdminId) => {
  // Find the most recent active default tariff
  const defaultTariff = await prisma.tariff.findFirst({
    where: { isDefault: true, isActive: true },
    orderBy: { createdAt: "desc" },
  });

  if (!defaultTariff) {
    console.log("⚠️ No default tariff found. Skipping assignment.");
    return null;
  }

  // Check if company already has an active tariff assignment
  const existing = await prisma.companyTariff.findFirst({
    where: {
      companyId,
      isActive: true           // ← only active assignments matter
    },
  });

  if (existing) {
    console.log(`Company ${companyId} already has tariff ${existing.tariffId}`);
    return existing; // already assigned → skip creation
  }

  // Assign the default tariff
  return prisma.companyTariff.create({
    data: {
      companyId,
      tariffId: defaultTariff.id,
      assignedBy: superAdminId,
      // isDefaultApplied: true,
      effectiveFrom: new Date(),
      isActive: true
    },
  });
};

/**
 * Assign or override a tariff for a company (manual by super-admin)
 */
const assignTariff = async (companyId, tariffId, superAdminId) => {
  // Validate company exists
  const company = await prisma.tenant.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Company not found");

  // Validate tariff exists
  const tariff = await prisma.tariff.findUnique({ where: { id: tariffId } });
  if (!tariff) throw new Error("Tariff not found");

  return prisma.$transaction(async (tx) => {
    // Deactivate all previous active assignments
    await tx.companyTariff.updateMany({
      where: {
        companyId,
        isActive: true
      },
      data: {
        isActive: false
        // If you later add effectiveTo, you can set it here instead
      },
    });

    // Create the new assignment
    return tx.companyTariff.create({
      data: {
        companyId,
        tariffId,
        assignedBy: superAdminId,
        // isDefaultApplied: false, // manual override
        effectiveFrom: new Date(),
        isActive: true
      },
    });
  });
};

module.exports = {
  autoAssignDefault,
  assignTariff,
};