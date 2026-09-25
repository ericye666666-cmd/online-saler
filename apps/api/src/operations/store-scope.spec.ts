import "reflect-metadata";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@online-saler/database";
import type { OperationsAccessService } from "./operations-access.service";
import { OperationsFulfillmentController } from "./operations-fulfillment.controller";
import { OperationsFulfillmentService, nodeWhere } from "./operations-fulfillment.service";
import type { ProductImageStorageService } from "../product/product-image-storage.service";

/**
 * Store staff see their own store and nothing else.
 *
 * An account whose linked employee has a home store (归属门店 on 账号管理) is
 * confined to it on the server: the list, the tab counts, the node list, an
 * order's detail and every order action. An account with no home store is
 * warehouse or head office and sees everything. A home node that is the
 * warehouse is not a store and does not confine.
 */

const NODES: Record<string, { id: string; name: string; type: string }> = {
  "node-kinoo": { id: "node-kinoo", name: "Kinoo", type: "STORE" },
  "node-thogoto": { id: "node-thogoto", name: "Thogoto", type: "STORE" },
  "node-kikuyu": { id: "node-kikuyu", name: "Kikuyu Warehouse", type: "WAREHOUSE" }
};

function sessionFor(homeNodeId: string | null) {
  return {
    adminUser: { id: "admin", linkedEmployee: { id: "employee", homeNodeId } },
    permissions: ["orders.view", "nodes.view"]
  };
}

function access(homeNodeId: string | null) {
  const session = sessionFor(homeNodeId);
  return {
    requirePermission: async () => session,
    session: async () => session,
    hasPermission: async () => true,
    requireAccessToken: async () => "admin"
  } as unknown as OperationsAccessService;
}

/** Stubs the database reads the scoped paths make and records the wheres. */
function stubPrisma(t: TestContext, orders: Array<{ id: string; fulfillmentNodeId: string | null; fulfillment: { fulfillmentNodeId: string | null } | null }> = []) {
  const wheres: { orders: unknown[]; nodes: unknown[] } = { orders: [], nodes: [] };
  const originals = {
    nodeFindUnique: prisma.fulfillmentNode.findUnique,
    nodeFindMany: prisma.fulfillmentNode.findMany,
    orderFindMany: prisma.order.findMany,
    orderFindUnique: prisma.order.findUnique
  };
  prisma.fulfillmentNode.findUnique = (async ({ where }: { where: { id: string } }) => NODES[where.id] ?? null) as unknown as typeof prisma.fulfillmentNode.findUnique;
  prisma.fulfillmentNode.findMany = (async ({ where }: { where: unknown }) => { wheres.nodes.push(where); return []; }) as unknown as typeof prisma.fulfillmentNode.findMany;
  prisma.order.findMany = (async ({ where }: { where: unknown }) => { wheres.orders.push(where); return []; }) as unknown as typeof prisma.order.findMany;
  prisma.order.findUnique = (async ({ where }: { where: { id: string } }) => orders.find((order) => order.id === where.id) ?? null) as unknown as typeof prisma.order.findUnique;
  t.after(() => {
    prisma.fulfillmentNode.findUnique = originals.nodeFindUnique;
    prisma.fulfillmentNode.findMany = originals.nodeFindMany;
    prisma.order.findMany = originals.orderFindMany;
    prisma.order.findUnique = originals.orderFindUnique;
  });
  return wheres;
}

function service(homeNodeId: string | null) {
  const orders = new OperationsFulfillmentService(access(homeNodeId), {} as ProductImageStorageService);
  Object.assign(orders as unknown as Record<string, unknown>, {
    ensurePaidFulfillments: async () => undefined,
    attachInventory: async (rows: unknown[]) => rows
  });
  return orders;
}

const KINOO_PARCEL = { id: "kinoo-order", fulfillmentNodeId: "node-kinoo", fulfillment: { fulfillmentNodeId: "node-kinoo" } };
const THOGOTO_PARCEL = { id: "thogoto-order", fulfillmentNodeId: "node-thogoto", fulfillment: { fulfillmentNodeId: "node-thogoto" } };

/** Whether a recorded order-list where narrows to this node. */
function narrowsTo(where: unknown, nodeId: string) {
  return JSON.stringify(where).includes(JSON.stringify(nodeWhere(nodeId)));
}

test("a store account's order list is its own store, even when the screen asks for nothing", async (t) => {
  const wheres = stubPrisma(t);
  await service("node-kinoo").listOrders({ adminUserId: "admin", scope: "all" });
  assert.equal(narrowsTo(wheres.orders[0], "node-kinoo"), true);
});

