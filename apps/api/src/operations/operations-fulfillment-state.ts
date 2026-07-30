import { FulfillmentMethod, FulfillmentStatus } from "@online-saler/database";

export type FulfillmentTransitionInput = {
  from: FulfillmentStatus;
  to: FulfillmentStatus;
  fulfillmentMethod?: FulfillmentMethod | null;
  pickedAt?: Date | string | null;
};

export function canTransitionFulfillment(input: FulfillmentTransitionInput): boolean {
  const { from, to, fulfillmentMethod, pickedAt } = input;
  if (from === FulfillmentStatus.COMPLETED) return false;
  if (to === FulfillmentStatus.EXCEPTION) return from !== FulfillmentStatus.EXCEPTION;

  if (from === FulfillmentStatus.PAID && to === FulfillmentStatus.PICKING) return true;
  if (from === FulfillmentStatus.PICKING && to === FulfillmentStatus.PACKED) return Boolean(pickedAt);
  if (from === FulfillmentStatus.PACKED && to === FulfillmentStatus.READY_FOR_PICKUP) {
    return fulfillmentMethod === FulfillmentMethod.PICKUP;
  }
  if (from === FulfillmentStatus.PACKED && to === FulfillmentStatus.OUT_FOR_DELIVERY) {
    return fulfillmentMethod === FulfillmentMethod.KIKUYU_LOCAL_DELIVERY;
  }
  if (from === FulfillmentStatus.READY_FOR_PICKUP && to === FulfillmentStatus.COMPLETED) return true;
  if (from === FulfillmentStatus.OUT_FOR_DELIVERY && to === FulfillmentStatus.COMPLETED) return true;

  return false;
}

export function normalizeScannedBarcode(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function barcodeMatchesOrder(expectedBarcodes: readonly string[], scannedBarcode: string): boolean {
  const scanned = normalizeScannedBarcode(scannedBarcode);
  return expectedBarcodes.some((barcode) => normalizeScannedBarcode(barcode) === scanned);
}
