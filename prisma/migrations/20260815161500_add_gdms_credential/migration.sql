-- CreateTable
CREATE TABLE "GdmsCredential" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "gdmsUserId" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "GdmsCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GdmsCredential_branchId_key" ON "GdmsCredential"("branchId");

-- AddForeignKey
ALTER TABLE "GdmsCredential" ADD CONSTRAINT "GdmsCredential_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GdmsCredential" ADD CONSTRAINT "GdmsCredential_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- EnableRLS
ALTER TABLE public."GdmsCredential" ENABLE ROW LEVEL SECURITY;