test("a store account asking for another store's list is refused", async (t) => {
  stubPrisma(t);
  await assert.rejects(
    service("node-kinoo").listOrders({ adminUserId: "admin", scope: "all", nodeId: "node-thogoto" }),
    ForbiddenException
  );
  await assert.rejects(
    service("node-kinoo").summary({ adminUserId: "admin", nodeId: "node-thogoto" }),
    ForbiddenException
  );
});

test("a store account's tab counts are its own store's", async (t) => {
  const wheres = stubPrisma(t);
  await service("node-kinoo").summary({ adminUserId: "admin" });
  assert.equal(narrowsTo(wheres.orders[0], "node-kinoo"), true);
});

test("an account with no home store lists every store, or the one it picks", async (t) => {
  const wheres = stubPrisma(t);
  await service(null).listOrders({ adminUserId: "admin", scope: "all" });
  assert.equal(JSON.stringify(wheres.orders[0]).includes("fulfillmentNodeId"), false);
  await service(null).listOrders({ adminUserId: "admin", scope: "all", nodeId: "node-thogoto" });
  assert.equal(narrowsTo(wheres.orders[1], "node-thogoto"), true);
});

test("a warehouse home node is head office, not a store, and is not confined", async (t) => {
  const wheres = stubPrisma(t);
  await service("node-kikuyu").listOrders({ adminUserId: "admin", scope: "all", nodeId: "node-thogoto" });
  assert.equal(narrowsTo(wheres.orders[0], "node-thogoto"), true);
});

test("the node list offers a store account its own store only", async (t) => {
  const wheres = stubPrisma(t);
  await service("node-kinoo").nodes("admin");
  await service(null).nodes("admin");
  assert.deepEqual(wheres.nodes[0], { status: "ACTIVE", id: "node-kinoo" });
  assert.deepEqual(wheres.nodes[1], { status: "ACTIVE" });
});

test("an order action on another store's parcel is refused; on its own it is allowed", async (t) => {
  stubPrisma(t, [KINOO_PARCEL, THOGOTO_PARCEL]);
  const kinoo = service("node-kinoo");
  await assert.rejects(kinoo.assertOrderInStoreScope("thogoto-order", "admin"), ForbiddenException);
  await kinoo.assertOrderInStoreScope("kinoo-order", "admin");
  // A task that has not had its node copied on yet is judged by the order's.
  stubPrisma(t, [{ id: "legacy", fulfillmentNodeId: "node-kinoo", fulfillment: { fulfillmentNodeId: null } }]);
  await kinoo.assertOrderInStoreScope("legacy", "admin");
});

test("an unrestricted account may act on any store's parcel", async (t) => {
  stubPrisma(t, [KINOO_PARCEL, THOGOTO_PARCEL]);
  await service(null).assertOrderInStoreScope("thogoto-order", "admin");
  await service(null).assertOrderInStoreScope("kinoo-order", "admin");
});

test("a store account cannot open another store's order", async (t) => {
  stubPrisma(t);
  const kinoo = service("node-kinoo");
  Object.assign(kinoo as unknown as Record<string, unknown>, {
    requireOrder: async (id: string) => (id === THOGOTO_PARCEL.id ? THOGOTO_PARCEL : KINOO_PARCEL)
  });
  await assert.rejects(kinoo.orderDetail(THOGOTO_PARCEL.id, "admin"), ForbiddenException);
  assert.equal((await kinoo.orderDetail(KINOO_PARCEL.id, "admin") as { id: string }).id, KINOO_PARCEL.id);
});

test("every order action route checks the store before it acts", async () => {
  // Receiving is the example; the controller routes every :orderId action
  // through the same helper, so the check cannot be forgotten on one of them.
  const calls: string[] = [];
  const orders = {
    assertOrderInStoreScope: async (orderId: string) => {
      if (orderId === "thogoto-order") throw new ForbiddenException("other store");
    },
    receiveAtNode: async (orderId: string) => { calls.push(orderId); return { id: orderId }; }
  } as unknown as OperationsFulfillmentService;
  const controller = new OperationsFulfillmentController(orders, access("node-kinoo"));

  await assert.rejects(controller.receiveAtNode("Bearer token", "thogoto-order", {}), ForbiddenException);
  assert.deepEqual(calls, []);
  await controller.receiveAtNode("Bearer token", "kinoo-order", {});
  assert.deepEqual(calls, ["kinoo-order"]);

  const source = readFileSync(join(__dirname, "operations-fulfillment.controller.ts"), "utf8");
  const routes = source.match(/@Post\(":orderId[^\n]*\n[^\n]*\n[^\n]*\n/g) ?? [];
  assert.ok(routes.length >= 20);
  for (const route of routes) assert.match(route, /this\.scopedInput\(authorization, orderId, /, route);
});
