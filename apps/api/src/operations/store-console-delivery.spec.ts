import "reflect-metadata";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { FulfillmentStatus, OrderStatus, prisma } from "@online-saler/database";
import type { OperationsAccessService } from "./operations-access.service";
import { OperationsFulfillmentController } from "./operations-fulfillment.controller";
import { NODE_DESK_STATUSES, OperationsFulfillmentService } from "./operations-fulfillment.service";
import type { ProductImageStorageService } from "../product/product-image-storage.service";

/**
 * A home-delivery order the warehouse routes through a store (指定中转点 on a
 * packed parcel, 打印面单, 发往门店) has to show up on that store's phone
 * console exactly like a pickup parcel does, and after it is signed for it has
 * to be handed to one of the store's own riders through the same one-step
 * dispatch the desktop desk uses.
 *
 * The parcel went missing because the store screens asked for scope=all: every
 * order that ever named the store, newest first, cut off at 150. A pickup order
 * names its store from checkout, paid or not, so a store's abandoned pickup
 * checkouts pushed the older delivery order — created days before it was routed
 * and sent — off the end of the list.
 */

type Row = {
  id: string;
  createdAt: Date;
  status: OrderStatus;
  fulfillmentMethod: "PICKUP" | "KIKUYU_LOCAL_DELIVERY";
  fulfillmentNodeId: string | null;
  fulfillment: { status: FulfillmentStatus; fulfillmentNodeId: string | null } | null;
};

/** Just enough of Prisma's filter semantics for the order-list wheres. */
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(where)) {
    if (key === "AND") {
      if (!(value as Record<string, unknown>[]).every((entry) => matches(row, entry))) return false;
    } else if (key === "OR") {
      if (!(value as Record<string, unknown>[]).some((entry) => matches(row, entry))) return false;
    } else if (key === "fulfillment") {
      const relation = value as { is: Record<string, unknown> | null };
      const related = row.fulfillment as Record<string, unknown> | null;
      if (relation.is === null ? related !== null : !related || !matches(related, relation.is)) return false;
    } else if (value !== null && typeof value === "object") {
      const filter = value as { in?: unknown[] };
      if (filter.in && !filter.in.includes(row[key])) return false;
    } else if (row[key] !== value) {
      return false;
    }
  }
  return true;
}

const KINOO = "node-kinoo";

/**
 * Kinoo's world: 200 pickup checkouts newer than the delivery order (most never
 * paid, so no fulfillment task), one delivery order created earlier and routed
 * to Kinoo after packing, now on its way, and a pickup parcel on its way too.
 */
function kinooOrders(): Row[] {
  const rows: Row[] = [];
  const base = Date.parse("2026-09-20T08:00:00Z");
  rows.push({
    id: "delivery-routed-after-packing",
    createdAt: new Date(base),
    status: OrderStatus.FULFILLING,
    fulfillmentMethod: "KIKUYU_LOCAL_DELIVERY",
    // assign-node writes both columns; send-to-node writes the task's again.
    fulfillmentNodeId: KINOO,
    fulfillment: { status: FulfillmentStatus.IN_TRANSIT_TO_NODE, fulfillmentNodeId: KINOO }
  });
  rows.push({
    id: "pickup-on-the-way",
    createdAt: new Date(base + 1_000),
    status: OrderStatus.FULFILLING,
    fulfillmentMethod: "PICKUP",
    fulfillmentNodeId: KINOO,
    fulfillment: { status: FulfillmentStatus.IN_TRANSIT_TO_NODE, fulfillmentNodeId: KINOO }
  });
  for (let index = 0; index < 200; index += 1) {
    rows.push({
      id: `pickup-checkout-${index}`,
      createdAt: new Date(base + 60_000 * (index + 2)),
      status: index % 2 ? OrderStatus.EXPIRED : OrderStatus.CANCELLED,
      fulfillmentMethod: "PICKUP",
      fulfillmentNodeId: KINOO,
      fulfillment: null
    });
  }
  // A delivery routed through Kinoo whose task predates the node being copied
  // onto it: the list falls back to the order's own node.
  rows.push({
    id: "delivery-task-without-node",
    createdAt: new Date(base - 1_000),
    status: OrderStatus.FULFILLING,
    fulfillmentMethod: "KIKUYU_LOCAL_DELIVERY",
    fulfillmentNodeId: KINOO,
    fulfillment: { status: FulfillmentStatus.IN_TRANSIT_TO_NODE, fulfillmentNodeId: null }
  });
  // Another store's parcel never reaches Kinoo's list.
  rows.push({
    id: "thogoto-delivery",
    createdAt: new Date(base),
    status: OrderStatus.FULFILLING,
    fulfillmentMethod: "KIKUYU_LOCAL_DELIVERY",
    fulfillmentNodeId: "node-thogoto",
    fulfillment: { status: FulfillmentStatus.IN_TRANSIT_TO_NODE, fulfillmentNodeId: "node-thogoto" }
  });
  return rows;
}

