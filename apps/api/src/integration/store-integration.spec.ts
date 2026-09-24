import "reflect-metadata";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { prisma } from "@online-saler/database";
import { assertStoreIntegrationKey, storeActorNote } from "./store-integration-auth";
import { StoreIntegrationService } from "./store-integration.service";
import type { OperationsFulfillmentService } from "../operations/operations-fulfillment.service";

/**
 * What a store may reach through the ERP integration, and what it may not.
 *
 * The shared key says "the store system is calling". It never says which store,
 * so every one of these tests is really the same question: can the store code in
 * the path reach a package that belongs to a different node?
 */

const KINOO = { id: "node-kinoo", code: "kinoo", name: "Kinoo", status: "ACTIVE" };
const UTAWALA = { id: "node-utawala", code: "utawala", name: "Utawala", status: "ACTIVE" };

function withKey(t: TestContext, key: string | undefined) {
  const original = process.env.STORE_INTEGRATION_KEY;
  if (key === undefined) delete process.env.STORE_INTEGRATION_KEY;
  else process.env.STORE_INTEGRATION_KEY = key;
  t.after(() => {
    if (original === undefined) delete process.env.STORE_INTEGRATION_KEY;
    else process.env.STORE_INTEGRATION_KEY = original;
  });
}

function fixture(
  t: TestContext,
  options: { packageNodeId?: string; riderNodeId?: string; nodeStatus?: string } = {}
) {
  const calls: Array<{ method: string; orderId: string; input: Record<string, unknown> }> = [];
  const record = (method: string) => async (orderId: string, input: Record<string, unknown>) => {
    calls.push({ method, orderId, input });
    return {};
  };
  const fulfillment = {
    receiveAtNode: record("receiveAtNode"),
    dispatchToRider: record("dispatchToRider"),
    confirmPickup: record("confirmPickup"),
    confirmReturnAtNode: record("confirmReturnAtNode"),
    markDeliveryFailed: record("markDeliveryFailed")
  } as unknown as OperationsFulfillmentService;

  const nodes: Record<string, unknown> = {
    kinoo: { ...KINOO, status: options.nodeStatus ?? "ACTIVE" },
    utawala: UTAWALA
  };

  const originals = {
    node: prisma.fulfillmentNode.findUnique,
    fulfillment: prisma.orderFulfillment.findUnique,
    order: prisma.order.findUnique,
    orders: prisma.order.findMany,
    rider: prisma.deliveryRider.findFirst,
    riders: prisma.deliveryRider.findMany,
    admin: prisma.adminUser.findUnique
  };

  prisma.fulfillmentNode.findUnique = (async ({ where }: { where: { code: string } }) =>
    nodes[where.code] ?? null) as unknown as typeof prisma.fulfillmentNode.findUnique;
  prisma.orderFulfillment.findUnique = (async () => ({
    id: "fulfillment",
    fulfillmentNodeId: options.packageNodeId ?? KINOO.id,
    status: "IN_TRANSIT_TO_NODE"
  })) as unknown as typeof prisma.orderFulfillment.findUnique;
  prisma.order.findUnique = (async () => orderRow(options.packageNodeId ?? KINOO.id)) as unknown as typeof prisma.order.findUnique;
  prisma.order.findMany = (async () => [orderRow(KINOO.id)]) as unknown as typeof prisma.order.findMany;
  prisma.deliveryRider.findFirst = (async ({ where }: { where: { fulfillmentNodeId?: string } }) =>
    where.fulfillmentNodeId === (options.riderNodeId ?? KINOO.id)
      ? { id: "rider-1" }
      : null) as unknown as typeof prisma.deliveryRider.findFirst;
  prisma.deliveryRider.findMany = (async () => [
    { id: "rider-1", name: "Peter", phone: "0722000111" }
  ]) as unknown as typeof prisma.deliveryRider.findMany;
  prisma.adminUser.findUnique = (async () => ({ id: "service-admin" })) as unknown as typeof prisma.adminUser.findUnique;

  const originalLogin = process.env.STORE_INTEGRATION_ADMIN_LOGIN;
  process.env.STORE_INTEGRATION_ADMIN_LOGIN = "store-integration";

  t.after(() => {
    prisma.fulfillmentNode.findUnique = originals.node;
    prisma.orderFulfillment.findUnique = originals.fulfillment;
    prisma.order.findUnique = originals.order;
    prisma.order.findMany = originals.orders;
    prisma.deliveryRider.findFirst = originals.rider;
    prisma.deliveryRider.findMany = originals.riders;
    prisma.adminUser.findUnique = originals.admin;
    if (originalLogin === undefined) delete process.env.STORE_INTEGRATION_ADMIN_LOGIN;
    else process.env.STORE_INTEGRATION_ADMIN_LOGIN = originalLogin;
  });

  return { service: new StoreIntegrationService(fulfillment), calls };
}

