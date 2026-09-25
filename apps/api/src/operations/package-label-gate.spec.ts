import "reflect-metadata";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { BadRequestException, ConflictException, ForbiddenException, HttpException } from "@nestjs/common";
import { prisma } from "@online-saler/database";
import type { OperationsAccessService } from "./operations-access.service";
import { OperationsFulfillmentService, PACKAGE_LABEL_NOT_PRINTED } from "./operations-fulfillment.service";
import type { ProductImageStorageService } from "../product/product-image-storage.service";

/**
 * A parcel leaves for its store only once its routing label has been printed.
 *
 * The store receives a parcel by scanning the QR sticker on it. A box sent
 * without one arrives as a parcel nobody can check in, so the warehouse is held
 * at the step where the sticker is made: print first, then 发往门店. Printing is
 * recorded by the console after the print helper confirms the sheet went out,
 * and a re-route that renames the parcel makes the old sticker wrong, so it
 * clears the record.
 */

const KINOO = { id: "node-kinoo", code: "KINOO", name: "Kinoo", type: "STORE", status: "ACTIVE", supportsPickup: true, supportsDelivery: true };
const THOGOTO = { id: "node-thogoto", code: "THOGOT", name: "Thogoto", type: "STORE", status: "ACTIVE", supportsPickup: true, supportsDelivery: true };
const PRINTED_AT = new Date("2026-09-25T08:00:00Z");

type Row = Record<string, unknown>;

function service(permissions: Record<string, string[]> = { admin: ["orders.pack", "orders.assign-node"] }) {
  const access = {
    hasPermission: async () => true,
    requirePermission: async (adminUserId: string | undefined, permission: string) => {
      if (!adminUserId || !permissions[adminUserId]?.includes(permission)) {
        throw new ForbiddenException("This admin account does not have permission for this operation.");
      }
      return { adminUser: { id: adminUserId, linkedEmployee: { id: `employee-${adminUserId}` } } };
    }
  };
  return new OperationsFulfillmentService(access as unknown as OperationsAccessService, {} as unknown as ProductImageStorageService);
}

function packedOrder(fulfillment: Row = {}) {
  return {
    id: "order",
    orderNumber: "DL-20260925-43A434C5",
    status: "FULFILLING",
    fulfillmentMethod: "PICKUP",
    fulfillmentNode: KINOO,
    items: [],
    fulfillment: {
      id: "fulfillment",
      status: "PACKED",
      fulfillmentNodeId: KINOO.id,
      packageCode: "PKG-KINOO-43A434C5",
      packageLabelPrintedAt: null as Date | null,
      ...fulfillment
    }
  };
}

/** Runs every transaction against `tx` and records what it writes. */
function useTransaction(t: TestContext, current: Row | null, order?: Row) {
  const writes: Row[] = [];
  const events: Row[] = [];
  const tx = {
    $queryRaw: async () => [{ id: "order" }],
    order: {
      findUnique: async () => order ?? null,
      update: async () => order ?? {}
    },
    orderFulfillment: {
      findUnique: async () => current,
      update: async ({ data }: { data: Row }) => { writes.push(data); if (current) Object.assign(current, data); return current; }
    },
    fulfillmentEvent: {
      upsert: async ({ create }: { create: Row }) => { events.push(create); return create; },
      create: async ({ data }: { data: Row }) => { events.push(data); return data; }
    },
    notificationOutbox: { create: async () => ({}), upsert: async () => ({}) }
  };
  const original = prisma.$transaction;
  prisma.$transaction = (async (callback: (value: unknown) => unknown) => callback(tx)) as typeof prisma.$transaction;
  t.after(() => { prisma.$transaction = original; });
  return { writes, events };
}

function stubLookups(target: OperationsFulfillmentService, order: ReturnType<typeof packedOrder>) {
  Object.assign(target as unknown as Row, {
    requireOrderWithTask: async () => order,
    assertTransition: () => undefined,
    queueNodeNotification: async () => undefined,
    orderDetail: async () => order
  });
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (caught) {
    return caught as HttpException;
  }
  assert.fail("Expected the call to be refused.");
}

test("发往门店 is refused for a parcel whose label was never printed", async (t) => {
  const order = packedOrder();
  const { writes } = useTransaction(t, { ...order.fulfillment });
  const target = service();
  stubLookups(target, order);

  const error = await rejection(target.sendToNode("order", { adminUserId: "admin" }));
  assert.ok(error instanceof BadRequestException);
  assert.equal((error.getResponse() as Row).code, PACKAGE_LABEL_NOT_PRINTED);
  assert.equal(writes.length, 0, "nothing may be written for a refused send");
});

test("发往门店 goes through once the label is printed", async (t) => {
  const order = packedOrder({ packageLabelPrintedAt: PRINTED_AT });
  const { writes, events } = useTransaction(t, { ...order.fulfillment });
  const target = service();
  stubLookups(target, order);

  await target.sendToNode("order", { adminUserId: "admin" });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].status, "IN_TRANSIT_TO_NODE");
  assert.equal(events[0].action, "SEND_PACKAGE_TO_NODE");
});

