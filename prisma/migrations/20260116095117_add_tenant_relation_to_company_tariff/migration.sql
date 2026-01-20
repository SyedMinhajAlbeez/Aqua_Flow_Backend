-- AddForeignKey
ALTER TABLE "CompanyTariff" ADD CONSTRAINT "CompanyTariff_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
