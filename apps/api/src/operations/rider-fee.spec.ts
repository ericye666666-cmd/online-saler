import "reflect-metadata";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { hashCustomerCode } from "@online-saler/business-rules";
import { prisma } from "@online-saler/database";
import { OperationsAccessService } from "./operations-access.service";
import { OperationsFulfillmentService } from "./operations-fulfillment.service";
import { ProductImageStorageService } from "../product/product-image-storage.service";
import { requireRiderFee } from "./rider-fee";

/**
 * The owner's rule (2026-09-25): when the store hands a delivery parcel to a
 * rider it chooses this order's rider pay, KSh 50 or KSh 100 — nothing else and
 * no default — and the rider's delivery only counts once the customer's code
 * closes it. The weekly M-Pesa settlement is built on exactly these columns.
 */

const CODE = "5832";
const WRONG = "1111";
type Row = Record<string, unknown>;

function fixture(
  t: TestContext,
  overrides: { status?: string; riderId?: string | null; riderFeeKsh?: number | null; riderFeeSetBy?: string | null } = {}
) {
  const status = overrides.status ?? "ARRIVED_AT_NODE";
  const riderId = overrides.riderId === undefined ? null : overrides.riderId;
  const actor = { actorAdminUserId: "admin", actorEmployeeId: "employee-store" };
  const events: Row[] = [];
  const fulfillmentWrites: Row[] = [];
  const assignments: Row[] = [];

  const fulfillmentRow: Row = {
    id: "fulfillment",
    status,
    deliveryCodeHash: status === "OUT_FOR_DELIVERY" ? hashCustomerCode(CODE) : null,
    customerCodeVerifiedAt: null,
    customerCodeFailedAttempts: 0,
    customerCodeLockedAt: null,
    deliveryCodeSentCount: status === "OUT_FOR_DELIVERY" ? 1 : 0,
    deliveryAttemptCount: status === "OUT_FOR_DELIVERY" ? 1 : 0,
    deliveryRiderId: riderId,
    deliveryRiderName: riderId ? "Peter" : null,
    riderFeeKsh: overrides.riderFeeKsh ?? null,
    riderFeeSetByEmployeeId: overrides.riderFeeSetBy ?? null,
    fulfillmentNodeId: "node-kinoo",
    readyForDispatchAt: null,
    packageCode: "PKG-KINOO-10281"
  };

  const order = {
    id: "order",
    orderNumber: "DL-10281",
    status: "FULFILLING",
    fulfillmentMethod: "KIKUYU_LOCAL_DELIVERY",
    totalKsh: 200,
    pickupCode: null,
    deliveryAddress: "Kinoo, near the stage",
    deliveryNote: null,
    whatsappPhone: null,
    customer: { displayName: "Wanjiku", phone: "0712345678" },
    items: [{ id: "item", productId: "product", snapshot: { title: "Denim jacket", sizeLabel: "M", barcode: "BARCODE" } }],
    fulfillmentNode: { id: "node-kinoo", type: "STORE", name: "Kinoo", phone: null, mapsUrl: null },
    fulfillment: {
      ...fulfillmentRow,
      fulfillmentNode: { id: "node-kinoo", type: "STORE", name: "Kinoo" },
      items: [],
      deliveryAssignments: [],
      deliveryRider: riderId ? { id: riderId, name: "Peter", phone: "0722000111", employeeId: null } : null
    }
  };

  const tx = {
    $queryRaw: async () => [{ id: "order", productId: "product", status: "PACKED", owned: true }],
    order: { findUnique: async () => order, update: async () => order },
    orderItem: {
      findMany: async ({ where }: { where: { orderId?: unknown } }) =>
        typeof where.orderId === "string" ? [{ productId: "product" }] : [],
      findFirst: async () => null
    },
    payment: { findMany: async () => [{ amountKsh: 200 }] },
    inventoryItem: { updateMany: async () => ({ count: 1 }) },
    orderFulfillment: {
      findUnique: async () => fulfillmentRow,
      update: async ({ data }: { data: Row }) => {
        fulfillmentWrites.push(data);
        Object.assign(fulfillmentRow, data);
        return fulfillmentRow;
      }
    },
    customerCodeAttempt: { create: async ({ data }: { data: Row }) => data },
    deliveryAssignment: { create: async ({ data }: { data: Row }) => { assignments.push(data); return { id: "assignment" }; } },
    notification: { create: async ({ data }: { data: Row }) => data },
    fulfillmentEvent: {
      create: async ({ data }: { data: Row }) => { events.push(data); return data; },
      upsert: async ({ create }: { create: Row }) => { events.push(create); return create; }
    }
  };

  const originalTransaction = prisma.$transaction;
  prisma.$transaction = (async (callback: (value: unknown) => unknown) => callback(tx)) as typeof prisma.$transaction;
  const originalRider = prisma.deliveryRider.findUnique;
  prisma.deliveryRider.findUnique = (async () => ({
    id: "rider-1", name: "Peter", active: true, fulfillmentNodeId: "node-kinoo", employeeId: null
  })) as unknown as typeof prisma.deliveryRider.findUnique;
  t.after(() => {
    prisma.$transaction = originalTransaction;
    prisma.deliveryRider.findUnique = originalRider;
  });

  const service = new OperationsFulfillmentService({} as OperationsAccessService, {} as ProductImageStorageService);
  Object.assign(service as unknown as Row, {
    employeeForPermission: async () => actor,
    adminForPermission: async () => actor,
    employeeForAnyPermission: async () => actor,
    employeeBelongsToNode: async () => undefined,
    requireOrderWithTask: async () => order,
    orderDetail: async () => ({ id: "order" }),
    // Bolt riders are looked up or created by name and phone; the row is what matters here.
    externalRider: async (input: { name?: string; phone?: string }) => ({
      id: `bolt-${input.name}`, name: input.name, phone: input.phone, employeeId: null
    })
  });

  return { service, fulfillmentRow, fulfillmentWrites, events, assignments };
}

