-- Daily run-through videos: each affiliate gets three planned videos per
-- Nairobi day, rendered ahead of time and stored, each with its own look.
-- Adds columns and indexes to RunThroughVideo only.
-- AlterTable
ALTER TABLE "RunThroughVideo" ADD COLUMN     "day" TEXT,
ADD COLUMN     "downloadedAt" TIMESTAMP(3),
ADD COLUMN     "renderStartedAt" TIMESTAMP(3),
ADD COLUMN     "seed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "slot" INTEGER,
ADD COLUMN     "storageObjectKey" TEXT;

-- CreateIndex
CREATE INDEX "RunThroughVideo_status_day_idx" ON "RunThroughVideo"("status", "day");

-- CreateIndex
CREATE UNIQUE INDEX "RunThroughVideo_affiliateId_day_slot_key" ON "RunThroughVideo"("affiliateId", "day", "slot");

