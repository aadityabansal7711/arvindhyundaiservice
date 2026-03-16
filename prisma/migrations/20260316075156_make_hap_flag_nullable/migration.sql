-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "supabaseAuthId" TEXT,
    "roleId" TEXT NOT NULL,
    "branchId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "registrationNo" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairOrder" (
    "id" TEXT NOT NULL,
    "roNo" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "branchId" TEXT,
    "vehicleInDate" TIMESTAMP(3) NOT NULL,
    "vehicleOutDate" TIMESTAMP(3),
    "currentStatus" TEXT NOT NULL,
    "advisorId" TEXT,
    "serviceAdvisorName" TEXT,
    "denterId" TEXT,
    "painterId" TEXT,
    "committedDeliveryDate" TIMESTAMP(3),
    "photos" JSONB,
    "workStartDate" TIMESTAMP(3),
    "tentativeCompletionDate" TIMESTAMP(3),
    "panelsNewReplace" INTEGER,
    "panelsDent" INTEGER,

    CONSTRAINT "RepairOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceClaim" (
    "id" TEXT NOT NULL,
    "roId" TEXT NOT NULL,
    "insuranceCompany" TEXT NOT NULL,
    "policyNo" TEXT,
    "claimNo" TEXT,
    "hapFlag" BOOLEAN,
    "claimIntimationDate" TIMESTAMP(3),

    CONSTRAINT "InsuranceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "roId" TEXT NOT NULL,
    "surveyorName" TEXT,
    "surveyDate" TIMESTAMP(3),
    "approvalDate" TIMESTAMP(3),

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Billing" (
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

    CONSTRAINT "Billing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartsOrder" (
    "id" TEXT NOT NULL,
    "roId" TEXT NOT NULL,
    "mrsNo" TEXT,
    "mrsDate" TIMESTAMP(3),
    "orderNo" TEXT,
    "orderDate" TIMESTAMP(3),
    "etaDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3),
    "storeRemark" TEXT,
    "backorderFlag" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PartsOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkNote" (
    "id" TEXT NOT NULL,
    "roId" TEXT NOT NULL,
    "noteText" TEXT NOT NULL,
    "noteDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "WorkNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowsImported" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_supabaseAuthId_key" ON "User"("supabaseAuthId");

-- CreateIndex
CREATE INDEX "User_active_idx" ON "User"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_registrationNo_key" ON "Vehicle"("registrationNo");

-- CreateIndex
CREATE UNIQUE INDEX "RepairOrder_roNo_key" ON "RepairOrder"("roNo");

-- CreateIndex
CREATE INDEX "RepairOrder_currentStatus_idx" ON "RepairOrder"("currentStatus");

-- CreateIndex
CREATE INDEX "RepairOrder_vehicleInDate_idx" ON "RepairOrder"("vehicleInDate");

-- CreateIndex
CREATE INDEX "RepairOrder_vehicleOutDate_idx" ON "RepairOrder"("vehicleOutDate");

-- CreateIndex
CREATE INDEX "RepairOrder_vehicleOutDate_vehicleInDate_idx" ON "RepairOrder"("vehicleOutDate", "vehicleInDate");

-- CreateIndex
CREATE INDEX "RepairOrder_branchId_idx" ON "RepairOrder"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceClaim_roId_key" ON "InsuranceClaim"("roId");

-- CreateIndex
CREATE UNIQUE INDEX "Survey_roId_key" ON "Survey"("roId");

-- CreateIndex
CREATE UNIQUE INDEX "Billing_roId_key" ON "Billing"("roId");

-- CreateIndex
CREATE INDEX "Billing_difference_idx" ON "Billing"("difference");

-- CreateIndex
CREATE INDEX "PartsOrder_roId_idx" ON "PartsOrder"("roId");

-- CreateIndex
CREATE INDEX "WorkNote_roId_idx" ON "WorkNote"("roId");

-- CreateIndex
CREATE INDEX "WorkNote_noteDate_idx" ON "WorkNote"("noteDate");

-- CreateIndex
CREATE INDEX "DropdownOption_groupKey_idx" ON "DropdownOption"("groupKey");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_denterId_fkey" FOREIGN KEY ("denterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_painterId_fkey" FOREIGN KEY ("painterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_roId_fkey" FOREIGN KEY ("roId") REFERENCES "RepairOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_roId_fkey" FOREIGN KEY ("roId") REFERENCES "RepairOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Billing" ADD CONSTRAINT "Billing_roId_fkey" FOREIGN KEY ("roId") REFERENCES "RepairOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartsOrder" ADD CONSTRAINT "PartsOrder_roId_fkey" FOREIGN KEY ("roId") REFERENCES "RepairOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkNote" ADD CONSTRAINT "WorkNote_roId_fkey" FOREIGN KEY ("roId") REFERENCES "RepairOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkNote" ADD CONSTRAINT "WorkNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRun" ADD CONSTRAINT "ImportRun_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
