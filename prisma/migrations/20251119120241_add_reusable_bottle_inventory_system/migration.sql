-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'completed';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "depositAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "isReusable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresEmptyReturn" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "bottle_inventories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "totalPurchased" INTEGER NOT NULL DEFAULT 0,
    "inStock" INTEGER NOT NULL DEFAULT 0,
    "withCustomers" INTEGER NOT NULL DEFAULT 0,
    "damaged" INTEGER NOT NULL DEFAULT 0,
    "leaked" INTEGER NOT NULL DEFAULT 0,
    "repairable" INTEGER NOT NULL DEFAULT 0,
    "lost" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bottle_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bottle_inventories_tenantId_key" ON "bottle_inventories"("tenantId");

-- AddForeignKey
ALTER TABLE "bottle_inventories" ADD CONSTRAINT "bottle_inventories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
