/*
  Warnings:

  - A unique constraint covering the columns `[email,tenantId]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `password` to the `Customer` table without a default value. This is not possible if the table is not empty.
  - Made the column `email` on table `Customer` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "password" TEXT NOT NULL,
ALTER COLUMN "email" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_tenantId_key" ON "Customer"("email", "tenantId");
