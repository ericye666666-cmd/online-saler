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
  canWorkWarehouseTask,
  maskCustomerPhone,
  normalizeScannedBarcode,
  orderCenterTab,
  verifyFulfillmentItemBarcode
} from "./operations-fulfillment-state";

describe("unified order fulfillment state machine", () => {
  it("masks customer phone numbers before returning order-center rows", () => {
    assert.equal(maskCustomerPhone("+254712345678"), "+254•••••5678");
    assert.equal(maskCustomerPhone("0712345678"), "071•••5678");
    assert.equal(maskCustomerPhone(null), null);
  });

  it("requires item verification before packing", () => {
    assert.equal(canTransitionFulfillment({ from: FulfillmentStatus.PAID, to: FulfillmentStatus.PICKING }), true);
    assert.equal(canTransitionFulfillment({ from: FulfillmentStatus.PICKING, to: FulfillmentStatus.PACKED }), false);
    assert.equal(canTransitionFulfillment({ from: FulfillmentStatus.PICKING, to: FulfillmentStatus.READY_TO_PACK }), true);
    assert.equal(canTransitionFulfillment({ from: FulfillmentStatus.READY_TO_PACK, to: FulfillmentStatus.PACKED }), true);
    assert.equal(allFulfillmentItemsVerified([{ status: FulfillmentItemStatus.VERIFIED }, { status: FulfillmentItemStatus.PENDING }]), false);
    assert.equal(allFulfillmentItemsVerified([{ status: FulfillmentItemStatus.VERIFIED }, { status: FulfillmentItemStatus.VERIFIED }]), true);
  });

  it("lets a picker take an unclaimed task but never someone else's", () => {
    const picking = (assignedEmployeeId: string | null, actorEmployeeId: string | null) =>
      canWorkWarehouseTask({ assignedEmployeeId, actorEmployeeId, supervisor: false, unassignedIsOpen: true });

    // Scanning is claiming: nobody has to press a button before starting.
    assert.deepEqual(picking(null, "amina"), { allowed: true });
    assert.deepEqual(picking("amina", "amina"), { allowed: true });
    assert.deepEqual(picking("amina", "brian"), { allowed: false, reason: "OTHER_EMPLOYEE" });
  });

  it("refuses a packer any parcel a supervisor has not handed them", () => {
    const packing = (assignedEmployeeId: string | null, actorEmployeeId: string | null) =>
      canWorkWarehouseTask({ assignedEmployeeId, actorEmployeeId, supervisor: false, unassignedIsOpen: false });

    // The whole point: an unassigned parcel is nobody's, not everybody's.
    assert.deepEqual(packing(null, "amina"), { allowed: false, reason: "UNASSIGNED" });
    assert.deepEqual(packing("amina", "amina"), { allowed: true });
    assert.deepEqual(packing("amina", "brian"), { allowed: false, reason: "OTHER_EMPLOYEE" });
  });

  it("lets a supervisor act whatever the assignment says", () => {
    for (const unassignedIsOpen of [true, false]) {
      assert.deepEqual(
        canWorkWarehouseTask({ assignedEmployeeId: null, actorEmployeeId: null, supervisor: true, unassignedIsOpen }),
        { allowed: true }
      );
      assert.deepEqual(
        canWorkWarehouseTask({ assignedEmployeeId: "amina", actorEmployeeId: "brian", supervisor: true, unassignedIsOpen }),
        { allowed: true }
      );
    }
  });

  it("never lets an admin account with no employee behind it inherit a task", () => {
    // An admin user that was never linked to an employee has a null actor id.
    // Comparing null to a null assignment would quietly grant every parcel.
    assert.deepEqual(
      canWorkWarehouseTask({ assignedEmployeeId: "amina", actorEmployeeId: null, supervisor: false, unassignedIsOpen: true }),
      { allowed: false, reason: "OTHER_EMPLOYEE" }
    );
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

/**
 * Packing is handed out rather than taken, which is right on a floor with
 * several packers and fatal on a floor with one: the only person there would
 * pick a trolley and then be told to ask a supervisor who is themselves.
 *
 * So the picker owns the parcel by default. It is still assigned work with a
 * name against it — the point of assigning — and a supervisor can still hand it
 * to somebody else before packing starts.
 */
it("lets the person who picked a trolley pack it without being assigned", () => {
  const picker = "employee-picker";
  const stranger = "employee-stranger";

  // What completing the picking writes, as the service writes it: keep an
  // existing assignment, otherwise fall to the picker.
  const packerAfterPicking = (existing: string | null, pickedBy: string) => existing ?? pickedBy;
  const assignedAfterPicking = packerAfterPicking(null, picker);
  assert.equal(assignedAfterPicking, picker);
  assert.equal(packerAfterPicking(stranger, picker), stranger, "a supervisor's assignment survives picking finishing");

  assert.deepEqual(
    canWorkWarehouseTask({ assignedEmployeeId: assignedAfterPicking, actorEmployeeId: picker, supervisor: false, unassignedIsOpen: false }),
    { allowed: true },
    "the picker packs their own trolley"
  );
  assert.deepEqual(
    canWorkWarehouseTask({ assignedEmployeeId: assignedAfterPicking, actorEmployeeId: stranger, supervisor: false, unassignedIsOpen: false }),
    { allowed: false, reason: "OTHER_EMPLOYEE" },
    "and nobody else does"
  );
});
