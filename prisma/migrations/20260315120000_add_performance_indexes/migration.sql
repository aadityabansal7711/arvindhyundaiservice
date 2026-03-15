-- Performance indexes for RepairOrder
CREATE INDEX IF NOT EXISTS "RepairOrder_currentStatus_idx" ON "RepairOrder"("currentStatus");
CREATE INDEX IF NOT EXISTS "RepairOrder_vehicleInDate_idx" ON "RepairOrder"("vehicleInDate");
CREATE INDEX IF NOT EXISTS "RepairOrder_vehicleOutDate_idx" ON "RepairOrder"("vehicleOutDate");
CREATE INDEX IF NOT EXISTS "RepairOrder_vehicleOutDate_vehicleInDate_idx" ON "RepairOrder"("vehicleOutDate", "vehicleInDate");

-- Performance indexes for Billing
CREATE INDEX IF NOT EXISTS "Billing_difference_idx" ON "Billing"("difference");

-- Performance indexes for WorkNote
CREATE INDEX IF NOT EXISTS "WorkNote_roId_idx" ON "WorkNote"("roId");
CREATE INDEX IF NOT EXISTS "WorkNote_noteDate_idx" ON "WorkNote"("noteDate");

-- Performance indexes for PartsOrder
CREATE INDEX IF NOT EXISTS "PartsOrder_roId_idx" ON "PartsOrder"("roId");

-- Performance indexes for User
CREATE INDEX IF NOT EXISTS "User_active_idx" ON "User"("active");
