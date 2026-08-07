import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FulfillmentItemStatus,
  FulfillmentMethod,
  FulfillmentStatus,
  OrderStatus
} from "@online-saler/database";
import {
  allFulfillmentItemsVerified,
  barcodeMatchesOrder,
  canTransitionFulfillment,
  normalizeScannedBarcode,
  orderCenterTab,
  verifyFulfillmentItemBarcode
} from "./operations-fulfillment-state";

describe("unified order fulfillment state machine", () => {
  it("requires item verification before packing", () => {
    assert.equal(canTransitionFulfillment({ from: FulfillmentStatus.PAID, to: FulfillmentStatus.PICKING }), true);
    assert.equal(canTransitionFulfillment({ from: FulfillmentStatus.PICKING, to: FulfillmentStatus.PACKED }), false);
    assert.equal(canTransitionFulfillment({ from: FulfillmentStatus.PICKING, to: FulfillmentStatus.READY_TO_PACK }), true);
    assert.equal(canTransitionFulfillment({ from: FulfillmentStatus.READY_TO_PACK, to: FulfillmentStatus.PACKED }), true);
    assert.equal(allFulfillmentItemsVerified([{ status: FulfillmentItemStatus.VERIFIED }, { status: FulfillmentItemStatus.PENDING }]), false);
    assert.equal(allFulfillmentItemsVerified([{ status: FulfillmentItemStatus.VERIFIED }, { status: FulfillmentItemStatus.VERIFIED }]), true);
  });

  it("returns actionable barcode mismatch details and blocks confirmation", () => {
    assert.deepEqual(
      verifyFulfillmentItemBarcode({
        orderItemId: "item-1",
        expectedBarcode: "DLF001258",
        scannedBarcode: "DLF008742",
        productName: "连衣裙",
        locationCode: "A-01-02-03"
      }),
      {
        ok: false,
        normalizedBarcode: "DLF008742",
        expectedBarcode: "DLF001258",
        actualBarcode: "DLF008742",
        productName: "连衣裙",
        locationCode: "A-01-02-03"
      }
    );
    assert.equal(normalizeScannedBarcode(" dlf 001258 "), "DLF001258");
    assert.equal(barcodeMatchesOrder(["DLF001258"], " dlf 001258 "), true);
  });

  it("separates pickup and delivery and requires a rider before dispatch", () => {
    assert.equal(canTransitionFulfillment({
      from: FulfillmentStatus.PACKED,
      to: FulfillmentStatus.READY_FOR_PICKUP,
      fulfillmentMethod: FulfillmentMethod.PICKUP
    }), true);
    assert.equal(canTransitionFulfillment({
      from: FulfillmentStatus.PACKED,
      to: FulfillmentStatus.READY_FOR_DISPATCH,
      fulfillmentMethod: FulfillmentMethod.PICKUP
    }), false);
    assert.equal(canTransitionFulfillment({
      from: FulfillmentStatus.READY_FOR_DISPATCH,
      to: FulfillmentStatus.OUT_FOR_DELIVERY,
      fulfillmentMethod: FulfillmentMethod.KIKUYU_LOCAL_DELIVERY,
      hasDeliveryRider: false
    }), false);
    assert.equal(canTransitionFulfillment({
      from: FulfillmentStatus.READY_FOR_DISPATCH,
      to: FulfillmentStatus.OUT_FOR_DELIVERY,
      fulfillmentMethod: FulfillmentMethod.KIKUYU_LOCAL_DELIVERY,
      hasDeliveryRider: true
    }), true);
  });

  it("does not allow a repeated status transition to create another event", () => {
    assert.equal(canTransitionFulfillment({ from: FulfillmentStatus.PICKING, to: FulfillmentStatus.PICKING }), false);
    assert.equal(canTransitionFulfillment({ from: FulfillmentStatus.COMPLETED, to: FulfillmentStatus.COMPLETED }), false);
  });

  it("maps packing completion directly to the packed order-center tab", () => {
    assert.equal(orderCenterTab({ orderStatus: OrderStatus.FULFILLING, fulfillmentStatus: FulfillmentStatus.PACKED }), "packed");
    assert.equal(orderCenterTab({ orderStatus: OrderStatus.PAID, fulfillmentStatus: FulfillmentStatus.PAID }), "waiting-pick");
  });
});
