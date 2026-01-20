/*
  Warnings:

  - You are about to drop the column `isDefaultApplied` on the `CompanyTariff` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "CompanyTariff_companyId_isActive_key";

-- DropIndex
DROP INDEX "CompanyTariff_tariffId_idx";

-- DropIndex
DROP INDEX "orders_orderNumberDisplay_key";

-- AlterTable
ALTER TABLE "CompanyTariff" DROP COLUMN "isDefaultApplied";

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "orderNumberDisplay" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "CompanyTariff_companyId_isActive_idx" ON "CompanyTariff"("companyId", "isActive");
