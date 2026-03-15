-- =============================================================================
-- Arvind Hyundai Service – Data Management SQL (PostgreSQL)
-- Use this file for ad‑hoc queries, reports, and data maintenance.
-- Schema matches Prisma models; run against the same DB as the app (DATABASE_URL).
--
-- If you get "relation \"Billing\" does not exist" (or any table):
-- 1. Run this DIAGNOSTIC (section 0) first – it lists tables that actually exist.
-- 2. Apply migrations:  npx prisma migrate deploy   (or  npx prisma db push)
-- 3. Ensure your SQL client uses the same DATABASE_URL as the app (e.g. Supabase).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. DIAGNOSTIC – run this first to see which tables exist (and exact names)
-- -----------------------------------------------------------------------------
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND table_type = 'BASE TABLE'
ORDER BY table_schema, table_name;

-- -----------------------------------------------------------------------------
-- 1. SCHEMA REFERENCE (current state; tables created by migrations)
-- -----------------------------------------------------------------------------
-- Tables: Role, Permission, RolePermission, Branch, User, Customer, Vehicle,
--         RepairOrder, InsuranceClaim, Survey, Billing, PartsOrder, WorkNote,
--         ImportRun, AuditLog, DropdownOption

-- -----------------------------------------------------------------------------
-- 2. ROLES & PERMISSIONS
-- -----------------------------------------------------------------------------

-- List all roles with permission keys
SELECT r.id, r.name AS role_name,
       array_agg(p.key ORDER BY p.key) AS permissions
FROM "Role" r
LEFT JOIN "RolePermission" rp ON rp."roleId" = r.id
LEFT JOIN "Permission" p ON p.id = rp."permissionId"
GROUP BY r.id, r.name;

-- List all permissions and which roles have them
SELECT p.key, array_agg(r.name) AS roles
FROM "Permission" p
LEFT JOIN "RolePermission" rp ON rp."permissionId" = p.id
LEFT JOIN "Role" r ON r.id = rp."roleId"
GROUP BY p.id, p.key;

-- Add a permission to a role (replace IDs)
-- INSERT INTO "RolePermission" ("roleId", "permissionId") VALUES ('<role_cuid>', '<permission_cuid>');

-- Remove a permission from a role
-- DELETE FROM "RolePermission" WHERE "roleId" = '<role_cuid>' AND "permissionId" = '<permission_cuid>';


-- -----------------------------------------------------------------------------
-- 3. BRANCHES
-- -----------------------------------------------------------------------------

SELECT id, name, city FROM "Branch" ORDER BY name;


-- -----------------------------------------------------------------------------
-- 4. USERS
-- -----------------------------------------------------------------------------

-- Users with role and branch
SELECT u.id, u.name, u.email, u.phone, u.active, u."createdAt",
       r.name AS role_name, b.name AS branch_name
FROM "User" u
JOIN "Role" r ON r.id = u."roleId"
LEFT JOIN "Branch" b ON b.id = u."branchId"
ORDER BY u.name;

-- Active users only
SELECT id, name, email, "branchId", "roleId" FROM "User" WHERE active = true ORDER BY name;

-- Deactivate a user (replace id)
-- UPDATE "User" SET active = false, "updatedAt" = NOW() WHERE id = '<user_cuid>';


-- -----------------------------------------------------------------------------
-- 5. CUSTOMERS & VEHICLES
-- -----------------------------------------------------------------------------

-- Customers with vehicle count
SELECT c.id, c.name, c.mobile, COUNT(v.id) AS vehicle_count
FROM "Customer" c
LEFT JOIN "Vehicle" v ON v."customerId" = c.id
GROUP BY c.id, c.name, c.mobile
ORDER BY c.name;

-- Vehicles with customer
SELECT v.id, v."registrationNo", v.model, c.name AS customer_name, c.mobile
FROM "Vehicle" v
JOIN "Customer" c ON c.id = v."customerId"
ORDER BY v."registrationNo";

-- Find vehicle by registration
-- SELECT * FROM "Vehicle" v JOIN "Customer" c ON c.id = v."customerId" WHERE v."registrationNo" = 'DL01AB1234';


-- -----------------------------------------------------------------------------
-- 6. REPAIR ORDERS (RO)
-- -----------------------------------------------------------------------------

-- RO list with vehicle, customer, branch, status
SELECT ro.id, ro."roNo", ro."vehicleInDate", ro."vehicleOutDate", ro."currentStatus",
       ro."serviceAdvisorName", ro."committedDeliveryDate",
       v."registrationNo", v.model, c.name AS customer_name, c.mobile,
       b.name AS branch_name,
       adv.name AS advisor_user_name, d.name AS denter_name, p.name AS painter_name