async function badRequest(promise: Promise<unknown>, pattern: RegExp) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof BadRequestException, `expected 400, got ${String(error)}`);
    assert.match((error as Error).message, pattern);
    return true;
  });
}

const MISSING = /Choose this order's rider pay/;
const INVALID = /must be KSh 50 or KSh 100/;
const rider = { id: "rider-1", name: "Peter", employeeId: null };
const bolt = { riderType: "EXTERNAL" as const, name: "Otieno", phone: "0711222333", company: "Bolt" };

// ------------------------------------------------------------- the two values ---

test("the rider pay is exactly 50 or 100: missing and anything else are 400", () => {
  for (const missing of [undefined, null, ""]) {
    assert.throws(() => requireRiderFee(missing), (error: unknown) => error instanceof BadRequestException && MISSING.test((error as Error).message));
  }
  for (const wrong of [0, 49, 51, 75, 99, 101, 150, -50, 50.5, "abc", "5O", "-50", true, {}, [50]]) {
    assert.throws(() => requireRiderFee(wrong), (error: unknown) => error instanceof BadRequestException && INVALID.test((error as Error).message), String(wrong));
  }
  assert.equal(requireRiderFee(50), 50);
  assert.equal(requireRiderFee(100), 100);
  assert.equal(requireRiderFee("50"), 50, "an integration that sends a string of digits is read the same");
  assert.equal(requireRiderFee(" 100 "), 100);
});

// --------------------------------------------- store rider: dispatch-to-rider ---

test("handing a parcel to a store rider without a fee is refused and writes nothing", async (t) => {
  const h = fixture(t);
  await badRequest(h.service.dispatchToRider("order", { adminUserId: "admin", deliveryRiderId: "rider-1" }), MISSING);
  assert.equal(h.fulfillmentWrites.length, 0);
  assert.equal(h.events.length, 0);
  assert.equal(h.assignments.length, 0);
});

test("handing a parcel to a store rider with 75 is refused", async (t) => {
  const h = fixture(t);
  await badRequest(h.service.dispatchToRider("order", { adminUserId: "admin", deliveryRiderId: "rider-1", riderFeeKsh: 75 }), INVALID);
  assert.equal(h.fulfillmentWrites.length, 0);
});

