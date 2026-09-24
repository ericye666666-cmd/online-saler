import "reflect-metadata";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { prisma } from "@online-saler/database";
import type { OperationsAccessService } from "./operations-access.service";
import { OperationsFulfillmentService } from "./operations-fulfillment.service";
import type { ProductImageStorageService } from "../product/product-image-storage.service";

/**
 * The node a parcel goes to is written on the order and read off the
 * fulfillment record.
 *
 * The store end of the loop — its board, its scanner, its "is this mine" check —
 * reads only the fulfillment record. The order is where checkout writes the node
 * the customer picked. If the two are allowed to disagree, a real parcel arrives
 * at a store whose screen has never heard of it and whose scanner answers "this
 * belongs to another store", and there is no way to receive it. These tests are
 * all the same question: does the fulfillment record end up naming the node the
 * order names?
 */

const KINOO = { id: "node-kinoo", code: "KINOO", name: "Kinoo", type: "STORE" };
const THOGOTO = { id: "node-thogoto", code: "THOGOT", name: "Thogoto", type: "STORE" };

function stubPhotoStore() {
  return {} as unknown as ProductImageStorageService;
}

function service() {
  return new OperationsFulfillmentService(
    { hasPermission: async () => true } as unknown as OperationsAccessService,
    stubPhotoStore()
  );
}

/**
 * Runs the task-creation pass over one paid order and reports what it would have
 * written to the fulfillment record.
 */
async function ensureTask(
  t: TestContext,
  order: { fulfillmentNodeId: string | null; fulfillment: { fulfillmentNodeId: string | null } | null }
) {
  const upserts: Array<{ create: Record<string, unknown>; update: Record<string, unknown> }> = [];
  const row = { id: "order", orderNumber: "DL-20260924-43A434C5", items: [], ...order };
  const tx = {
    orderFulfillment: {
      upsert: async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        upserts.push(args);
        return { id: "fulfillment" };
      }
    },
    fulfillmentItem: { createMany: async () => ({ count: 0 }) },
    fulfillmentEvent: { upsert: async () => ({}), create: async () => ({}) }
  };

  const originals = { findMany: prisma.order.findMany, transaction: prisma.$transaction };
  prisma.order.findMany = (async () => [row]) as unknown as typeof prisma.order.findMany;
  prisma.$transaction = (async (callback: (value: unknown) => unknown) => callback(tx)) as typeof prisma.$transaction;
  t.after(() => {
    prisma.order.findMany = originals.findMany;
    prisma.$transaction = originals.transaction;
  });

  await (service() as unknown as { ensurePaidFulfillments: (id?: string) => Promise<void> })
    .ensurePaidFulfillments("order");
  assert.equal(upserts.length, 1);
  return upserts[0];
}

test("a picking task is born knowing the node the customer chose", async (t) => {
  // Nobody re-routes an order the customer already routed, so this is the only
  // chance the fulfillment record gets to learn where the parcel is going.
  const { create } = await ensureTask(t, { fulfillmentNodeId: KINOO.id, fulfillment: null });
  assert.equal(create.fulfillmentNodeId, KINOO.id);
});

test("a task created before its node was recorded picks the node up", async (t) => {
  const { update } = await ensureTask(t, {
    fulfillmentNodeId: KINOO.id,
    fulfillment: { fulfillmentNodeId: null }
  });
  assert.equal(update.fulfillmentNodeId, KINOO.id);
});

test("a re-route already recorded on the task is not undone", async (t) => {
  // Re-routing writes both fields at once, so they agree — but the task is the
  // field a store trusts, and a repair pass must never move a parcel back.
  const { update } = await ensureTask(t, {
    fulfillmentNodeId: THOGOTO.id,
    fulfillment: { fulfillmentNodeId: KINOO.id }
  });
  assert.deepEqual(update, {});
});

test("an order with no node yet leaves the task unrouted rather than guessing", async (t) => {
  const { create, update } = await ensureTask(t, { fulfillmentNodeId: null, fulfillment: null });
  assert.equal(create.fulfillmentNodeId, null);
  assert.deepEqual(update, {});
});

test("sealing a parcel records the node its label names", async (t) => {
  // The package code carries the node — the sticker reads PKG-KINOO-. A sealed
  // parcel whose record names a different node, or none, is one the receiving
  // store cannot accept, so packing writes both together.
  const time = new Date("2026-09-24T20:00:00Z");
  const writes: Array<Record<string, unknown>> = [];
  const fulfillment = { id: "fulfillment", status: "READY_TO_PACK", updatedAt: time, packingStartedAt: time, packingStartedByEmployeeId: "employee", packageCode: null };
  const order = {
    id: "order", orderNumber: "DL-20260924-43A434C5", status: "PAID",
    fulfillmentMethod: "KIKUYU_LOCAL_DELIVERY", fulfillmentNode: KINOO,
    items: [{ id: "item", productId: "product" }], fulfillment
  };
  const tx = {
    $queryRaw: async () => [{ id: "order" }],
    order: { findUnique: async () => order },
    inventoryItem: { updateMany: async () => ({ count: 1 }) },
    orderFulfillment: {
      update: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); return fulfillment; }
    },
    fulfillmentEvent: { upsert: async () => ({}), create: async () => ({}) }
  };
  const original = prisma.$transaction;
  prisma.$transaction = (async (callback: (value: unknown) => unknown) => callback(tx)) as typeof prisma.$transaction;
  t.after(() => { prisma.$transaction = original; });

  const packing = service();
  Object.assign(packing as unknown as Record<string, unknown>, {
    employeeForPermission: async () => ({ actorAdminUserId: "admin", actorEmployeeId: "employee" }),
    requireOrderWithTask: async () => order,
    requireEmployee: async () => ({ id: "employee" }),
    assertPackerOwnsParcel: async () => undefined,
    assertTransition: () => undefined,
    assertOwnedInventory: async () => undefined,
    orderDetail: async () => order
  });
  await packing.completePacking("order", {
    adminUserId: "admin", employeeId: "employee", packagingMethod: "BAG", packageCount: 1
  } as Parameters<OperationsFulfillmentService["completePacking"]>[1]);

  assert.equal(writes.length, 1);
  assert.equal(writes[0].fulfillmentNodeId, KINOO.id);
  assert.equal(writes[0].packageCode, "PKG-KINOO-43A434C5");
});