FROM "RepairOrder" ro
JOIN "Vehicle" v ON v.id = ro."vehicleId"
JOIN "Customer" c ON c.id = v."customerId"
LEFT JOIN "Branch" b ON b.id = ro."branchId"
LEFT JOIN "User" adv ON adv.id = ro."advisorId"
LEFT JOIN "User" d ON d.id = ro."denterId"
LEFT JOIN "User" p ON p.id = ro."painterId"
ORDER BY ro."vehicleInDate" DESC;

-- RO count by status
SELECT "currentStatus", COUNT(*) AS cnt
FROM "RepairOrder"
GROUP BY "currentStatus"
ORDER BY cnt DESC;

-- RO count by branch
SELECT b.name AS branch_name, COUNT(ro.id) AS ro_count
FROM "Branch" b
LEFT JOIN "RepairOrder" ro ON ro."branchId" = b.id
GROUP BY b.id, b.name
ORDER BY ro_count DESC;

-- ROs in date range
-- SELECT ro."roNo", ro."vehicleInDate", ro."vehicleOutDate", ro."currentStatus", v."registrationNo"
-- FROM "RepairOrder" ro JOIN "Vehicle" v ON v.id = ro."vehicleId"
-- WHERE ro."vehicleInDate" >= '2025-01-01' AND ro."vehicleInDate" < '2025-02-01'
-- ORDER BY ro."vehicleInDate";


-- -----------------------------------------------------------------------------
-- 7. INSURANCE CLAIMS
-- -----------------------------------------------------------------------------

SELECT ic.id, ro."roNo", ic."insuranceCompany", ic."policyNo", ic."claimNo",
       ic."hapFlag", ic."claimIntimationDate"
FROM "InsuranceClaim" ic
JOIN "RepairOrder" ro ON ro.id = ic."roId"
ORDER BY ic."claimIntimationDate" DESC NULLS LAST;


-- -----------------------------------------------------------------------------
-- 8. SURVEY
-- -----------------------------------------------------------------------------

SELECT s.id, ro."roNo", s."surveyorName", s."surveyDate", s."approvalDate"
FROM "Survey" s
JOIN "RepairOrder" ro ON ro.id = s."roId"
ORDER BY s."surveyDate" DESC NULLS LAST;


-- -----------------------------------------------------------------------------
-- 9. BILLING (requires "Billing" table – run block below if missing)
-- -----------------------------------------------------------------------------
-- If you get "relation \"Billing\" does not exist", run the CREATE TABLE block
-- at the end of this file (section "CREATE Billing IF MISSING") once, then
-- uncomment the two SELECTs below.

-- Billing with RO and difference (outstanding)
-- SELECT b.id, ro."roNo", b."doDate", b."billNo", b."billAmount", b."doAmount",
--        b."customerAmount", b."difference", b."remarks"
-- FROM "Billing" b
-- JOIN "RepairOrder" ro ON ro.id = b."roId"
-- ORDER BY b."difference" DESC;

-- Outstanding (positive difference)
-- SELECT ro."roNo", b."billAmount", b."difference", b."remarks"
-- FROM "Billing" b
-- JOIN "RepairOrder" ro ON ro.id = b."roId"
-- WHERE b."difference" > 0
-- ORDER BY b."difference" DESC;


-- -----------------------------------------------------------------------------
-- 10. PARTS ORDERS
-- -----------------------------------------------------------------------------

SELECT po.id, ro."roNo", po."mrsNo", po."mrsDate", po."orderNo", po."orderDate",
       po."etaDate", po."receivedDate", po."backorderFlag", po."storeRemark"
FROM "PartsOrder" po
JOIN "RepairOrder" ro ON ro.id = po."roId"
ORDER BY po."mrsDate" DESC NULLS LAST;


-- -----------------------------------------------------------------------------
-- 11. WORK NOTES
-- -----------------------------------------------------------------------------

SELECT wn.id, ro."roNo", wn."noteText", wn."noteDate", u.name AS created_by
FROM "WorkNote" wn
JOIN "RepairOrder" ro ON ro.id = wn."roId"
JOIN "User" u ON u.id = wn."createdById"
ORDER BY wn."noteDate" DESC;


-- -----------------------------------------------------------------------------
-- 12. DROPDOWN OPTIONS (Data / config)
-- -----------------------------------------------------------------------------

SELECT id, "groupKey", label, value, "sortOrder"
FROM "DropdownOption"
ORDER BY "groupKey", "sortOrder", label;


-- -----------------------------------------------------------------------------
-- 13. IMPORT RUNS & AUDIT LOG
-- -----------------------------------------------------------------------------