function orderRow(nodeId: string) {
  return {
    id: "order",
    orderNumber: "DL-10281",
    fulfillmentMethod: "KIKUYU_LOCAL_DELIVERY",
    deliveryAddress: "Kinoo, near the stage",
    deliveryNote: null,
    createdAt: new Date("2026-09-23T10:00:00Z"),
    customer: { displayName: "Wanjiku", phone: "0712345678" },
    items: [{ snapshot: { title: "Denim jacket", sizeLabel: "M" } }],
    fulfillment: {
      packageCode: "PKG-KINOO-10281",
      status: "IN_TRANSIT_TO_NODE",
      fulfillmentNodeId: nodeId,
      deliveryRiderName: null,
      sentToNodeAt: new Date("2026-09-23T09:00:00Z"),
      arrivedAtNodeAt: null,
      outForDeliveryAt: null,
      deliveryAttemptCount: 0,
      deliveryFailureReason: null,
      customerCodeLockedAt: null,
      fulfillmentNode: { name: nodeId === KINOO.id ? "Kinoo" : "Utawala" }
    }
  };
}

// ------------------------------------------------------------------- the key ---

test("with no key configured the integration is closed, not open", (t) => {
  withKey(t, undefined);
  assert.throws(() => assertStoreIntegrationKey("anything"), /not configured/);
  assert.throws(() => assertStoreIntegrationKey(undefined), /not configured/);
});

test("a wrong or missing key is refused", (t) => {
  withKey(t, "the-real-key");
  assert.throws(() => assertStoreIntegrationKey("the-wrong-key"), /missing or wrong/);
  assert.throws(() => assertStoreIntegrationKey(""), /missing or wrong/);
  assert.throws(() => assertStoreIntegrationKey(undefined), /missing or wrong/);
  // A prefix of the real key must not pass either.
  assert.throws(() => assertStoreIntegrationKey("the-real"), /missing or wrong/);
});

test("the configured key is accepted", (t) => {
  withKey(t, "the-real-key");
  assert.doesNotThrow(() => assertStoreIntegrationKey("the-real-key"));
  assert.doesNotThrow(() => assertStoreIntegrationKey("  the-real-key  "));
});

// ----------------------------------------------------------- the store border ---

test("a store cannot act on another store's package, even naming its order id", async (t) => {
  // The parcel is Kinoo's; Utawala is asking.
  const h = fixture(t, { packageNodeId: KINOO.id });
  for (const call of [
    () => h.service.receive("order", { storeCode: "utawala" }),
    () => h.service.dispatch("order", { storeCode: "utawala", deliveryRiderId: "rider-1" }),
    () => h.service.pickup("order", { storeCode: "utawala", pickupCode: "4417" }),
    () => h.service.confirmReturn("order", { storeCode: "utawala" }),
    () => h.service.markFailed("order", { storeCode: "utawala" })
  ]) {
    await assert.rejects(call, /does not belong to your store/);
  }
  assert.equal(h.calls.length, 0, "nothing reached the fulfillment service");
});

test("the wrong-store message says nothing about whether the order exists", async (t) => {
  const h = fixture(t, { packageNodeId: KINOO.id });
  await assert.rejects(
    () => h.service.receive("order", { storeCode: "utawala" }),
    (error: Error) => {
      assert.ok(!error.message.includes("DL-10281"));
      assert.ok(!error.message.includes("Kinoo"));
      return true;
    }
  );
});

test("an unmapped store code is refused", async (t) => {
  const h = fixture(t);
  await assert.rejects(() => h.service.board("nairobi-cbd"), /No fulfillment node is mapped/);
  await assert.rejects(() => h.service.board(""), /store code is required/);
});

test("a closed node cannot be worked", async (t) => {
  const h = fixture(t, { nodeStatus: "INACTIVE" });
  await assert.rejects(() => h.service.board("kinoo"), /not an active fulfillment node/);
});

test("a store may only dispatch to its own riders", async (t) => {
  // The rider rides for Utawala; Kinoo is trying to use them.
  const h = fixture(t, { packageNodeId: KINOO.id, riderNodeId: UTAWALA.id });
  await assert.rejects(
    () => h.service.dispatch("order", { storeCode: "kinoo", deliveryRiderId: "rider-1" }),
    /does not ride for your store/
  );
  assert.equal(h.calls.length, 0);
});

