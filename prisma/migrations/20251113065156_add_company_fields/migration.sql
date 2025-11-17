/*
  Warnings:

  - You are about to drop the column `isActive` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `maxShops` on the `tenants` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[email]` on the table `tenants` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "isActive",
DROP COLUMN "maxShops",
ADD COLUMN     "address" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "logo" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "address" TEXT,
ADD COLUMN     "logo" TEXT,
ADD COLUMN     "otp" TEXT,
ADD COLUMN     "phone" TEXT,
ALTER COLUMN "password" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_email_key" ON "tenants"("email");
