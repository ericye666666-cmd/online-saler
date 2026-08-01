import {
  FulfillmentItemStatus,
  FulfillmentMethod,
  FulfillmentStatus,
  OrderStatus
} from "@online-saler/database";

export type FulfillmentTransitionInput = {
  from: FulfillmentStatus;
  to: FulfillmentStatus;
  fulfillmentMethod?: FulfillmentMethod | null;
  hasDeliveryRider?: boolean;
};

export type OrderCenterTab =
  | "all"
  | "pending-payment"
  | "waiting-pick"
  | "picking"
  | "ready-to-pack"
  | "packed"
  | "ready-for-pickup"
  | "ready-for-dispatch"
  | "out-for-delivery"
  | "completed"
  | "after-sale"
  | "cancelled";

export type BarcodeCheckInput = {
  orderItemId: string;
  expectedBarcode: string | null;
  scannedBarcode: string;
  productName: string;
  locationCode: string | null;
};

export type BarcodeCheckResult =
  | { ok: true; normalizedBarcode: string }
  | {
      ok: false;
      normalizedBarcode: string;
      expectedBarcode: string | null;
      actualBarcode: string;
      productName: string;
      locationCode: string | null;
    };

export function canTransitionFulfillment(input: FulfillmentTransitionInput): boolean {
  const { from, to, fulfillmentMethod, hasDeliveryRider } = input;
  if (from === to || from === FulfillmentStatus.COMPLETED) return false;
  if (to === FulfillmentStatus.EXCEPTION) return from !== FulfillmentStatus.EXCEPTION;

  if (from === FulfillmentStatus.PAID && to === FulfillmentStatus.PICKING) return true;
  if (from === FulfillmentStatus.PICKING && to === FulfillmentStatus.READY_TO_PACK) return true;
  if (from === FulfillmentStatus.READY_TO_PACK && to === FulfillmentStatus.PACKED) return true;
  if (from === FulfillmentStatus.PACKED && to === FulfillmentStatus.READY_FOR_PICKUP) {
    return fulfillmentMethod === FulfillmentMethod.PICKUP;
  }
  if (from === FulfillmentStatus.PACKED && to === FulfillmentStatus.READY_FOR_DISPATCH) {
    return fulfillmentMethod === FulfillmentMethod.KIKUYU_LOCAL_DELIVERY;
  }
  if (from === FulfillmentStatus.READY_FOR_DISPATCH && to === FulfillmentStatus.OUT_FOR_DELIVERY) {
    return fulfillmentMethod === FulfillmentMethod.KIKUYU_LOCAL_DELIVERY && Boolean(hasDeliveryRider);
  }
  if (from === FulfillmentStatus.READY_FOR_PICKUP && to === FulfillmentStatus.COMPLETED) {
    return fulfillmentMethod === FulfillmentMethod.PICKUP;
  }
  if (from === FulfillmentStatus.OUT_FOR_DELIVERY && to === FulfillmentStatus.COMPLETED) {
    return fulfillmentMethod === FulfillmentMethod.KIKUYU_LOCAL_DELIVERY;
  }

  return false;
}

export function orderCenterTab(input: {
  orderStatus: OrderStatus;
  fulfillmentStatus?: FulfillmentStatus | null;
  hasOpenAfterSale?: boolean;
}): OrderCenterTab {
  if (input.hasOpenAfterSale || input.orderStatus === OrderStatus.REFUNDED) return "after-sale";
  if (input.orderStatus === OrderStatus.CANCELLED || input.orderStatus === OrderStatus.EXPIRED) return "cancelled";
  if (input.orderStatus === OrderStatus.COMPLETED || input.fulfillmentStatus === FulfillmentStatus.COMPLETED) return "completed";

  const fulfillmentTabs: Partial<Record<FulfillmentStatus, OrderCenterTab>> = {
    [FulfillmentStatus.PAID]: "waiting-pick",
    [FulfillmentStatus.PICKING]: "picking",
    [FulfillmentStatus.READY_TO_PACK]: "ready-to-pack",
    [FulfillmentStatus.PACKED]: "packed",
    [FulfillmentStatus.READY_FOR_PICKUP]: "ready-for-pickup",
    [FulfillmentStatus.READY_FOR_DISPATCH]: "ready-for-dispatch",
    [FulfillmentStatus.OUT_FOR_DELIVERY]: "out-for-delivery",
    [FulfillmentStatus.COMPLETED]: "completed"
  };
  if (input.fulfillmentStatus && fulfillmentTabs[input.fulfillmentStatus]) {
    return fulfillmentTabs[input.fulfillmentStatus]!;
  }
  if (input.orderStatus === OrderStatus.PAID || input.orderStatus === OrderStatus.FULFILLING) return "waiting-pick";
  return "pending-payment";
}

export function normalizeScannedBarcode(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function barcodeMatchesOrder(expectedBarcodes: readonly string[], scannedBarcode: string): boolean {
  const scanned = normalizeScannedBarcode(scannedBarcode);
  return expectedBarcodes.some((barcode) => normalizeScannedBarcode(barcode) === scanned);
}

export function verifyFulfillmentItemBarcode(input: BarcodeCheckInput): BarcodeCheckResult {
  const normalizedBarcode = normalizeScannedBarcode(input.scannedBarcode);
  const expected = input.expectedBarcode ? normalizeScannedBarcode(input.expectedBarcode) : null;
  if (expected && expected === normalizedBarcode) return { ok: true, normalizedBarcode };
  return {
    ok: false,
    normalizedBarcode,
    expectedBarcode: input.expectedBarcode,
    actualBarcode: input.scannedBarcode,
    productName: input.productName,
    locationCode: input.locationCode
  };
}

export function allFulfillmentItemsVerified(items: ReadonlyArray<{ status: FulfillmentItemStatus }>): boolean {
  return items.length > 0 && items.every((item) => item.status === FulfillmentItemStatus.VERIFIED);
}