for (const fee of [50, 100]) {
  test(`KSh ${fee} is stored with the hand-off, with who chose it, and shown on the timeline`, async (t) => {
    const h = fixture(t);
    await h.service.dispatchToRider("order", { adminUserId: "admin", deliveryRiderId: "rider-1", riderFeeKsh: fee });
    const out = h.fulfillmentWrites.find((data) => data.status === "OUT_FOR_DELIVERY");
    assert.ok(out, "the parcel went out");
    assert.equal(out!.riderFeeKsh, fee, "in the same write that moves the parcel out");
    assert.equal(out!.riderFeeSetByEmployeeId, "employee-store");
    assert.equal(out!.deliveryRiderId, "rider-1");
    const event = h.events.find((row) => row.action === "DISPATCH_TO_RIDER");
    assert.match(String(event?.note), new RegExp(`骑手费 KSh ${fee}`));
  });
}

// ------------------------------------------------ Bolt / desk: assign-rider ---

test("assigning a rider without a fee is refused", async (t) => {
  const h = fixture(t, { status: "READY_FOR_DISPATCH" });
  await badRequest(h.service.assignRider("order", { adminUserId: "admin", ...bolt }), MISSING);
  await badRequest(h.service.assignRider("order", { adminUserId: "admin", ...bolt, riderFeeKsh: 80 }), INVALID);
  assert.equal(h.fulfillmentWrites.length, 0);
});

test("assigning a Bolt rider stores the fee and writes it on the timeline", async (t) => {
  const h = fixture(t, { status: "READY_FOR_DISPATCH" });
  await h.service.assignRider("order", { adminUserId: "admin", ...bolt, riderFeeKsh: 100 });
  assert.equal(h.fulfillmentWrites[0]?.riderFeeKsh, 100);
  assert.equal(h.fulfillmentWrites[0]?.riderFeeSetByEmployeeId, "employee-store");
  const event = h.events.find((row) => row.action === "ASSIGN_DELIVERY_RIDER");
  assert.match(String(event?.note), /骑手费 KSh 100/);
});

test("re-assigning a rider has to choose the fee again: the old one is not carried over", async (t) => {
  const h = fixture(t, { status: "READY_FOR_DISPATCH", riderId: "bolt-Kamau", riderFeeKsh: 50, riderFeeSetBy: "employee-earlier" });
  await badRequest(h.service.assignRider("order", { adminUserId: "admin", ...bolt }), MISSING);
  assert.equal(h.fulfillmentWrites.length, 0);

  await h.service.assignRider("order", { adminUserId: "admin", ...bolt, riderFeeKsh: 100 });
  assert.equal(h.fulfillmentWrites[0]?.deliveryRiderId, "bolt-Otieno");
  assert.equal(h.fulfillmentWrites[0]?.riderFeeKsh, 100);
  assert.equal(h.fulfillmentWrites[0]?.riderFeeSetByEmployeeId, "employee-store");
});

test("the same rider re-assigned at a different fee is a change, not a no-op", async (t) => {
  const h = fixture(t, { status: "READY_FOR_DISPATCH", riderId: "bolt-Otieno", riderFeeKsh: 50 });
  await h.service.assignRider("order", { adminUserId: "admin", ...bolt, riderFeeKsh: 100 });
  assert.equal(h.fulfillmentWrites[0]?.riderFeeKsh, 100);
});

// ------------------------------------------ the two-step dispatch confirmation ---

test("confirming a hand-off keeps the fee chosen at assignment", async (t) => {
  const h = fixture(t, { status: "READY_FOR_DISPATCH", riderId: "rider-1", riderFeeKsh: 100, riderFeeSetBy: "employee-earlier" });
  await h.service.dispatch("order", { adminUserId: "admin" });
  const out = h.fulfillmentWrites.find((data) => data.status === "OUT_FOR_DELIVERY");
  assert.equal(out?.riderFeeKsh, 100);
  assert.equal(out?.riderFeeSetByEmployeeId, "employee-earlier");
  assert.match(String(h.events.find((row) => row.action === "DISPATCH_TO_RIDER")?.note), /骑手费 KSh 100/);
});

