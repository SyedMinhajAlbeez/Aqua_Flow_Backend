/*
  Warnings:

  - You are about to drop the column `password` on the `Customer` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[phone,tenantId]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Customer_email_idx";

-- DropIndex
DROP INDEX "Customer_email_key";

-- DropIndex
DROP INDEX "Customer_email_tenantId_key";

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "password",
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_tenantId_key" ON "Customer"("phone", "tenantId");