function storeStaffSession() {
  return {
    adminUser: { id: "admin", linkedEmployee: { id: "employee", homeNodeId: KINOO } },
    permissions: ["orders.view", "orders.dispatch", "orders.node-receive", "orders.complete", "riders.view"]
  };
}

function stubOrderList(t: TestContext, rows: Row[]) {
  const originals = {
    findMany: prisma.order.findMany,
    nodeFindUnique: prisma.fulfillmentNode.findUnique
  };
  // Behaves like Postgres for this query: filter, newest first, then take.
  prisma.order.findMany = (async ({ where, take }: { where: Record<string, unknown>; take?: number }) =>
    rows
      .filter((row) => matches(row as unknown as Record<string, unknown>, where))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, take ?? rows.length)) as unknown as typeof prisma.order.findMany;
  prisma.fulfillmentNode.findUnique = (async ({ where }: { where: { id: string } }) =>
    ({ id: where.id, name: where.id === KINOO ? "Kinoo" : "Thogoto", type: "STORE" })) as unknown as typeof prisma.fulfillmentNode.findUnique;
  t.after(() => {
    prisma.order.findMany = originals.findMany;
    prisma.fulfillmentNode.findUnique = originals.nodeFindUnique;
  });
}

function listService() {
  const session = storeStaffSession();
  const service = new OperationsFulfillmentService({
    requirePermission: async () => session,
    session: async () => session
  } as unknown as OperationsAccessService, {} as ProductImageStorageService);
  Object.assign(service as unknown as Record<string, unknown>, {
    ensurePaidFulfillments: async () => undefined,
    attachInventory: async (rows: unknown[]) => rows
  });
  return service;
}

test("a delivery order routed to the store after packing is on the store's en-route list", async (t) => {
  stubOrderList(t, kinooOrders());
  const listed = await listService().listOrders({ adminUserId: "admin", scope: "node", nodeId: KINOO }) as unknown as Row[];
  const onTheWay = listed.filter((row) => row.fulfillment?.status === FulfillmentStatus.IN_TRANSIT_TO_NODE).map((row) => row.id);

  assert.ok(onTheWay.includes("delivery-routed-after-packing"), "the routed delivery parcel is listed");
  assert.ok(onTheWay.includes("delivery-task-without-node"), "falls back to the order's node");
  assert.ok(onTheWay.includes("pickup-on-the-way"), "pickup parcels still listed");
  assert.ok(!onTheWay.includes("thogoto-delivery"), "another store's parcel is not");
  assert.ok(listed.every((row) => row.fulfillment && NODE_DESK_STATUSES.includes(row.fulfillment.status)), "only desk parcels");
});

test("scope=all is what lost it: old pickup checkouts fill the 150 rows first", async (t) => {
  stubOrderList(t, kinooOrders());
  const listed = await listService().listOrders({ adminUserId: "admin", scope: "all", nodeId: KINOO }) as unknown as Row[];
  assert.equal(listed.length, 150);
  assert.ok(!listed.some((row) => row.id === "delivery-routed-after-packing"), "the cause this fix removes");
});

test("a store account asking for the node desk is still held to its own store", async (t) => {
  stubOrderList(t, kinooOrders());
  const listed = await listService().listOrders({ adminUserId: "admin", scope: "node" }) as unknown as Row[];
  assert.ok(listed.length > 0);
  assert.ok(listed.every((row) => (row.fulfillment?.fulfillmentNodeId ?? row.fulfillmentNodeId) === KINOO));
  await assert.rejects(
    () => listService().listOrders({ adminUserId: "admin", scope: "node", nodeId: "node-thogoto" }),
    ForbiddenException
  );
});

// ------------------------------------------------ hand-off from the console ---