test("a rider assigned before fees existed cannot be sent out until a fee is chosen", async (t) => {
  const h = fixture(t, { status: "READY_FOR_DISPATCH", riderId: "rider-1", riderFeeKsh: null });
  await badRequest(h.service.dispatch("order", { adminUserId: "admin" }), MISSING);
  await badRequest(h.service.dispatch("order", { adminUserId: "admin", riderFeeKsh: 20 }), INVALID);
  assert.equal(h.fulfillmentWrites.length, 0);

  await h.service.dispatch("order", { adminUserId: "admin", riderFeeKsh: 50 });
  const out = h.fulfillmentWrites.find((data) => data.status === "OUT_FOR_DELIVERY");
  assert.equal(out?.riderFeeKsh, 50);
  assert.equal(out?.riderFeeSetByEmployeeId, "employee-store");
});

// ------------------------------------------------ failed attempt, back in store ---

test("a failed parcel back at the store forgets the fee, so the next hand-off chooses again", async (t) => {
  const h = fixture(t, { status: "RETURNING_TO_NODE", riderId: "rider-1", riderFeeKsh: 100 });
  Object.assign(h.service as unknown as Row, { assertTransition: () => undefined });
  await h.service.confirmReturnAtNode("order", { adminUserId: "admin" });
  const back = h.fulfillmentWrites.find((data) => data.status === "ARRIVED_AT_NODE");
  assert.ok(back);
  assert.equal(back!.riderFeeKsh, null);
  assert.equal(back!.riderFeeSetByEmployeeId, null);
  assert.equal(back!.deliveryRiderId, null);
});

// ------------------------------------------------------------ completion rule ---

test("a wrong code does not complete the delivery; the right one completes it and keeps the fee", async (t) => {
  const h = fixture(t, { status: "OUT_FOR_DELIVERY", riderId: "rider-1", riderFeeKsh: 100, riderFeeSetBy: "employee-store" });

  await assert.rejects(() => h.service.completeRiderDelivery("order", { code: WRONG }, rider), /attempt\(s\) left/);
  assert.ok(!h.fulfillmentWrites.some((data) => data.status === "COMPLETED"), "a wrong code completes nothing");

  await h.service.completeRiderDelivery("order", { code: CODE }, rider);
  const done = h.fulfillmentWrites.find((data) => data.status === "COMPLETED");
  assert.ok(done, "the right code completes it");
  assert.ok(done!.completedAt instanceof Date, "completedAt is what the weekly settlement filters on");
  assert.ok(!("riderFeeKsh" in done!), "completion does not touch the fee");
  assert.equal(h.fulfillmentRow.status, "COMPLETED");
  assert.equal(h.fulfillmentRow.riderFeeKsh, 100);
  assert.equal(h.fulfillmentRow.deliveryRiderId, "rider-1");
});

test("the desk's 确认送达 needs the customer's code too", async (t) => {
  const h = fixture(t, { status: "OUT_FOR_DELIVERY", riderId: "rider-1", riderFeeKsh: 50 });
  await assert.rejects(() => h.service.completeDelivery("order", { adminUserId: "admin", code: WRONG }), /attempt\(s\) left/);
  await assert.rejects(() => h.service.completeDelivery("order", { adminUserId: "admin" }), /Enter the 4 digits/);
  assert.ok(!h.fulfillmentWrites.some((data) => data.status === "COMPLETED"));

  await h.service.completeDelivery("order", { adminUserId: "admin", code: CODE });
  assert.equal(h.fulfillmentRow.status, "COMPLETED");
  assert.equal(h.fulfillmentRow.riderFeeKsh, 50);
});

test("the rider app is shown its own pay for the delivery", async (t) => {
  const h = fixture(t, { status: "OUT_FOR_DELIVERY", riderId: "rider-1", riderFeeKsh: 100 });
  const view = h.service.riderDeliveryView({
    id: "order",
    orderNumber: "DL-10281",
    deliveryAddress: null,
    deliveryNote: null,
    customer: { displayName: "Wanjiku", phone: "0712345678" },
    items: [],
    fulfillment: {
      packageCode: "PKG",
      status: "OUT_FOR_DELIVERY",
      outForDeliveryAt: null,
      completedAt: null,
      deliveryAttemptCount: 1,
      customerCodeFailedAttempts: 0,
      customerCodeLockedAt: null,
      deliveryFailureReason: null,
      fulfillmentNode: null,
      riderFeeKsh: 100
    }
  } as never);
  assert.equal(view.riderFeeKsh, 100);
});
