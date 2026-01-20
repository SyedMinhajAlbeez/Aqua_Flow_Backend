-- AlterTable
ALTER TABLE "CompanyTariff" ADD COLUMN     "assignedBy" TEXT,
ADD COLUMN     "effectiveFrom" TIMESTAMP(3),
ADD COLUMN     "isDefaultApplied" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "CompanyTariff_companyId_idx" ON "CompanyTariff"("companyId");

-- CreateIndex
CREATE INDEX "CompanyTariff_tariffId_idx" ON "CompanyTariff"("tariffId");