/** The console's rider button posts to dispatch-to-rider, the desk's one-step hand-off. */
function dispatchFixture(t: TestContext, options: { status: string; riderNodeId: string; orderNodeId?: string }) {
  const writes: Array<Record<string, unknown>> = [];
  const notifications: Array<Record<string, unknown>> = [];
  const orderNodeId = options.orderNodeId ?? KINOO;
  const fulfillmentRow = {
    id: "fulfillment",
    status: options.status,
    fulfillmentNodeId: orderNodeId,
    readyForDispatchAt: null,
    deliveryAttemptCount: 0,
    deliveryCodeSentCount: 0
  };
  const order = {
    id: "delivery-routed-after-packing",
    orderNumber: "DL-2001",
    whatsappPhone: null,
    customer: { displayName: "Wanjiku", phone: "0712345678" },
    fulfillmentMethod: "KIKUYU_LOCAL_DELIVERY",
    fulfillmentNodeId: orderNodeId,
    fulfillmentNode: { id: orderNodeId, type: "STORE", name: "Kinoo" },
    items: [],
    fulfillment: { ...fulfillmentRow, fulfillmentNode: { id: orderNodeId, type: "STORE" }, deliveryAssignments: [], items: [] }
  };
  const tx = {
    $queryRaw: async () => [],
    order: { findUnique: async () => order },
    orderFulfillment: {
      findUnique: async () => fulfillmentRow,
      update: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); return fulfillmentRow; }
    },
    deliveryAssignment: { create: async () => ({ id: "assignment" }) },
    notification: { create: async ({ data }: { data: Record<string, unknown> }) => { notifications.push(data); return data; } },
    fulfillmentEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => data,
      upsert: async ({ create }: { create: Record<string, unknown> }) => create
    }
  };
  const originals = {
    transaction: prisma.$transaction,
    rider: prisma.deliveryRider.findUnique,
    orderFindUnique: prisma.order.findUnique,
    nodeFindUnique: prisma.fulfillmentNode.findUnique,
    employee: prisma.employee.findUnique
  };
  prisma.$transaction = (async (callback: (value: unknown) => unknown) => callback(tx)) as typeof prisma.$transaction;
  prisma.deliveryRider.findUnique = (async () => ({
    id: "rider-kinoo", name: "Kamau", phone: "0711000222", active: true, fulfillmentNodeId: options.riderNodeId, employeeId: null
  })) as unknown as typeof prisma.deliveryRider.findUnique;
  prisma.order.findUnique = (async () => ({ fulfillmentNodeId: orderNodeId, fulfillment: { fulfillmentNodeId: orderNodeId } })) as unknown as typeof prisma.order.findUnique;
  prisma.fulfillmentNode.findUnique = (async () => ({ id: KINOO, name: "Kinoo", type: "STORE" })) as unknown as typeof prisma.fulfillmentNode.findUnique;
  prisma.employee.findUnique = (async () => ({ homeNodeId: KINOO })) as unknown as typeof prisma.employee.findUnique;
  t.after(() => {
    prisma.$transaction = originals.transaction;
    prisma.deliveryRider.findUnique = originals.rider;
    prisma.order.findUnique = originals.orderFindUnique;
    prisma.fulfillmentNode.findUnique = originals.nodeFindUnique;
    prisma.employee.findUnique = originals.employee;
  });

  const session = storeStaffSession();
  const access = {
    requirePermission: async () => session,
    session: async () => session,
    requireAccessToken: async () => "admin"
  } as unknown as OperationsAccessService;
  const service = new OperationsFulfillmentService(access, {} as ProductImageStorageService);
  Object.assign(service as unknown as Record<string, unknown>, {
    requireOrderWithTask: async () => order,
    orderDetail: async () => ({ id: order.id })
  });
  const controller = new OperationsFulfillmentController(service, access);
  return { controller, writes, notifications };
}

test("store staff hand a signed-for delivery parcel to their own rider in one step", async (t) => {
  const h = dispatchFixture(t, { status: "ARRIVED_AT_NODE", riderNodeId: KINOO });
  await h.controller.dispatchToRider("Bearer token", "delivery-routed-after-packing", { deliveryRiderId: "rider-kinoo", riderFeeKsh: 100 });

  const out = h.writes.find((data) => data.status === FulfillmentStatus.OUT_FOR_DELIVERY);
  assert.ok(out, "the parcel goes out for delivery");
  assert.equal(out!.deliveryRiderId, "rider-kinoo", "assigned to the store's rider, so the rider app lists it");
  assert.equal(out!.riderFeeKsh, 100, "the rider pay chosen on the console is stored with the hand-off");
  assert.ok(typeof out!.deliveryCodeHash === "string", "a delivery code is minted");
  assert.ok(typeof out!.deliveryCode === "string", "the customer's order page has its copy");
  assert.ok(h.writes.some((data) => data.status === FulfillmentStatus.READY_FOR_DISPATCH), "passes through ready-for-dispatch");
  assert.ok(h.notifications.length > 0, "the customer's message is queued");
});

test("a rider from another store is refused", async (t) => {
  const h = dispatchFixture(t, { status: "ARRIVED_AT_NODE", riderNodeId: "node-thogoto" });
  await assert.rejects(
    () => h.controller.dispatchToRider("Bearer token", "delivery-routed-after-packing", { deliveryRiderId: "rider-kinoo" }),
    /rides for a different node/
  );
  assert.equal(h.writes.length, 0);
});

test("a store account cannot hand over another store's parcel", async (t) => {
  const h = dispatchFixture(t, { status: "ARRIVED_AT_NODE", riderNodeId: "node-thogoto", orderNodeId: "node-thogoto" });
  await assert.rejects(
    () => h.controller.dispatchToRider("Bearer token", "delivery-routed-after-packing", { deliveryRiderId: "rider-kinoo" }),
    ForbiddenException
  );
});
