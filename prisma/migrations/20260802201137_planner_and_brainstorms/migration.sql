-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tag" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "division" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "author" TEXT,
    "votes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PlanItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tag" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "effort" TEXT NOT NULL,
    "owner" TEXT,
    "notes" TEXT,
    "objectiveId" TEXT,
    "productId" TEXT,
    "ideaId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanItem_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlanItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlanItem_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Idea_tag_key" ON "Idea"("tag");

-- CreateIndex
CREATE INDEX "Idea_division_idx" ON "Idea"("division");

-- CreateIndex
CREATE INDEX "Idea_status_idx" ON "Idea"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PlanItem_tag_key" ON "PlanItem"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "PlanItem_ideaId_key" ON "PlanItem"("ideaId");

-- CreateIndex
CREATE INDEX "PlanItem_division_idx" ON "PlanItem"("division");

-- CreateIndex
CREATE INDEX "PlanItem_period_idx" ON "PlanItem"("period");

-- CreateIndex
CREATE INDEX "PlanItem_status_idx" ON "PlanItem"("status");
