-- Drop the legacy Prisma RO stack. The app now uses Supabase bodyshop_jobs and
-- bodyshop_job_stages as the operational source of truth.
DROP TABLE IF EXISTS "WorkNote" CASCADE;
DROP TABLE IF EXISTS "PartsOrder" CASCADE;
DROP TABLE IF EXISTS "Billing" CASCADE;
DROP TABLE IF EXISTS "Survey" CASCADE;
DROP TABLE IF EXISTS "InsuranceClaim" CASCADE;
DROP TABLE IF EXISTS "RepairOrder" CASCADE;
DROP TABLE IF EXISTS "Vehicle" CASCADE;
DROP TABLE IF EXISTS "Customer" CASCADE;
DROP TABLE IF EXISTS "ImportRun" CASCADE;
DROP TABLE IF EXISTS "AuditLog" CASCADE;
