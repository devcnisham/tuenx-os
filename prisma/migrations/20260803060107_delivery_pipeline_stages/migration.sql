-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tag" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "onHold" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Project_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("contactId", "createdAt", "dueDate", "id", "status", "tag", "title") SELECT "contactId", "createdAt", "dueDate", "id", "status", "tag", "title" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_tag_key" ON "Project"("tag");
CREATE INDEX "Project_contactId_idx" ON "Project"("contactId");
CREATE INDEX "Project_status_idx" ON "Project"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Existing rows onto the delivery pipeline from the founder's diagram.
-- `on_hold` was a status and is now a flag, so a held project keeps the stage
-- it stalled in — `build`, since that is the only stage the old four could
-- have meant by "active work that stopped".
UPDATE "Project" SET "status" = 'kickoff' WHERE "status" = 'planning';
UPDATE "Project" SET "status" = 'closed'  WHERE "status" = 'delivered';
UPDATE "Project" SET "onHold" = true, "status" = 'build' WHERE "status" = 'on_hold';
UPDATE "Project" SET "status" = 'build'   WHERE "status" = 'active';

-- No contact rows move: the new stages are additive, and every pre-existing
-- `closed` contact was closed *won*, which is what `closed` still means.
