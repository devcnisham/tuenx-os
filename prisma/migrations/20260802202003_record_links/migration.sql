-- CreateTable
CREATE TABLE "RecordLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromType" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toType" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "RecordLink_fromType_fromId_idx" ON "RecordLink"("fromType", "fromId");

-- CreateIndex
CREATE INDEX "RecordLink_toType_toId_idx" ON "RecordLink"("toType", "toId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordLink_fromType_fromId_toType_toId_key" ON "RecordLink"("fromType", "fromId", "toType", "toId");
