-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('PAID', 'PARTIAL', 'UNPAID', 'OVERDUE', 'SUSPENDED');

-- DropIndex
DROP INDEX "Invoice_companyId_periodStart_periodEnd_key";

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "billingStatus" "BillingStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "dueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "paidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ALTER COLUMN "status" DROP NOT NULL,
ALTER COLUMN "status" DROP DEFAULT;

-- AlterTable
ALTER TABLE "InvoiceLineItem" ADD COLUMN     "baseAmount" DECIMAL(65,30),
ADD COLUMN     "percentage" DECIMAL(65,30),
ALTER COLUMN "unitPrice" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TariffSlab" ADD COLUMN     "percentage" DECIMAL(65,30),
ALTER COLUMN "pricePerUnit" DROP NOT NULL;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "invoiceId" TEXT;

-- CreateIndex
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
