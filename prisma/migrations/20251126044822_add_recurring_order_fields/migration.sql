-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'scheduled';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "nextDeliveryDate" TIMESTAMP(3),
ADD COLUMN     "recurring" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "orders_recurring_idx" ON "orders"("recurring");

-- CreateIndex
CREATE INDEX "orders_nextDeliveryDate_idx" ON "orders"("nextDeliveryDate");
