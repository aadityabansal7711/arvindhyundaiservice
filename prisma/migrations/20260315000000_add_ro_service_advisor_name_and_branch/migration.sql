-- AlterTable
ALTER TABLE "RepairOrder" ADD COLUMN "branchId" TEXT,
ADD COLUMN "serviceAdvisorName" TEXT;

-- CreateIndex
CREATE INDEX "RepairOrder_branchId_idx" ON "RepairOrder"("branchId");

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
