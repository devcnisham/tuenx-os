
-- CreateTable
CREATE TABLE "ComplianceItem" (
    "id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "authority" TEXT,
    "ownerId" TEXT,
    "recurrence" TEXT NOT NULL,
    "nextDueDate" TIMESTAMP(3) NOT NULL,
    "lastDoneAt" TIMESTAMP(3),
    "retired" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceItem_tag_key" ON "ComplianceItem"("tag");

-- CreateIndex
CREATE INDEX "ComplianceItem_division_idx" ON "ComplianceItem"("division");

-- CreateIndex
CREATE INDEX "ComplianceItem_nextDueDate_idx" ON "ComplianceItem"("nextDueDate");

-- CreateIndex
CREATE INDEX "ComplianceItem_ownerId_idx" ON "ComplianceItem"("ownerId");

-- AddForeignKey
ALTER TABLE "ComplianceItem" ADD CONSTRAINT "ComplianceItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

