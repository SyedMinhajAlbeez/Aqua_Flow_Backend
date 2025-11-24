/*
  Warnings:

  - You are about to drop the column `depositRemaining` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `totalDepositCollected` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `totalDepositRefunded` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `totalReturnableBottles` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `totalReusableOrdered` on the `customers` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "customers" DROP COLUMN "depositRemaining",
DROP COLUMN "totalDepositCollected",
DROP COLUMN "totalDepositRefunded",
DROP COLUMN "totalReturnableBottles",
DROP COLUMN "totalReusableOrdered";
