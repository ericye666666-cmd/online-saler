-- Packing becomes assigned work.
--
-- Picking already had an owner: a picker claims a task and nobody else can
-- touch it. Packing had none — anyone holding orders.pack could pack any parcel
-- on the floor, which is how two people end up bagging the same trolley and how
-- a finished parcel has no one answerable for what went into it.
--
-- Additive and nullable. Every existing parcel is simply unassigned, and the
-- service treats unassigned as "not yet handed out" rather than "free for all".
ALTER TABLE "OrderFulfillment"
  ADD COLUMN "assignedPackerEmployeeId" TEXT;

ALTER TABLE "OrderFulfillment"
  ADD CONSTRAINT "OrderFulfillment_assignedPackerEmployeeId_fkey"
  FOREIGN KEY ("assignedPackerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "OrderFulfillment_assignedPackerEmployeeId_idx" ON "OrderFulfillment"("assignedPackerEmployeeId");
