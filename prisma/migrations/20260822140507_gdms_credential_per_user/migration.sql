-- GDMS credentials move from one-per-branch (shared) to one-per-(user, branch)
-- (personal login). Existing branch-level rows are handed to the owner
-- account so it keeps working immediately; everyone else sets up their own
-- via the new self-service page.

-- AddColumn
ALTER TABLE "GdmsCredential" ADD COLUMN "userId" TEXT;

-- Backfill: existing credentials become the owner's personal credential.
UPDATE "GdmsCredential"
SET "userId" = (SELECT id FROM "User" WHERE email = 'mayank.arvind.bansal@gmail.com')
WHERE "userId" IS NULL;

-- Any row that still has no owner (owner account missing) can't satisfy the
-- upcoming NOT NULL/FK, so drop it rather than fail the migration.
DELETE FROM "GdmsCredential" WHERE "userId" IS NULL;

-- AlterColumn
ALTER TABLE "GdmsCredential" ALTER COLUMN "userId" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "GdmsCredential" DROP CONSTRAINT "GdmsCredential_updatedByUserId_fkey";

-- DropColumn
ALTER TABLE "GdmsCredential" DROP COLUMN "updatedByUserId";

-- DropIndex
DROP INDEX "GdmsCredential_branchId_key";

-- CreateIndex
CREATE INDEX "GdmsCredential_branchId_idx" ON "GdmsCredential"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "GdmsCredential_userId_branchId_key" ON "GdmsCredential"("userId", "branchId");

-- AddForeignKey
ALTER TABLE "GdmsCredential" ADD CONSTRAINT "GdmsCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
