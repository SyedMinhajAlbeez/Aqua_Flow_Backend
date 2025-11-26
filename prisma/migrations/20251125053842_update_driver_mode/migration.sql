-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "lastSync" TIMESTAMP(3),
ADD COLUMN     "mode" TEXT DEFAULT 'Offline Mode',
ADD COLUMN     "onTimePercentage" DOUBLE PRECISION DEFAULT 0;
