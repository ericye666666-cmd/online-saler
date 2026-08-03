CREATE TABLE "ProductDetailTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "garmentType" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "svgSource" TEXT NOT NULL,
    "measurementFieldsJson" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductDetailTemplate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProductDetailAsset"
ADD COLUMN "templateCode" TEXT,
ADD COLUMN "storageKey" TEXT;

CREATE UNIQUE INDEX "ProductDetailTemplate_code_key" ON "ProductDetailTemplate"("code");
CREATE INDEX "ProductDetailTemplate_garmentType_isActive_idx" ON "ProductDetailTemplate"("garmentType", "isActive");
CREATE INDEX "ProductDetailTemplate_version_idx" ON "ProductDetailTemplate"("version");
CREATE INDEX "ProductDetailAsset_templateCode_templateVersion_idx" ON "ProductDetailAsset"("templateCode", "templateVersion");
