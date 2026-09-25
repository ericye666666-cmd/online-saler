-- A parcel may only be sent to its store once its routing label (the sticker
-- with the QR code the store scans in) has been printed. These columns record
-- the last successful print and who sent it. Additive and nullable: existing
-- rows stay NULL, which means "not printed yet", so a parcel already packed
-- simply needs its label printed before it can be sent.
ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "packageLabelPrintedAt" TIMESTAMP(3);
ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "packageLabelPrintedByEmployeeId" TEXT;
