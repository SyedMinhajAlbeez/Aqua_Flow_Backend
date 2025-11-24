/*
  Warnings:

  - You are about to drop the column `vehicleId` on the `drivers` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[vehicleNumber,tenantId]` on the table `drivers` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "drivers" DROP COLUMN "vehicleId",
ADD COLUMN     "totalRatings" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vehicleNumber" TEXT NOT NULL DEFAULT 'N/A',
ADD COLUMN     "vehicleType" TEXT NOT NULL DEFAULT 'bike',
ALTER COLUMN "rating" DROP DEFAULT;

-- CreateTable
CREATE TABLE "product_inventories" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "totalSold" INTEGER NOT NULL DEFAULT 0,
    "totalAdded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "product_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_inventories_productId_key" ON "product_inventories"("productId");

-- CreateIndex
CREATE INDEX "product_inventories_tenantId_idx" ON "product_inventories"("tenantId");

-- CreateIndex
CREATE INDEX "product_inventories_productId_idx" ON "product_inventories"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_inventories_productId_tenantId_key" ON "product_inventories"("productId", "tenantId");

-- CreateIndex
CREATE INDEX "drivers_vehicleNumber_idx" ON "drivers"("vehicleNumber");

-- CreateIndex
CREATE INDEX "drivers_status_idx" ON "drivers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_vehicleNumber_tenantId_key" ON "drivers"("vehicleNumber", "tenantId");

-- CreateIndex
CREATE INDEX "products_tenantId_isReusable_idx" ON "products"("tenantId", "isReusable");

-- AddForeignKey
ALTER TABLE "product_inventories" ADD CONSTRAINT "product_inventories_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_inventories" ADD CONSTRAINT "product_inventories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_inventories" ADD CONSTRAINT "product_inventories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
