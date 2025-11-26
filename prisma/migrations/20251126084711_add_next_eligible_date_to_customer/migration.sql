-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'assigned';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "nextEligibleDate" TIMESTAMP(3);
