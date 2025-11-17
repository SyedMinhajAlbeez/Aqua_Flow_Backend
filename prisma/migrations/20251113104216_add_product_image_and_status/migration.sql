-- AlterTable
ALTER TABLE "products" ADD COLUMN     "image" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
