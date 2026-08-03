-- Where a ticket came from, when it was not typed here.
--
-- `gh:1234` for GitHub issue 1234. The unique pair is what makes a re-sync
-- update the existing row instead of adding a second copy of the same issue;
-- NULL is exempt from a UNIQUE in SQLite, so hand-written tickets are
-- unaffected however many there are.
ALTER TABLE "Ticket" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "externalUrl" TEXT;

CREATE UNIQUE INDEX "Ticket_productId_externalId_key" ON "Ticket"("productId", "externalId");
