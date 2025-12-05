/*
  Warnings:

  - You are about to drop the column `nextEligibleDate` on the `customers` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "OrderRecurrence" AS ENUM ('NONE', 'WEEKLY', 'BI_WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "customers" DROP COLUMN "nextEligibleDate";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nextRecurringDate" TIMESTAMP(3),
ADD COLUMN     "notificationSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurrence" "OrderRecurrence" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "subscriptionId" TEXT;

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "recurrence" "OrderRecurrence" NOT NULL DEFAULT 'WEEKLY',
    "deliveryDayOfWeek" INTEGER NOT NULL,
    "nextDeliveryDate" TIMESTAMP(3) NOT NULL,
    "lastDeliveredDate" TIMESTAMP(3),
    "preferredTime" TEXT,
    "notificationTime" INTEGER NOT NULL DEFAULT 21,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "totalDeliveries" INTEGER NOT NULL DEFAULT 0,
    "missedDeliveries" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscriptions_customerId_idx" ON "subscriptions"("customerId");

-- CreateIndex
CREATE INDEX "subscriptions_tenantId_idx" ON "subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_nextDeliveryDate_idx" ON "subscriptions"("nextDeliveryDate");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_customerId_productId_recurrence_deliveryDayOf_key" ON "subscriptions"("customerId", "productId", "recurrence", "deliveryDayOfWeek");

-- CreateIndex
CREATE INDEX "orders_subscriptionId_idx" ON "orders"("subscriptionId");

-- CreateIndex
CREATE INDEX "orders_isRecurring_idx" ON "orders"("isRecurring");

-- CreateIndex
CREATE INDEX "orders_nextRecurringDate_idx" ON "orders"("nextRecurringDate");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
