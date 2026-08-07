
-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplateStep" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "ownerHint" TEXT,
    "dueOffsetDays" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChecklistTemplateStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistRun" (
    "id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "templateId" TEXT,
    "memberId" TEXT,
    "personName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistRunItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "ownerId" TEXT,
    "dueDate" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "ChecklistRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTemplate_tag_key" ON "ChecklistTemplate"("tag");

-- CreateIndex
CREATE INDEX "ChecklistTemplate_kind_idx" ON "ChecklistTemplate"("kind");

-- CreateIndex
CREATE INDEX "ChecklistTemplate_division_idx" ON "ChecklistTemplate"("division");

-- CreateIndex
CREATE INDEX "ChecklistTemplateStep_templateId_idx" ON "ChecklistTemplateStep"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistRun_tag_key" ON "ChecklistRun"("tag");

-- CreateIndex
CREATE INDEX "ChecklistRun_kind_idx" ON "ChecklistRun"("kind");

-- CreateIndex
CREATE INDEX "ChecklistRun_division_idx" ON "ChecklistRun"("division");

-- CreateIndex
CREATE INDEX "ChecklistRun_memberId_idx" ON "ChecklistRun"("memberId");

-- CreateIndex
CREATE INDEX "ChecklistRunItem_runId_idx" ON "ChecklistRunItem"("runId");

-- CreateIndex
CREATE INDEX "ChecklistRunItem_ownerId_idx" ON "ChecklistRunItem"("ownerId");

-- CreateIndex
CREATE INDEX "ChecklistRunItem_dueDate_idx" ON "ChecklistRunItem"("dueDate");

-- AddForeignKey
ALTER TABLE "ChecklistTemplateStep" ADD CONSTRAINT "ChecklistTemplateStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistRun" ADD CONSTRAINT "ChecklistRun_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistRun" ADD CONSTRAINT "ChecklistRun_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistRunItem" ADD CONSTRAINT "ChecklistRunItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ChecklistRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistRunItem" ADD CONSTRAINT "ChecklistRunItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

