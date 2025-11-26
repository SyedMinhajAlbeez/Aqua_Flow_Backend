/*
  Warnings:

  - You are about to drop the column `lastSync` on the `drivers` table. All the data in the column will be lost.
  - You are about to drop the column `mode` on the `drivers` table. All the data in the column will be lost.
  - You are about to drop the column `onTimePercentage` on the `drivers` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "drivers" DROP COLUMN "lastSync",
DROP COLUMN "mode",
DROP COLUMN "onTimePercentage";
