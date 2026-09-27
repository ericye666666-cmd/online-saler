import assert from "node:assert/strict";
import {
  expectedBarcodeFor,
  findOrderByBarcode,
  handoverFor,
  localDay,
  needsDestination,
  normalizeBarcode,
  packStationStep,
  printerMemoryValue,
  rememberedPrinter,
  remainingItems,
  waitingOrders,
  type PackStationOrder
} from "./pack-station-logic";

const STORE = { id: "n-kinoo", name: "Kinoo", type: "STORE" };
const WAREHOUSE = { id: "n-wh", name: "Central", type: "WAREHOUSE" };

function order(overrides: Partial<PackStationOrder> = {}, task: Partial<NonNullable<PackStationOrder["fulfillment"]>> = {}): PackStationOrder {
  return {
    id: "o1",
    orderNumber: "DL-1",
    fulfillmentMethod: "KIKUYU_LOCAL_DELIVERY",
    fulfillmentNode: null,
    items: [
      { id: "i1", snapshot: { title: "Shirt", barcode: "OS-0001" } },
      { id: "i2", snapshot: { title: "Jeans", barcode: "OS-0002" } }
    ],
    ...overrides,
    fulfillment: {
      status: "PAID",
      items: [
        { orderItemId: "i1", status: "PENDING", expectedBarcode: "OS-0001" },
        { orderItemId: "i2", status: "PENDING", expectedBarcode: "OS-0002" }
      ],
      ...task
    }
  };
}

// Barcodes compare the way the API compares them.
assert.equal(normalizeBarcode("  os-00 01 "), "OS-0001");
assert.equal(normalizeBarcode(null), "");

// The picking task's frozen barcode wins over the snapshot, like the server.
const frozen = order({}, { items: [{ orderItemId: "i1", status: "PENDING", expectedBarcode: "TASK-1" }, { orderItemId: "i2", status: "PENDING" }] });
assert.equal(expectedBarcodeFor(frozen, frozen.items[0]!), "TASK-1");
assert.equal(expectedBarcodeFor(frozen, frozen.items[1]!), "OS-0002");

// Scanning a garment finds its order and says whether it was already checked.
const paid = order();
const hit = findOrderByBarcode([paid], "os-0002");
assert.equal(hit.kind, "match");
if (hit.kind === "match") {
  assert.equal(hit.order.id, "o1");
  assert.equal(hit.item.id, "i2");
  assert.equal(hit.verified, false);
}
assert.equal(findOrderByBarcode([paid], "OS-9999").kind, "none");
assert.equal(findOrderByBarcode([paid], "   ").kind, "none");
// An order that already left the warehouse is not reopened by scanning its garment.
assert.equal(findOrderByBarcode([order({}, { status: "IN_TRANSIT_TO_NODE" })], "OS-0001").kind, "none");

// Multi-item orders: what is still to scan.
const half = order({}, { status: "PICKING", items: [{ orderItemId: "i1", status: "VERIFIED" }, { orderItemId: "i2", status: "PENDING" }] });
assert.deepEqual(remainingItems(half).map((item) => item.id), ["i2"]);
assert.deepEqual(remainingItems(paid).map((item) => item.id), ["i1", "i2"]);
assert.deepEqual(remainingItems(order({}, { status: "READY_TO_PACK" })), []);

// Steps follow the existing fulfillment status; nothing new is stored.
assert.equal(packStationStep(paid), "scan");
assert.equal(packStationStep(half), "scan");
assert.equal(packStationStep(order({}, { status: "READY_TO_PACK" })), "details");
assert.equal(packStationStep(order({ fulfillmentNode: STORE }, { status: "PACKED", packageCode: "PKG-1" })), "print");
assert.equal(packStationStep(order({ fulfillmentNode: STORE }, { status: "PACKED", packageCode: "PKG-1", packageLabelPrintedAt: "2026-09-27T08:00:00Z" })), "send");
// Handed over at the warehouse: no sticker, straight to the handover.
assert.equal(packStationStep(order({ fulfillmentMethod: "PICKUP", fulfillmentNode: WAREHOUSE }, { status: "PACKED" })), "send");
assert.equal(packStationStep(order({}, { status: "IN_TRANSIT_TO_NODE" })), "gone");

// The destination is read off the task first, then the order.
assert.equal(needsDestination(order()), true);
assert.equal(needsDestination(order({}, { fulfillmentNode: STORE })), false);

// Step 4 picks the existing transition that fits the destination.
assert.equal(handoverFor(order()), null);
assert.deepEqual(handoverFor(order({ fulfillmentNode: STORE })), { action: "send-to-node", permission: "orders.assign-node" });
assert.deepEqual(handoverFor(order({ fulfillmentMethod: "PICKUP", fulfillmentNode: STORE })), { action: "send-to-node", permission: "orders.assign-node" });
assert.deepEqual(handoverFor(order({ fulfillmentMethod: "PICKUP", fulfillmentNode: WAREHOUSE })), { action: "ready-for-pickup", permission: "orders.pack" });
assert.deepEqual(handoverFor(order({ fulfillmentNode: WAREHOUSE })), { action: "ready-for-dispatch", permission: "orders.assign-rider" });

// The waiting list shows what the API would let this employee work on.
const list = [
  order({ id: "free" }),
  order({ id: "other-picker" }, { assignedPickerEmployeeId: "e2" }),
  order({ id: "my-picking" }, { status: "PICKING", assignedPickerEmployeeId: "e1" }),
  order({ id: "their-picking" }, { status: "PICKING", assignedPickerEmployeeId: "e2" }),
  order({ id: "my-pack" }, { status: "READY_TO_PACK", assignedPackerEmployeeId: "e1" }),
  order({ id: "their-pack" }, { status: "READY_TO_PACK", assignedPackerEmployeeId: "e2" }),
  order({ id: "my-packed" }, { status: "PACKED", assignedPackerEmployeeId: "e1" }),
  order({ id: "gone" }, { status: "IN_TRANSIT_TO_NODE", assignedPackerEmployeeId: "e1" })
];
assert.deepEqual(waitingOrders(list, "e1", false).map((item) => item.id), ["my-packed", "my-pack", "my-picking", "free"]);
assert.deepEqual(
  waitingOrders(list, "e1", true).map((item) => item.id),
  ["my-packed", "my-pack", "their-pack", "my-picking", "free"]
);

// The printer is remembered for the day, and forgotten the next.
const memory = printerMemoryValue("Deli DL-720C", "2026-09-27");
assert.equal(rememberedPrinter(memory, "2026-09-27"), "Deli DL-720C");
assert.equal(rememberedPrinter(memory, "2026-09-28"), null);
assert.equal(rememberedPrinter("not json", "2026-09-27"), null);
assert.equal(rememberedPrinter(null, "2026-09-27"), null);
assert.match(localDay(new Date(2026, 8, 27, 23, 30)), /^2026-09-27$/);

console.log("pack station logic ok");
