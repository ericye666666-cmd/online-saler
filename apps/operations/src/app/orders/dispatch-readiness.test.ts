import assert from "node:assert/strict";
import {
  canPrintLabel,
  canSendToStore,
  isTransitNodeOption,
  needsDestination,
  planDispatchBatch,
  type DispatchOrder
} from "./dispatch-readiness";

const STORE = { type: "STORE" };
const WAREHOUSE = { type: "WAREHOUSE" };

function packed(overrides: Partial<NonNullable<DispatchOrder["fulfillment"]>> = {}, method = "KIKUYU_LOCAL_DELIVERY", node: DispatchOrder["fulfillmentNode"] = null): DispatchOrder {
  return {
    fulfillmentMethod: method,
    fulfillmentNode: node,
    fulfillment: { status: "PACKED", fulfillmentNode: node, packageCode: null, packageLabelPrintedAt: null, ...overrides }
  };
}

// A delivery order packed before anyone routed it has to be routed first.
const unrouted = packed();
assert.equal(needsDestination(unrouted), true);
assert.equal(canPrintLabel(unrouted), false);
assert.equal(canSendToStore(unrouted), false);

// Routed through a store and labelled with a code, but the sticker is not out yet.
const unprinted = packed({ packageCode: "PKG-KINOO-1" }, "KIKUYU_LOCAL_DELIVERY", STORE);
assert.equal(needsDestination(unprinted), false);
assert.equal(canPrintLabel(unprinted), true);
assert.equal(canSendToStore(unprinted), false);

// Printed: now it may leave.
const printed = packed({ packageCode: "PKG-KINOO-2", packageLabelPrintedAt: "2026-09-25T08:00:00Z" }, "PICKUP", STORE);
assert.equal(canSendToStore(printed), true);

// Handed over at the warehouse: never sent to a store, printed or not.
const atWarehouse = packed({ packageCode: "PKG-X-3", packageLabelPrintedAt: "2026-09-25T08:00:00Z" }, "PICKUP", WAREHOUSE);
assert.equal(canSendToStore(atWarehouse), false);

// Only stores are offered as a delivery order's transit point.
assert.equal(isTransitNodeOption(STORE), true);
assert.equal(isTransitNodeOption(WAREHOUSE), false);

const plan = planDispatchBatch([unrouted, unprinted, printed, atWarehouse]);
assert.deepEqual(plan.sendable, [printed]);
assert.deepEqual(plan.unprinted, [unprinted]);
assert.deepEqual(plan.unrouted, [unrouted]);
assert.deepEqual(plan.printable, [unprinted, printed, atWarehouse]);

console.log("dispatch readiness ok");
