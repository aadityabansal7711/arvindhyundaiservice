/*
  Warnings:

  - A unique constraint covering the columns `[supabaseAuthId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "RepairOrder" ADD COLUMN     "panelsDent" INTEGER,
ADD COLUMN     "panelsNewReplace" INTEGER,
ADD COLUMN     "tentativeCompletionDate" TIMESTAMP(3),
ADD COLUMN     "workStartDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "supabaseAuthId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_supabaseAuthId_key" ON "User"("supabaseAuthId");
