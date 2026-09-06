import "reflect-metadata";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { prisma } from "@online-saler/database";
import { OperationsAccessService } from "./operations-access.service";
import { OperationsFulfillmentService } from "./operations-fulfillment.service";

function fixture(t: TestContext, currentStatus: string, currentFulfillment: string, staleFulfillment = "OUT_FOR_DELIVERY") {
  const calls: string[] = [];
  const actor = { actorAdminUserId: "admin", actorEmployeeId: "employee" };
  const time = new Date("2026-09-06T08:00:00Z");
  const stale = {
    id: "order", status: "FULFILLING", fulfillmentMethod: "KIKUYU_LOCAL_DELIVERY", totalKsh: 200,
    items: [{ id: "item", productId: "product", snapshot: { title: "Garment", barcode: "BARCODE" } }],
    fulfillment: { id: "fulfillment", status: staleFulfillment, updatedAt: time, packingStartedAt: time, packingStartedByEmployeeId: "employee", completedAt: null, items: [{ orderItemId: "item", expectedBarcode: "BARCODE", status: "PENDING" }] }
  };
  const current = { ...stale, status: currentStatus, fulfillment: { ...stale.fulfillment, status: currentFulfillment, completedAt: currentFulfillment === "COMPLETED" ? time : null } };
  let competing = false;
  const tx = {
    $queryRaw: async (parts: TemplateStringsArray) => {
      const sql = parts.join("?");
      calls.push(sql.includes('FROM "InventoryItem"') ? "lock-inventory" : "lock-order");
      return sql.includes('FROM "InventoryItem"') ? [{ id: "inventory", productId: "product", status: "PACKED" }] : [{ id: "order" }];
    },
    order: { findUnique: async () => { calls.push("read-current"); return current; }, update: async () => { calls.push("write-order"); return current; } },
    orderItem: {
      findMany: async ({ where }: { where: { orderId?: unknown } }) => typeof where.orderId === "string" ? [{ productId: "product" }] : competing ? [{ productId: "product" }] : [],
      findFirst: async () => null
    },
    payment: { findMany: async () => [{ amountKsh: 200 }] },
    inventoryItem: { updateMany: async () => { calls.push("write-inventory"); return { count: 1 }; } },
    orderFulfillment: { update: async () => { calls.push("write-fulfillment"); return current.fulfillment; } },
    fulfillmentEvent: { upsert: async () => { calls.push("write-event"); return {}; } }
  };
  const original = prisma.$transaction;
  prisma.$transaction = (async (callback: (value: unknown) => unknown) => callback(tx)) as typeof prisma.$transaction;
  t.after(() => { prisma.$transaction = original; });
  const service = new OperationsFulfillmentService({} as OperationsAccessService);
  const internals = service as unknown as {
    employeeForPermission: () => Promise<typeof actor>;
    adminForPermission: () => Promise<typeof actor>;
    requireOrderWithTask: () => Promise<typeof stale>;
    requireEmployee: () => Promise<{ id: string }>;
    orderDetail: () => Promise<typeof current>;
  };
  internals.employeeForPermission = async () => actor;
  internals.adminForPermission = async () => actor;
  internals.requireOrderWithTask = async () => stale;
  internals.requireEmployee = async () => ({ id: "employee" });
  internals.orderDetail = async () => current;
  return { service, calls, compete: () => { competing = true; } };
}

test("a completion that committed before cancel cannot be overwritten by cancellation", async (t) => {
  const h = fixture(t, "COMPLETED", "COMPLETED");
  await assert.rejects(() => h.service.cancel("order", { adminUserId: "admin" }), /cannot be cancelled/);
  assert.deepEqual(h.calls, ["lock-order", "read-current"]);
});

test("a delayed handover retry after refund preserves returned or resold inventory and delivery timestamp", async (t) => {
  const h = fixture(t, "REFUNDED", "COMPLETED");
  await h.service.completeDelivery("order", { adminUserId: "admin" });
  assert.deepEqual(h.calls, ["lock-order", "read-current"]);
});

test("a cancelled order cannot be completed using a previously read delivery task", async (t) => {
  const h = fixture(t, "CANCELLED", "EXCEPTION");
  await assert.rejects(() => h.service.completeDelivery("order", { adminUserId: "admin" }), /state changed/);
  assert.deepEqual(h.calls, ["lock-order", "read-current"]);
});

test("an old packing request cannot rewrite a refunded garment as packed", async (t) => {
  const h = fixture(t, "REFUNDED", "COMPLETED", "READY_TO_PACK");
  await assert.rejects(() => h.service.completePacking("order", { adminUserId: "admin", packagingMethod: "BAG", packageCount: 1 }), /packing task changed/);
  assert.deepEqual(h.calls, ["lock-order", "read-current"]);
});

test("handover locks inventory after its order and refuses another active reservation", async (t) => {
  const h = fixture(t, "FULFILLING", "OUT_FOR_DELIVERY");
  h.compete();
  await assert.rejects(() => h.service.completeDelivery("order", { adminUserId: "admin" }), /no longer owned/);
  assert.deepEqual(h.calls, ["lock-order", "read-current", "lock-inventory"]);
});


test("a delayed barcode scan cannot restore a refunded garment to picked stock", async (t) => {
  const h = fixture(t, "REFUNDED", "COMPLETED", "PICKING");
  const original = prisma.inventoryItem.findUnique;
  prisma.inventoryItem.findUnique = (async () => ({ barcode: "BARCODE", location: null })) as unknown as typeof prisma.inventoryItem.findUnique;
  t.after(() => { prisma.inventoryItem.findUnique = original; });
  await assert.rejects(() => h.service.scanItem("order", "item", { adminUserId: "admin", barcode: "BARCODE" }), /Picking task changed/);
  assert.deepEqual(h.calls, ["lock-order", "read-current"]);
});
