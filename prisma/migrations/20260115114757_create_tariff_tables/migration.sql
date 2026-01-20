-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'GENERATED', 'PAID');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('REUSABLE', 'NON_REUSABLE');

-- CreateTable
CREATE TABLE "CompanyTariff" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tariffId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CompanyTariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TariffSlab" (
    "id" TEXT NOT NULL,
    "tariffId" TEXT NOT NULL,
    "productType" "ProductType" NOT NULL,
    "fromQty" INTEGER NOT NULL,
    "toQty" INTEGER,
    "pricePerUnit" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TariffSlab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tariff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'GENERATED',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productType" "ProductType" NOT NULL,
    "fromQty" INTEGER NOT NULL,
    "toQty" INTEGER,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyTariff_companyId_isActive_key" ON "CompanyTariff"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "TariffSlab_tariffId_productType_idx" ON "TariffSlab"("tariffId", "productType");

-- CreateIndex
CREATE INDEX "Tariff_isActive_idx" ON "Tariff"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_periodStart_periodEnd_key" ON "Invoice"("companyId", "periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "CompanyTariff" ADD CONSTRAINT "CompanyTariff_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TariffSlab" ADD CONSTRAINT "TariffSlab_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