test("a re-route that cleared the label between the check and the lock still stops the send", async (t) => {
  const order = packedOrder({ packageLabelPrintedAt: PRINTED_AT });
  const { writes } = useTransaction(t, { ...order.fulfillment, packageLabelPrintedAt: null });
  const target = service();
  stubLookups(target, order);

  const error = await rejection(target.sendToNode("order", { adminUserId: "admin" }));
  assert.equal((error.getResponse() as Row).code, PACKAGE_LABEL_NOT_PRINTED);
  assert.equal(writes.length, 0);
});

test("recording a print needs the packing permission", async (t) => {
  const order = packedOrder();
  const { writes } = useTransaction(t, { ...order.fulfillment });
  const target = service({ admin: ["orders.pack"], viewer: ["orders.view"] });
  stubLookups(target, order);

  const error = await rejection(target.markPackageLabelPrinted("order", { adminUserId: "viewer", packageCode: order.fulfillment.packageCode }));
  assert.ok(error instanceof ForbiddenException);
  assert.equal(writes.length, 0);
});

test("a print is recorded with who printed it, and a reprint just moves the time forward", async (t) => {
  const order = packedOrder();
  const current = { ...order.fulfillment };
  const { writes, events } = useTransaction(t, current);
  const target = service({ packer: ["orders.pack"] });
  stubLookups(target, order);

  const first = await target.markPackageLabelPrinted("order", { adminUserId: "packer", packageCode: "pkg-kinoo-43a434c5" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await target.markPackageLabelPrinted("order", { adminUserId: "packer", packageCode: order.fulfillment.packageCode });

  assert.equal(writes.length, 2);
  assert.equal(writes[0].packageLabelPrintedByEmployeeId, "employee-packer");
  assert.ok(new Date(second.packageLabelPrintedAt) > new Date(first.packageLabelPrintedAt));
  // No state change: printing is a fact about the sticker, not a step.
  assert.equal(current.status, "PACKED");
  assert.deepEqual(events.map((event) => [event.action, event.oldStatus, event.newStatus]), [
    ["PRINT_PACKAGE_LABEL", "PACKED", "PACKED"],
    ["PRINT_PACKAGE_LABEL", "PACKED", "PACKED"]
  ]);
});

test("a label rendered before a re-route cannot vouch for the renamed parcel", async (t) => {
  const order = packedOrder({ packageCode: "PKG-THOGOT-43A434C5" });
  const { writes } = useTransaction(t, { ...order.fulfillment });
  const target = service();
  stubLookups(target, order);

  const error = await rejection(target.markPackageLabelPrinted("order", { adminUserId: "admin", packageCode: "PKG-KINOO-43A434C5" }));
  assert.ok(error instanceof ConflictException);
  assert.equal(writes.length, 0);
});

test("a parcel with no package code has no label to record", async (t) => {
  const order = packedOrder({ packageCode: null });
  useTransaction(t, { ...order.fulfillment });
  const target = service();
  stubLookups(target, order);

  const error = await rejection(target.markPackageLabelPrinted("order", { adminUserId: "admin" }));
  assert.ok(error instanceof BadRequestException);
});

/** Routes a packed delivery order and reports what was written to its fulfillment record. */
async function assign(t: TestContext, node: typeof KINOO, fulfillment: Row) {
  const order = {
    id: "order",
    orderNumber: "DL-20260925-43A434C5",
    fulfillmentMethod: "KIKUYU_LOCAL_DELIVERY",
    fulfillment: { id: "fulfillment", status: "PACKED", fulfillmentNodeId: null, packageCode: null, packageLabelPrintedAt: null, ...fulfillment }
  };
  const { writes } = useTransaction(t, { ...order.fulfillment }, order);
  const original = prisma.fulfillmentNode.findUnique;
  prisma.fulfillmentNode.findUnique = (async () => node) as unknown as typeof prisma.fulfillmentNode.findUnique;
  t.after(() => { prisma.fulfillmentNode.findUnique = original; });
  const target = service();
  Object.assign(target as unknown as Row, { orderDetail: async () => order });
  await target.assignNode("order", { adminUserId: "admin", nodeId: node.id });
  assert.equal(writes.length, 1);
  return writes[0];
}

test("routing a packed delivery order through a store mints its package code there and then", async (t) => {
  // Without this the parcel could not be labelled until it was sent, and it
  // cannot be sent until it is labelled.
  const write = await assign(t, KINOO, {});
  assert.equal(write.packageCode, "PKG-KINOO-43A434C5");
  assert.equal(write.fulfillmentNodeId, KINOO.id);
  assert.equal(write.packageLabelPrintedAt, null);
});

test("re-routing to another store renames the parcel and asks for a new label", async (t) => {
  const write = await assign(t, THOGOTO, {
    fulfillmentNodeId: KINOO.id,
    packageCode: "PKG-KINOO-43A434C5",
    packageLabelPrintedAt: PRINTED_AT
  });
  assert.equal(write.packageCode, "PKG-THOGOT-43A434C5");
  assert.equal(write.packageLabelPrintedAt, null);
  assert.equal(write.packageLabelPrintedByEmployeeId, null);
});

test("re-confirming the same store keeps the label that is already on the box", async (t) => {
  const write = await assign(t, KINOO, {
    fulfillmentNodeId: KINOO.id,
    packageCode: "PKG-KINOO-43A434C5",
    packageLabelPrintedAt: PRINTED_AT
  });
  assert.equal("packageLabelPrintedAt" in write, false);
});
