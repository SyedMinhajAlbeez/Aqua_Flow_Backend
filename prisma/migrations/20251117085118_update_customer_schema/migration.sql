/*
  Warnings:

  - You are about to drop the column `city` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `country` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `postalCode` on the `customers` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "customers" DROP COLUMN "city",
DROP COLUMN "country",
DROP COLUMN "postalCode",
ADD COLUMN     "bottlesGiven" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dueAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "empties" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastOrderDate" TIMESTAMP(3),
ADD COLUMN     "securityDeposit" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sleepingSince" TIMESTAMP(3),
ADD COLUMN     "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'individual',
ADD COLUMN     "zone" TEXT;

-- CreateIndex
CREATE INDEX "customers_lastOrderDate_idx" ON "customers"("lastOrderDate");
