-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    PRIMARY KEY ("roleId", "permissionId"),
    CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "branchId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "registrationNo" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    CONSTRAINT "Vehicle_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RepairOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roNo" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "vehicleInDate" TIMESTAMP(3) NOT NULL,
    "vehicleOutDate" TIMESTAMP(3),
    "currentStatus" TEXT NOT NULL,
    "advisorId" TEXT,
    "denterId" TEXT,
    "painterId" TEXT,
    "committedDeliveryDate" TIMESTAMP(3),
    CONSTRAINT "RepairOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InsuranceClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roId" TEXT NOT NULL,
    "insuranceCompany" TEXT NOT NULL,
    "policyNo" TEXT,
    "claimNo" TEXT,
    "hapFlag" BOOLEAN NOT NULL DEFAULT false,
    "claimIntimationDate" TIMESTAMP(3),
    CONSTRAINT "InsuranceClaim_roId_fkey" FOREIGN KEY ("roId") REFERENCES "RepairOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roId" TEXT NOT NULL,
    "surveyorName" TEXT,
    "surveyDate" TIMESTAMP(3),
    "approvalDate" TIMESTAMP(3),
    CONSTRAINT "Survey_roId_fkey" FOREIGN KEY ("roId") REFERENCES "RepairOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Billing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roId" TEXT NOT NULL,
    "doDate" TIMESTAMP(3),
    "billNo" TEXT,
    "billAmount" REAL NOT NULL DEFAULT 0,
    "actualLabour" REAL NOT NULL DEFAULT 0,
    "doAmount" REAL NOT NULL DEFAULT 0,
    "receivedRef" TEXT,
    "customerAmount" REAL NOT NULL DEFAULT 0,
    "difference" REAL NOT NULL DEFAULT 0,
    "remarks" TEXT,
    CONSTRAINT "Billing_roId_fkey" FOREIGN KEY ("roId") REFERENCES "RepairOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PartsOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roId" TEXT NOT NULL,
    "mrsNo" TEXT,
    "mrsDate" TIMESTAMP(3),
    "orderNo" TEXT,
    "orderDate" TIMESTAMP(3),
    "etaDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3),
    "storeRemark" TEXT,
    "backorderFlag" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "PartsOrder_roId_fkey" FOREIGN KEY ("roId") REFERENCES "RepairOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roId" TEXT NOT NULL,
    "noteText" TEXT NOT NULL,
    "noteDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "WorkNote_roId_fkey" FOREIGN KEY ("roId") REFERENCES "RepairOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WhatsAppUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roId" TEXT NOT NULL,
    "lastGroupUpdateDate" TIMESTAMP(3),
    "messageText" TEXT,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "WhatsAppUpdate_roId_fkey" FOREIGN KEY ("roId") REFERENCES "RepairOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WhatsAppUpdate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NdcEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TIMESTAMP(3) NOT NULL,
    "regNo" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "insuranceName" TEXT,
    "surveyorName" TEXT,
    "advisorName" TEXT,
    "ifIssue" TEXT,
    "remarks" TEXT,
    "sign" TEXT
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowsImported" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT,
    CONSTRAINT "ImportRun_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tableName" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_registrationNo_key" ON "Vehicle"("registrationNo");

-- CreateIndex
CREATE UNIQUE INDEX "RepairOrder_roNo_key" ON "RepairOrder"("roNo");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceClaim_roId_key" ON "InsuranceClaim"("roId");

-- CreateIndex
CREATE UNIQUE INDEX "Survey_roId_key" ON "Survey"("roId");

-- CreateIndex
CREATE UNIQUE INDEX "Billing_roId_key" ON "Billing"("roId");