SELECT id, "fileName", "startTime", "rowsImported", errors
FROM "ImportRun"
ORDER BY "startTime" DESC
LIMIT 50;

SELECT id, "tableName", "recordId", "timestamp", "changedById"
FROM "AuditLog"
ORDER BY "timestamp" DESC
LIMIT 100;


-- -----------------------------------------------------------------------------
-- 14. FULL RO DETAIL (single RO – replace ro_no)
-- -----------------------------------------------------------------------------
/*
WITH ro AS (
  SELECT * FROM "RepairOrder" WHERE "roNo" = 'RO-XXXX' LIMIT 1
)
SELECT
  (SELECT row_to_json(ro.*) FROM ro) AS repair_order,
  (SELECT row_to_json(v.*) FROM "Vehicle" v WHERE v.id = (SELECT "vehicleId" FROM ro)) AS vehicle,
  (SELECT row_to_json(c.*) FROM "Customer" c WHERE c.id = (SELECT "customerId" FROM "Vehicle" v WHERE v.id = (SELECT "vehicleId" FROM ro))) AS customer,
  (SELECT row_to_json(ic.*) FROM "InsuranceClaim" ic WHERE ic."roId" = (SELECT id FROM ro)) AS insurance_claim,
  (SELECT row_to_json(s.*) FROM "Survey" s WHERE s."roId" = (SELECT id FROM ro)) AS survey,
  (SELECT row_to_json(b.*) FROM "Billing" b WHERE b."roId" = (SELECT id FROM ro)) AS billing,
  (SELECT json_agg(row_to_json(po.*)) FROM "PartsOrder" po WHERE po."roId" = (SELECT id FROM ro)) AS parts_orders,
  (SELECT json_agg(row_to_json(wn.*)) FROM "WorkNote" wn WHERE wn."roId" = (SELECT id FROM ro)) AS work_notes;
*/


-- -----------------------------------------------------------------------------
-- 15. DATA INTEGRITY CHECKS
-- -----------------------------------------------------------------------------

-- ROs without vehicle (should be 0)
SELECT id, "roNo" FROM "RepairOrder" ro WHERE NOT EXISTS (SELECT 1 FROM "Vehicle" v WHERE v.id = ro."vehicleId");

-- Billing with invalid roId (should be 0) – uncomment when "Billing" exists
-- SELECT b.id FROM "Billing" b WHERE NOT EXISTS (SELECT 1 FROM "RepairOrder" ro WHERE ro.id = b."roId");

-- Users with invalid role (should be 0)
SELECT u.id, u.email FROM "User" u WHERE NOT EXISTS (SELECT 1 FROM "Role" r WHERE r.id = u."roleId");

-- Orphan work notes (RO deleted)
SELECT wn.id, wn."roId" FROM "WorkNote" wn WHERE NOT EXISTS (SELECT 1 FROM "RepairOrder" ro WHERE ro.id = wn."roId");


-- -----------------------------------------------------------------------------
-- 16. COUNTS (dashboard-style)
-- -----------------------------------------------------------------------------

-- Billing count only included when "Billing" table exists; use second version after table exists
SELECT
  (SELECT COUNT(*) FROM "Branch") AS branches,
  (SELECT COUNT(*) FROM "User" WHERE active = true) AS active_users,
  (SELECT COUNT(*) FROM "Customer") AS customers,
  (SELECT COUNT(*) FROM "Vehicle") AS vehicles,
  (SELECT COUNT(*) FROM "RepairOrder") AS repair_orders,
  (SELECT COUNT(*) FROM "RepairOrder" WHERE "vehicleOutDate" IS NULL) AS ro_open;
-- Uncomment when "Billing" exists:
--  , (SELECT COUNT(*) FROM "Billing" WHERE "difference" > 0) AS billing_outstanding;


-- =============================================================================
-- CREATE "Billing" TABLE IF MISSING (run this once if section 9 or 16 failed)
-- =============================================================================
-- Run this block if you get "relation \"Billing\" does not exist". Then uncomment
-- the Billing SELECTs in section 9, the Billing check in section 15, and the
-- billing_outstanding line in section 16.
/*
CREATE TABLE IF NOT EXISTS "Billing" (
    "id" TEXT NOT NULL,
    "roId" TEXT NOT NULL,
    "doDate" TIMESTAMP(3),
    "billNo" TEXT,
    "billAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualLabour" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "doAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivedRef" TEXT,
    "customerAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difference" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remarks" TEXT,
    CONSTRAINT "Billing_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Billing_roId_fkey" FOREIGN KEY ("roId") REFERENCES "RepairOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Billing_roId_key" ON "Billing"("roId");
CREATE INDEX IF NOT EXISTS "Billing_difference_idx" ON "Billing"("difference");
*/
