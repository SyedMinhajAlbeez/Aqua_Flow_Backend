/*
  Warnings:

  - The values [scheduled] on the enum `OrderStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `nextDeliveryDate` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `recurring` on the `orders` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('pending', 'confirmed', 'in_progress', 'out_for_delivery', 'delivered', 'completed', 'cancelled', 'failed');
ALTER TABLE "public"."orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'pending';
COMMIT;

-- DropIndex
DROP INDEX "orders_nextDeliveryDate_idx";

-- DropIndex
DROP INDEX "orders_recurring_idx";

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "nextDeliveryDate",
DROP COLUMN "recurring",
ADD COLUMN     "scheduledDate" TIMESTAMP(3);
