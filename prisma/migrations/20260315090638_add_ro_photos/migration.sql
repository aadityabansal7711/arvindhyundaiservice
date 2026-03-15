/*
  Warnings:

  - You are about to drop the `NdcEntry` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WhatsAppUpdate` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "WhatsAppUpdate" DROP CONSTRAINT "WhatsAppUpdate_createdById_fkey";

-- DropForeignKey
ALTER TABLE "WhatsAppUpdate" DROP CONSTRAINT "WhatsAppUpdate_roId_fkey";

-- AlterTable
ALTER TABLE "Billing" ALTER COLUMN "billAmount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "actualLabour" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "doAmount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "customerAmount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "difference" SET DATA TYPE DOUBLE PRECISION;

-- DropTable
DROP TABLE "NdcEntry";

-- DropTable
DROP TABLE "WhatsAppUpdate";

-- CreateTable
CREATE TABLE "DropdownOption" (
    "id" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DropdownOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DropdownOption_groupKey_idx" ON "DropdownOption"("groupKey");

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_denterId_fkey" FOREIGN KEY ("denterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_painterId_fkey" FOREIGN KEY ("painterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
