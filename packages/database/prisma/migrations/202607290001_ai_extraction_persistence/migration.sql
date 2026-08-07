-- Persist AI extraction execution metadata and field-level decisions.

CREATE TYPE "AIFieldDecisionSource" AS ENUM ('AI_PROPOSED', 'HUMAN_ACCEPTED', 'HUMAN_EDITED', 'HUMAN_ENTERED');

ALTER TABLE "AIExtraction"
  ADD COLUMN "promptVersion" TEXT,
  ADD COLUMN "requestJson" JSONB,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "latencyMs" INTEGER,
  ADD COLUMN "inputTokens" INTEGER,
  ADD COLUMN "outputTokens" INTEGER,
  ADD COLUMN "estimatedCostUsd" DECIMAL(10,6),
  ADD COLUMN "failureCode" TEXT,
  ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "AIFieldDecision" (
  "id" TEXT NOT NULL,
  "extractionId" TEXT NOT NULL,
  "fieldName" TEXT NOT NULL,
  "aiValueJson" JSONB,
  "finalValueJson" JSONB,
  "confidence" DECIMAL(4,3),
  "evidenceImageIds" JSONB,
  "source" "AIFieldDecisionSource" NOT NULL DEFAULT 'AI_PROPOSED',
  "requiresHumanConfirmation" BOOLEAN NOT NULL DEFAULT false,
  "reviewedByEmployeeId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AIFieldDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AIFieldDecision_extractionId_fieldName_key" ON "AIFieldDecision"("extractionId", "fieldName");
CREATE INDEX "AIFieldDecision_fieldName_source_idx" ON "AIFieldDecision"("fieldName", "source");
CREATE INDEX "AIFieldDecision_reviewedByEmployeeId_idx" ON "AIFieldDecision"("reviewedByEmployeeId");

ALTER TABLE "AIFieldDecision" ADD CONSTRAINT "AIFieldDecision_extractionId_fkey"
  FOREIGN KEY ("extractionId") REFERENCES "AIExtraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIFieldDecision" ADD CONSTRAINT "AIFieldDecision_reviewedByEmployeeId_fkey"
  FOREIGN KEY ("reviewedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
