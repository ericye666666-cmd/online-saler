-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('PAID', 'PICKING', 'PACKED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "FulfillmentExceptionReason" AS ENUM ('ITEM_NOT_FOUND', 'BARCODE_MISMATCH', 'ITEM_DAMAGED', 'CUSTOMER_CANCELLED', 'DELIVERY_FAILED', 'OTHER');

-- CreateTable
CREATE TABLE "OrderFulfillment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "FulfillmentStatus" NOT NULL DEFAULT 'PAID',
    "assignedPickerEmployeeId" TEXT,
    "packedByEmployeeId" TEXT,
    "pickupConfirmedByEmployeeId" TEXT,
    "deliveryRiderName" TEXT,
    "deliveryRiderPhone" TEXT,
    "exceptionReason" "FulfillmentExceptionReason",
    "exceptionNote" TEXT,
    "packingStatus" TEXT,
    "packingNote" TEXT,
    "pickedAt" TIMESTAMP(3),
    "packedAt" TIMESTAMP(3),
    "readyForPickupAt" TIMESTAMP(3),
    "outForDeliveryAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderFulfillment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfillmentEvent" (
    "id" TEXT NOT NULL,
    "fulfillmentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actorEmployeeId" TEXT,
    "action" TEXT NOT NULL,
    "oldStatus" "FulfillmentStatus",
    "newStatus" "FulfillmentStatus" NOT NULL,
    "note" TEXT,
    "scannedBarcode" TEXT,
    "exceptionReason" "FulfillmentExceptionReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FulfillmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderFulfillment_orderId_key" ON "OrderFulfillment"("orderId");

-- CreateIndex
CREATE INDEX "OrderFulfillment_status_updatedAt_idx" ON "OrderFulfillment"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "OrderFulfillment_assignedPickerEmployeeId_idx" ON "OrderFulfillment"("assignedPickerEmployeeId");

-- CreateIndex
CREATE INDEX "OrderFulfillment_packedByEmployeeId_idx" ON "OrderFulfillment"("packedByEmployeeId");

-- CreateIndex
CREATE INDEX "FulfillmentEvent_fulfillmentId_createdAt_idx" ON "FulfillmentEvent"("fulfillmentId", "createdAt");

-- CreateIndex
CREATE INDEX "FulfillmentEvent_orderId_createdAt_idx" ON "FulfillmentEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "FulfillmentEvent_actorEmployeeId_createdAt_idx" ON "FulfillmentEvent"("actorEmployeeId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrderFulfillment" ADD CONSTRAINT "OrderFulfillment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFulfillment" ADD CONSTRAINT "OrderFulfillment_assignedPickerEmployeeId_fkey" FOREIGN KEY ("assignedPickerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFulfillment" ADD CONSTRAINT "OrderFulfillment_packedByEmployeeId_fkey" FOREIGN KEY ("packedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFulfillment" ADD CONSTRAINT "OrderFulfillment_pickupConfirmedByEmployeeId_fkey" FOREIGN KEY ("pickupConfirmedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentEvent" ADD CONSTRAINT "FulfillmentEvent_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "OrderFulfillment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentEvent" ADD CONSTRAINT "FulfillmentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentEvent" ADD CONSTRAINT "FulfillmentEvent_actorEmployeeId_fkey" FOREIGN KEY ("actorEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
