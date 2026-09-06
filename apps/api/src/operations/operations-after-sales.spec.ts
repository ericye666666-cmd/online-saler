import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { assertRefundAmount, assertReturnWindow, commissionShares, requiredText } from "./operations-after-sales.rules";
import { OperationsAfterSalesController } from "./operations-after-sales.controller";
import { OperationsAfterSalesService } from "./operations-after-sales.service";
import { OperationsAccessService } from "./operations-access.service";
import { prisma } from "@online-saler/database";

const completedAt = new Date("2026-09-06T08:00:00Z");
test("24-hour eligibility accepts the exact boundary and rejects undelivered, future and expired requests", () => {
  assert.doesNotThrow(() => assertReturnWindow(completedAt, new Date("2026-09-07T08:00:00Z")));
  assert.throws(() => assertReturnWindow(completedAt, new Date("2026-09-07T08:00:00.001Z")), /24 hours/);
  assert.throws(() => assertReturnWindow(undefined, completedAt), /24 hours/);
  assert.throws(() => assertReturnWindow(new Date("2026-09-07T08:00:00Z"), completedAt), /24 hours/);
});

test("refunds cannot exceed sold line, order total, or actual successful payments across installments", () => {
  assert.doesNotThrow(() => assertRefundAmount(75, 200, 125, 450, 325, 450));
  assert.throws(() => assertRefundAmount(76, 200, 125, 450, 325, 450), /exceed/);
  assert.throws(() => assertRefundAmount(75, 200, 0, 450, 400, 450), /exceed/);
  assert.throws(() => assertRefundAmount(75, 200, 0, 450, 325, 350), /exceed/);
  for (const amount of [0, -1, 1.5, Number.NaN, "100", Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => assertRefundAmount(amount, 200, 0, 450, 0, 450), /positive integer/);
});

test("item commission allocation preserves every shilling and is stable across item ordering", () => {
  const items = [{ id: "c", lineTotalKsh: 100 }, { id: "b", lineTotalKsh: 100 }, { id: "a", lineTotalKsh: 100 }];
  assert.deepEqual([...commissionShares(items, 10)], [["a", 4], ["b", 3], ["c", 3]]);
  assert.deepEqual([...commissionShares([...items].reverse(), 10)], [["a", 4], ["b", 3], ["c", 3]]);
  const shares = commissionShares([{ id: "a", lineTotalKsh: 350 }, { id: "b", lineTotalKsh: 99 }, { id: "c", lineTotalKsh: 51 }], 37);
  assert.equal([...shares.values()].reduce((a, b) => a + b, 0), 37);
  assert.deepEqual([...shares.values()].sort((a, b) => a - b), [4, 7, 26]);
});

test("financial evidence and idempotency text reject missing, malformed, and oversized values", () => {
  assert.equal(requiredText("  receipt  ", "Evidence"), "receipt");
  for (const value of [undefined, null, 123, "   ", "x".repeat(2001)]) assert.throws(() => requiredText(value, "Evidence"), /Evidence/);
});

test("controller derives actor from bearer token regardless of body admin ID", async () => {
  let observed: unknown[] = [];
  const service = { execute: async (...args: unknown[]) => { observed = args; return {}; } } as unknown as OperationsAfterSalesService;
  const access = { requireAccessToken: async (token: string) => { assert.equal(token, "Bearer real"); return "authenticated-actor"; } } as unknown as OperationsAccessService;
  await new OperationsAfterSalesController(service, access).refund("Bearer real", "order-1", "return-1", { note: "verified", idempotencyKey: "refund-1", ...{ adminUserId: "forged" } });
  assert.equal(observed[4], "authenticated-actor");
});

test("decision and refund demand approval permission before opening a transaction", async () => {
  const permissions: string[] = [];
  const access = { requirePermission: async (_actor: string, permission: string) => { permissions.push(permission); if (permission === "action.customer-service.approve") throw new Error("Approval forbidden"); return { adminUser: { linkedEmployeeId: null } }; } } as unknown as OperationsAccessService;
  for (const action of ["DECISION", "REFUND"] as const) await assert.rejects(() => new OperationsAfterSalesService(access).execute("order", "return", action, { note: "verified", idempotencyKey: "key" }, "actor"), /Approval forbidden/);
  assert.deepEqual(permissions, ["orders.after-sale", "action.customer-service.approve", "orders.after-sale", "action.customer-service.approve"]);
});

test("same order is locked before checking a replay; payload conflict cannot mutate a financial record", async () => {
  const original = prisma.$transaction;
  const calls: string[] = [];
  prisma.$transaction = (async (callback: (tx: unknown) => unknown) => callback({
    $queryRaw: async (query: { strings: string[] }) => { calls.push("lock"); assert.match(query.strings.join("?"), /Order.*FOR UPDATE/); },
    order: { findUnique: async () => { calls.push("order"); return { id: "order", afterSaleReturns: [] }; } },
    afterSaleEvent: { findUnique: async () => { calls.push("replay"); return { requestHash: "different", actorAdminUserId: "actor" }; } }
  })) as typeof prisma.$transaction;
  try {
    const access = { requirePermission: async () => ({ adminUser: { linkedEmployeeId: null } }) } as unknown as OperationsAccessService;
    await assert.rejects(() => new OperationsAfterSalesService(access).execute("order", "return", "REFUND", { note: "verified", idempotencyKey: "key" }, "actor"), /different request/);
    assert.deepEqual(calls, ["lock", "order", "replay"]);
  } finally { prisma.$transaction = original; }
});

test("a 1/200 refund installment cannot close the case or restock; the remaining 199 completes only the item", async () => {
  const original = prisma.$transaction;
  const receivedAt = new Date(Date.now() - 10_000);
  const record = {
    id: "return", orderId: "order", serviceCaseId: "case", orderItemId: "item", status: "RECEIVED",
    receivedAt, restockable: true, refunds: [] as Array<{ amountKsh: number }>, events: [],
    commissionAdjustment: null, orderItem: { id: "item", lineTotalKsh: 200 }
  };
  const order = { id: "order", status: "COMPLETED", totalKsh: 250, payments: [{ status: "SUCCESS", amountKsh: 250 }], afterSaleReturns: [record], commission: null };
  const caseUpdates: unknown[] = [];
  const orderUpdates: unknown[] = [];
  const tx = {
    $queryRaw: async () => [],
    order: { findUnique: async () => order, update: async (data: unknown) => { orderUpdates.push(data); } },
    afterSaleEvent: { findUnique: async () => null, create: async () => ({}) },
    afterSaleReturn: {
      update: async ({ data }: { data: { status: string } }) => { Object.assign(record, data); return record; },
      findUniqueOrThrow: async () => record, findMany: async () => [record]
    },
    refundRecord: { create: async ({ data }: { data: { amountKsh: number } }) => { record.refunds.push(data); return data; } },
    customerServiceCase: { update: async (args: unknown) => { caseUpdates.push(args); return {}; } },
    auditLog: { create: async () => ({}) }
  };
  prisma.$transaction = (async (callback: (transaction: unknown) => unknown) => callback(tx)) as typeof prisma.$transaction;
  try {
    const access = { requirePermission: async () => ({ adminUser: { linkedEmployeeId: null } }) } as unknown as OperationsAccessService;
    const service = new OperationsAfterSalesService(access);
    const evidence = { note: "Verified external receipt", evidenceNote: "Provider statement inspected", refundedAt: new Date(Date.now() - 1_000).toISOString() };
    const first = await service.execute("order", "return", "REFUND", { ...evidence, amountKsh: 1, externalReference: "part-1", idempotencyKey: "refund-1" }, "actor");
    assert.equal(first.returns[0]?.status, "RECEIVED");
    assert.equal(caseUpdates.length, 0, "service ticket flags must remain active");
    await assert.rejects(() => service.execute("order", "return", "RESTOCK", { note: "Cannot restore an incomplete refund", locationCode: "SHELF", idempotencyKey: "restock-early" }, "actor"), /recorded refund/);
    const completed = await service.execute("order", "return", "REFUND", { ...evidence, amountKsh: 199, externalReference: "part-2", idempotencyKey: "refund-2" }, "actor");
    assert.equal(completed.returns[0]?.status, "REFUND_RECORDED");
    assert.equal(caseUpdates.length, 1);
    assert.deepEqual(caseUpdates[0], { where: { id: "case" }, data: { status: "RESOLVED", resolvedAt: (caseUpdates[0] as { data: { resolvedAt: Date } }).data.resolvedAt, requiresReturn: false, requiresRefund: false, affectsAffiliateCommission: false } });
    assert.equal(orderUpdates.length, 0, "delivery fee has not been refunded, so the order must remain COMPLETED");
    assert.equal(record.refunds.reduce((sum, refund) => sum + refund.amountKsh, 0), 200);
  } finally { prisma.$transaction = original; }
});
