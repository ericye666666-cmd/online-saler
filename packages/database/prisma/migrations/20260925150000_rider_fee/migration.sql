-- The store picks this order's rider pay when it hands a delivery parcel to a
-- rider: KSh 50 or KSh 100, nothing else (the API enforces the two values).
-- The rider earns it only once the delivery is completed with the customer's
-- code; a weekly settlement sums completed deliveries per rider. Additive and
-- nullable: parcels handed over before this existed stay NULL ("not set").
ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "riderFeeKsh" INTEGER;
ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "riderFeeSetByEmployeeId" TEXT;
