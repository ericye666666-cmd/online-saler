import {
  FulfillmentItemStatus,
  FulfillmentMethod,
  FulfillmentNodeType,
  FulfillmentStatus,
  OrderStatus
} from "@online-saler/database";

export type FulfillmentTransitionInput = {
  from: FulfillmentStatus;
  to: FulfillmentStatus;
  fulfillmentMethod?: FulfillmentMethod | null;
  hasDeliveryRider?: boolean;
  /**
   * Where this package is handed to the customer. A store node needs the two
   * transit steps; the warehouse hands over on the spot.
   */
  nodeType?: FulfillmentNodeType | null;
};

export type OrderCenterTab =
  | "all"
  | "pending-payment"
  | "waiting-pick"
  | "picking"
  | "ready-to-pack"
  | "packed"
  | "in-transit-to-node"
  | "at-node"
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

/** A store node has to receive the package before it can hand it over. */
export function requiresNodeTransit(nodeType?: FulfillmentNodeType | null): boolean {
  return nodeType === FulfillmentNodeType.STORE;
}

/** The handover state a packed order moves into once it is at its node. */
export function handoverStatusFor(fulfillmentMethod?: FulfillmentMethod | null): FulfillmentStatus {
  return fulfillmentMethod === FulfillmentMethod.PICKUP
    ? FulfillmentStatus.READY_FOR_PICKUP
    : FulfillmentStatus.READY_FOR_DISPATCH;
}

export function canTransitionFulfillment(input: FulfillmentTransitionInput): boolean {
  const { from, to, fulfillmentMethod, hasDeliveryRider, nodeType } = input;
  if (from === to || from === FulfillmentStatus.COMPLETED) return false;
  if (to === FulfillmentStatus.EXCEPTION) return from !== FulfillmentStatus.EXCEPTION;

  if (from === FulfillmentStatus.PAID && to === FulfillmentStatus.PICKING) return true;
  if (from === FulfillmentStatus.PICKING && to === FulfillmentStatus.READY_TO_PACK) return true;
  if (from === FulfillmentStatus.READY_TO_PACK && to === FulfillmentStatus.PACKED) return true;
  if (from === FulfillmentStatus.PACKED && to === FulfillmentStatus.IN_TRANSIT_TO_NODE) {
    return requiresNodeTransit(nodeType);
  }
  if (from === FulfillmentStatus.IN_TRANSIT_TO_NODE && to === FulfillmentStatus.ARRIVED_AT_NODE) {
    return requiresNodeTransit(nodeType);
  }
  if (from === FulfillmentStatus.PACKED && to === FulfillmentStatus.READY_FOR_PICKUP) {
    return fulfillmentMethod === FulfillmentMethod.PICKUP && !requiresNodeTransit(nodeType);
  }
  if (from === FulfillmentStatus.PACKED && to === FulfillmentStatus.READY_FOR_DISPATCH) {
    return fulfillmentMethod === FulfillmentMethod.KIKUYU_LOCAL_DELIVERY && !requiresNodeTransit(nodeType);
  }
  if (from === FulfillmentStatus.ARRIVED_AT_NODE && to === FulfillmentStatus.READY_FOR_PICKUP) {
    return fulfillmentMethod === FulfillmentMethod.PICKUP;
  }
  if (from === FulfillmentStatus.ARRIVED_AT_NODE && to === FulfillmentStatus.READY_FOR_DISPATCH) {
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
  if (input.fulfillmentStatus === FulfillmentStatus.EXCEPTION) return "all";

  const fulfillmentTabs: Partial<Record<FulfillmentStatus, OrderCenterTab>> = {
    [FulfillmentStatus.PAID]: "waiting-pick",
    [FulfillmentStatus.PICKING]: "picking",
    [FulfillmentStatus.READY_TO_PACK]: "ready-to-pack",
    [FulfillmentStatus.PACKED]: "packed",
    [FulfillmentStatus.IN_TRANSIT_TO_NODE]: "in-transit-to-node",
    [FulfillmentStatus.ARRIVED_AT_NODE]: "at-node",
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

export function maskCustomerPhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 4) return "•".repeat(digits.length);

  const prefixLength = digits.length >= 8 ? 3 : 0;
  const prefix = digits.slice(0, prefixLength);
  const suffix = digits.slice(-4);
  const masked = "•".repeat(Math.max(2, digits.length - prefix.length - suffix.length));
  return `${value?.trim().startsWith("+") ? "+" : ""}${prefix}${masked}${suffix}`;
}

/**
 * EXCEPTION used to be a dead end: an order that hit it could only be
 * cancelled. A resolved exception returns to the step it was on, so a package
 * that was mis-routed or briefly lost can rejoin the normal flow.
 */
export function canResolveFulfillmentException(input: {
  status: FulfillmentStatus;
  exceptionFromStatus?: FulfillmentStatus | null;
}): boolean {
  if (input.status !== FulfillmentStatus.EXCEPTION) return false;
  const back = input.exceptionFromStatus;
  return Boolean(back) && back !== FulfillmentStatus.EXCEPTION && back !== FulfillmentStatus.COMPLETED;
}

/**
 * Exceptions that mean the garment will never reach this customer. These are
 * the ones that lead to a write-off and a refund rather than a retry.
 */
export const UNRECOVERABLE_EXCEPTION_REASONS = [
  "ITEM_NOT_FOUND",
  "ITEM_DAMAGED",
  "ITEM_SOLD_OFFLINE"
] as const;

/** Human-facing package label carried on the box between warehouse and node. */
export function buildPackageCode(orderNumber: string, nodeCode: string): string {
  const order = orderNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(-8);
  const node = nodeCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
  return `PKG-${node}-${order}`;
}
