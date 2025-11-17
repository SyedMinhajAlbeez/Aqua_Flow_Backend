/*
  Warnings:

  - You are about to drop the column `type` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `zone` on the `customers` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "customers" DROP COLUMN "type",
DROP COLUMN "zone",
ADD COLUMN     "zoneId" TEXT;

-- CreateIndex
CREATE INDEX "customers_zoneId_idx" ON "customers"("zoneId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