test("dispatch needs a rider chosen", async (t) => {
  const h = fixture(t);
  await assert.rejects(() => h.service.dispatch("order", { storeCode: "kinoo" }), /Choose a rider/);
});

// ------------------------------------------------------------ what is exposed ---

test("nothing a store is shown mentions money", async (t) => {
  const h = fixture(t);
  const board = await h.service.board("kinoo");
  const json = JSON.stringify(board);
  for (const forbidden of ["totalKsh", "deliveryFeeKsh", "commission", "itemSubtotal", "unitPrice", "affiliate"]) {
    assert.ok(!json.includes(forbidden), `${forbidden} must not reach a shop floor screen`);
  }
});

test("no delivery code or hash is ever returned", async (t) => {
  const h = fixture(t);
  const json = JSON.stringify(await h.service.board("kinoo"));
  assert.ok(!json.includes("deliveryCodeHash"));
  assert.ok(!json.includes("pbkdf2"));
  assert.ok(!json.includes("pickupCode"));
});

test("a store sees the customer's full phone, in both the new and the legacy field", async (t) => {
  // Customer-info masking was removed on 2026-09-24. maskedCustomerPhone stays
  // in the payload as a deprecated alias so FW-ERP's parser does not break, but
  // it carries the same full number as customerPhone.
  const h = fixture(t);
  const [row] = (await h.service.board("kinoo")).incoming;
  assert.equal(row.customerName, "Wanjiku");
  assert.equal(row.customerPhone, "0712345678");
  assert.equal(row.maskedCustomerPhone, "0712345678");
  assert.equal(row.deliveryAddress, "Kinoo, near the stage");
  assert.ok(!JSON.stringify(row).includes("•"), "no masked digits anywhere");
});

test("the board only carries this node's packages, in the piles a store thinks in", async (t) => {
  const h = fixture(t);
  const board = await h.service.board("kinoo");
  assert.equal(board.store.code, "kinoo");
  assert.equal(board.incoming.length, 1);
  assert.equal(board.atStore.length, 0);
  assert.equal(board.inFlight.length, 0);
  assert.equal(board.counts.incoming, 1);
  assert.equal(board.incoming[0].packageCode, "PKG-KINOO-10281");
});

test("a scan of another store's parcel warns instead of quietly failing", async (t) => {
  const h = fixture(t);
  const originalFindFirst = prisma.order.findFirst;
  prisma.order.findFirst = (async () => orderRow(UTAWALA.id)) as unknown as typeof prisma.order.findFirst;
  t.after(() => { prisma.order.findFirst = originalFindFirst; });
  const result = await h.service.scan("kinoo", "pkg-utawala-10999");
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "WRONG_NODE");
  assert.match(result.ok === false ? result.message : "", /Do not receive it/);
});

// ------------------------------------------------------------- who did it ------

test("the acting clerk is written into the event note", async (t) => {
  const h = fixture(t);
  await h.service.receive("order", { storeCode: "kinoo", staffName: "Grace", staffId: "EMP-204" });
  assert.equal(h.calls[0].method, "receiveAtNode");
  assert.match(String(h.calls[0].input.note), /KINOO store system — Grace \(EMP-204\)/);
});

test("an unnamed clerk still records which store system acted", () => {
  const note = storeActorNote({ staffName: null, staffId: null }, "utawala");
  assert.match(note, /UTAWALA store system — store staff/);
});

test("a clerk's own note is kept alongside the attribution", () => {
  const note = storeActorNote({ staffName: "Grace", staffId: null }, "kinoo", "Box was wet");
  assert.match(note, /^Box was wet — via the KINOO store system — Grace$/);
});

test("every write acts as the configured service account", async (t) => {
  const h = fixture(t);
  await h.service.receive("order", { storeCode: "kinoo", staffName: "Grace" });
  await h.service.confirmReturn("order", { storeCode: "kinoo", staffName: "Grace" });
  for (const call of h.calls) assert.equal(call.input.adminUserId, "service-admin");
});

test("pickup passes the customer's code straight through and nothing else", async (t) => {
  const h = fixture(t);
  await h.service.pickup("order", { storeCode: "kinoo", pickupCode: "4417", staffName: "Grace" });
  assert.equal(h.calls[0].method, "confirmPickup");
  assert.equal(h.calls[0].input.verificationValue, "4417");
  // No verificationMethod override: the service decides that, not the caller.
  assert.equal(h.calls[0].input.verificationMethod, undefined);
});
