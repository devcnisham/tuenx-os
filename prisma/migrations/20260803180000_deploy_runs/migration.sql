
-- CreateTable
CREATE TABLE "DeployRun" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "workflowName" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "title" TEXT,
    "actor" TEXT,
    "status" TEXT NOT NULL,
    "conclusion" TEXT,
    "url" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeployRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeployRun_productId_idx" ON "DeployRun"("productId");

-- CreateIndex
CREATE INDEX "DeployRun_branch_idx" ON "DeployRun"("branch");

-- CreateIndex
CREATE INDEX "DeployRun_startedAt_idx" ON "DeployRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeployRun_productId_externalId_key" ON "DeployRun"("productId", "externalId");

-- AddForeignKey
ALTER TABLE "DeployRun" ADD CONSTRAINT "DeployRun_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

