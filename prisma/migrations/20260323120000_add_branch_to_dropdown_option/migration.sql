ALTER TABLE "DropdownOption"
ADD COLUMN IF NOT EXISTS "branchId" TEXT;

CREATE INDEX IF NOT EXISTS "DropdownOption_branchId_idx" ON "DropdownOption"("branchId");
CREATE INDEX IF NOT EXISTS "DropdownOption_groupKey_branchId_idx" ON "DropdownOption"("groupKey", "branchId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'DropdownOption_branchId_fkey'
  ) THEN
    ALTER TABLE "DropdownOption"
    ADD CONSTRAINT "DropdownOption_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
