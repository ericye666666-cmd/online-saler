import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FulfillmentMethod, FulfillmentStatus } from "@online-saler/database";
import { barcodeMatchesOrder, canTransitionFulfillment, normalizeScannedBarcode } from "./operations-fulfillment-state";

describe("operations fulfillment state machine", () => {
  it("allows paid orders to enter picking", () => {
    assert.equal(canTransitionFulfillment({ from: FulfillmentStatus.PAID, to: FulfillmentStatus.PICKING }), true);
  });

  it("blocks packing before a barcode scan has confirmed picking", () => {
    assert.equal(canTransitionFulfillment({ from: FulfillmentStatus.PICKING, to: FulfillmentStatus.PACKED }), false);
    assert.equal(
      canTransitionFulfillment({
        from: FulfillmentStatus.PICKING,
        to: FulfillmentStatus.PACKED,
        pickedAt: new Date()
      }),
      true
    );
  });

  it("routes packed orders by fulfillment method", () => {
    assert.equal(
      canTransitionFulfillment({
        from: FulfillmentStatus.PACKED,
        to: FulfillmentStatus.READY_FOR_PICKUP,
        fulfillmentMethod: FulfillmentMethod.PICKUP
      }),
      true
    );
    assert.equal(
      canTransitionFulfillment({
        from: FulfillmentStatus.PACKED,
        to: FulfillmentStatus.OUT_FOR_DELIVERY,
        fulfillmentMethod: FulfillmentMethod.KIKUYU_LOCAL_DELIVERY
      }),
      true
    );
    assert.equal(
      canTransitionFulfillment({
        from: FulfillmentStatus.PACKED,
        to: FulfillmentStatus.OUT_FOR_DELIVERY,
        fulfillmentMethod: FulfillmentMethod.PICKUP
      }),
      false
    );
  });

  it("allows pickup and delivery handoff to complete", () => {
    assert.equal(
      canTransitionFulfillment({
        from: FulfillmentStatus.READY_FOR_PICKUP,
        to: FulfillmentStatus.COMPLETED
      }),
      true
    );
    assert.equal(
      canTransitionFulfillment({
        from: FulfillmentStatus.OUT_FOR_DELIVERY,
        to: FulfillmentStatus.COMPLETED
      }),
      true
    );
  });

  it("normalizes and matches scanned barcodes", () => {
    assert.equal(normalizeScannedBarcode(" dlf test 001 "), "DLFTEST001");
    assert.equal(barcodeMatchesOrder(["DLFTEST001"], " dlf test 001 "), true);
    assert.equal(barcodeMatchesOrder(["DLFTEST001"], "OTHER"), false);
  });
});
