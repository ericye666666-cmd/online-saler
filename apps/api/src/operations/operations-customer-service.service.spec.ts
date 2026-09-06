import "reflect-metadata";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { prisma, type CustomerServiceCase, type Prisma } from "@online-saler/database";
import { OperationsAccessService } from "./operations-access.service";
import { OperationsCustomerServiceController } from "./operations-customer-service.controller";
import { OperationsCustomerServiceService } from "./operations-customer-service.service";
import { OperationsFulfillmentService } from "./operations-fulfillment.service";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function harness(t: TestContext) {
  const now = new Date();
  let record: CustomerServiceCase = {
    id: "case-1", orderId: "order-1", customerId: "customer-1", issueType: "AFTER_SALE",
    status: "OPEN", title: "Wrong item", description: "Compare barcode", tags: null,
    createdByAdminUserId: "admin-1", assignedEmployeeId: null, afterSaleReason: null,
    customerRequest: null, requiresReturn: true, requiresRefund: true,
    affectsAffiliateCommission: true, resolvedAt: null, createdAt: now, updatedAt: now
  };
  const order = { id: "order-1", fulfillment: { id: "fulfillment-1", status: "COMPLETED", afterSaleOwnerEmployeeId: "old-owner" } };
  const events: string[] = [];
  const audits: Array<Prisma.AuditLogUncheckedCreateInput> = [];
  const timeline: Array<Prisma.FulfillmentEventUncheckedCreateInput> = [];
  const reachedOrderLock = deferred();
  let waitForLock: Promise<void> | undefined;
  let missingOrder = false;
  let missingCase = false;
  let managed = false;
  const tx = {
    $queryRaw: async (parts: TemplateStringsArray, value: string) => {
      const sql = parts.join("?");
      if (sql.includes('FROM "Order"')) {
        assert.equal(sql, 'SELECT "id" FROM "Order" WHERE "id" = ? FOR UPDATE');
        assert.equal(value, "order-1");
        events.push("lock-order");
        reachedOrderLock.resolve();
        await waitForLock;
      } else {
        assert.equal(sql, 'SELECT "id" FROM "CustomerServiceCase" WHERE "id" = ? FOR UPDATE');
        assert.equal(value, "case-1");
        events.push("lock-case");
      }
      return [{ id: value }];
    },
    order: { findUnique: async () => { events.push("read-order"); return missingOrder ? null : { ...order, fulfillment: { ...order.fulfillment } }; } },
    customer: { findUnique: async () => ({ id: "customer-1" }) },
    customerServiceCase: {
      findUnique: async ({ select }: { select?: { orderId: boolean } }) => {
        events.push(select ? "read-identity" : "read-case");
        return missingCase ? null : select ? { orderId: record.orderId } : { ...record, afterSaleReturn: managed ? { id: "return-1" } : null };
      },
      findFirst: async ({ where }: { where: { id: string; orderId: string; issueType: string } }) => {
        events.push("read-case");
        assert.equal(where.orderId, "order-1");
        assert.equal(where.issueType, "AFTER_SALE");
        return missingCase || where.id !== record.id ? null : { ...record, afterSaleReturn: managed ? { id: "return-1" } : null };
      },
      create: async ({ data }: { data: Partial<CustomerServiceCase> }) => {
        events.push("create-case");
        record = { ...record, ...data };
        return { ...record };
      },
      update: async ({ data }: { data: Partial<CustomerServiceCase> }) => {
        events.push("update-case");
        record = { ...record, ...data };
        return { ...record };
      }
    },
    orderFulfillment: { update: async ({ data }: { data: { afterSaleOwnerEmployeeId: string } }) => { events.push("update-owner"); Object.assign(order.fulfillment, data); return order.fulfillment; } },
    fulfillmentEvent: { upsert: async ({ create }: { create: Prisma.FulfillmentEventUncheckedCreateInput }) => { events.push("timeline"); timeline.push(create); return create; } },
    auditLog: { create: async ({ data }: { data: Prisma.AuditLogUncheckedCreateInput }) => { events.push("audit"); audits.push(data); return data; } }
  };
  const originalTransaction = prisma.$transaction;
  const originalEmployeeFind = prisma.employee.findFirst;
  prisma.$transaction = (async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) as unknown as typeof prisma.$transaction;
  prisma.employee.findFirst = (async () => ({ id: "employee-1" })) as unknown as typeof prisma.employee.findFirst;
  t.after(() => { prisma.$transaction = originalTransaction; prisma.employee.findFirst = originalEmployeeFind; });
  const access = { requirePermission: async (actor?: string) => {
    if (actor !== "admin-1") throw new ForbiddenException();
    return { adminUser: { id: "admin-1", linkedEmployeeId: "actor-employee", linkedEmployee: { id: "actor-employee" } } };
  } } as unknown as OperationsAccessService;
  const fulfillment = new OperationsFulfillmentService(access);
  fulfillment.orderDetail = (async () => ({ id: order.id })) as unknown as typeof fulfillment.orderDetail;
  return {
    service: new OperationsCustomerServiceService(access), fulfillment, events, audits, timeline, order,
    read: () => record,
    changeWhileWaiting: (data: Partial<CustomerServiceCase>) => { record = { ...record, ...data }; },
    blockOrder: () => { const gate = deferred(); waitForLock = gate.promise; return { reached: reachedOrderLock.promise, release: gate.resolve }; },
    removeOrder: () => { missingOrder = true; }, removeCase: () => { missingCase = true; },
    makeManaged: () => { managed = true; }
  };
}

test("case creation waits on the same Order lock as commission settlement before reading or writing", async (t) => {
  const h = harness(t);
  const gate = h.blockOrder();
  const pending = h.service.createCase({ adminUserId: "admin-1", orderId: "order-1", title: "Wrong garment", issueType: "AFTER_SALE" });
  await gate.reached;
  assert.deepEqual(h.events, ["lock-order"]);
  assert.equal(h.audits.length, 0);
  gate.release();
  const created = await pending;
  assert.deepEqual(h.events, ["lock-order", "read-order", "create-case", "audit"]);
  assert.equal(created.createdByAdminUserId, "admin-1");
  assert.equal(h.audits[0]?.actorAdminUserId, "admin-1");
  assert.equal(h.audits[0]?.actorId, "actor-employee");
  assert.equal(h.audits[0]?.action, "CUSTOMER_SERVICE_CASE_CREATE");
});

test("case reopening re-reads after the order lock and audits the state committed by the earlier writer", async (t) => {
  const h = harness(t);
  const gate = h.blockOrder();
  const pending = h.service.updateCase("case-1", { adminUserId: "admin-1", status: "OPEN" });
  await gate.reached;
  assert.deepEqual(h.events, ["read-identity", "lock-order"]);
  h.changeWhileWaiting({ status: "CLOSED", resolvedAt: new Date() });
  gate.release();
  const updated = await pending;
  assert.deepEqual(h.events, ["read-identity", "lock-order", "lock-case", "read-case", "update-case", "audit"]);
  assert.equal(updated.status, "OPEN");
  assert.equal(updated.resolvedAt, null);
  assert.equal((h.audits[0]?.beforeJson as Prisma.InputJsonObject).status, "CLOSED");
  assert.equal((h.audits[0]?.afterJson as Prisma.InputJsonObject).status, "OPEN");
});

test("missing order/case and unauthorized mutation leave no success audit", async (t) => {
  const h = harness(t);
  await assert.rejects(h.service.createCase({ adminUserId: "forged", orderId: "order-1", title: "Case" }), ForbiddenException);
  assert.deepEqual(h.events, []);
  h.removeOrder();
  await assert.rejects(h.service.createCase({ adminUserId: "admin-1", orderId: "order-1", title: "Case" }), NotFoundException);
  h.removeCase();
  await assert.rejects(h.service.updateCase("case-1", { adminUserId: "admin-1", status: "CLOSED" }), NotFoundException);
  assert.equal(h.audits.length, 0);
  assert.ok(!(h.events as string[]).includes("create-case") && !(h.events as string[]).includes("update-case"));
});

test("standalone case edits also lock before their audited before-state is read", async (t) => {
  const h = harness(t);
  h.changeWhileWaiting({ orderId: null });
  await h.service.updateCase("case-1", { adminUserId: "admin-1", status: "RESOLVED" });
  assert.deepEqual(h.events, ["read-identity", "lock-case", "read-case", "update-case", "audit"]);
  assert.ok(h.read().resolvedAt);
});

test("legacy after-sale assignment uses locked state and records case flags and actor in the same transaction", async (t) => {
  const h = harness(t);
  const gate = h.blockOrder();
  const pending = h.fulfillment.assignAfterSale("order-1", { adminUserId: "admin-1", employeeId: "employee-1", caseId: "case-1", status: "CLOSED", requiresRefund: false });
  await gate.reached;
  assert.deepEqual(h.events, ["lock-order"]);
  h.order.fulfillment.status = "EXCEPTION";
  h.changeWhileWaiting({ status: "IN_PROGRESS" });
  gate.release();
  await pending;
  assert.deepEqual(h.events, ["lock-order", "read-order", "read-case", "update-owner", "update-case", "timeline", "audit"]);
  assert.equal(h.timeline[0]?.oldStatus, "EXCEPTION");
  assert.equal(h.timeline[0]?.newStatus, "EXCEPTION");
  const before = h.audits[0]?.beforeJson as Prisma.InputJsonObject;
  const after = h.audits[0]?.afterJson as Prisma.InputJsonObject;
  assert.equal((before.serviceCase as Prisma.InputJsonObject).status, "IN_PROGRESS");
  assert.equal((after.serviceCase as Prisma.InputJsonObject).status, "CLOSED");
  assert.equal((after.serviceCase as Prisma.InputJsonObject).requiresRefund, false);
  assert.equal(h.audits[0]?.actorAdminUserId, "admin-1");
});

test("a case from another order cannot assign an owner or create a misleading success event", async (t) => {
  const h = harness(t);
  await assert.rejects(h.fulfillment.assignAfterSale("order-1", { adminUserId: "admin-1", employeeId: "employee-1", caseId: "other-case" }), NotFoundException);
  assert.equal(h.order.fulfillment.afterSaleOwnerEmployeeId, "old-owner");
  assert.equal(h.audits.length, 0);
  assert.equal(h.timeline.length, 0);
});

test("legacy routes cannot rewrite a managed return case status or financial flags, but can assign its owner", async (t) => {
  const h = harness(t);
  h.makeManaged();
  await assert.rejects(h.service.updateCase("case-1", { adminUserId: "admin-1", status: "CLOSED" }), BadRequestException);
  for (const changes of [{ status: "CLOSED" as const }, { requiresReturn: false }, { requiresRefund: false }, { affectsAffiliateCommission: false }]) {
    await assert.rejects(h.fulfillment.assignAfterSale("order-1", {
      adminUserId: "admin-1", employeeId: "employee-1", caseId: "case-1", ...changes
    }), BadRequestException);
  }
  assert.equal(h.audits.length, 0);
  assert.equal(h.read().status, "OPEN");
  assert.equal(h.read().requiresRefund, true);
  await h.fulfillment.assignAfterSale("order-1", { adminUserId: "admin-1", employeeId: "employee-1", caseId: "case-1" });
  assert.equal(h.read().assignedEmployeeId, "employee-1");
  assert.equal(h.read().status, "OPEN");
  assert.equal(h.audits.length, 1);
});

test("all legacy customer-service routes require a verified token and mutations ignore a forged body actor", async () => {
  const calls: Array<{ method: string; actor?: string }> = [];
  const mockService: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  for (const method of ["summary", "searchCustomers", "searchOrders", "listCases", "listNotes", "createCase", "updateCase", "createNote"]) {
    mockService[method] = async (...args) => {
      const input = args[method === "updateCase" ? 1 : 0];
      calls.push({ method, actor: typeof input === "string" ? input : (input as { adminUserId: string }).adminUserId });
      return input;
    };
  }
  const access = { requireAccessToken: async (authorization?: string) => {
    if (authorization !== "Bearer signed-session") throw new UnauthorizedException();
    return "verified-admin";
  } } as OperationsAccessService;
  const controller = new OperationsCustomerServiceController(mockService as unknown as OperationsCustomerServiceService, access);
  const invoke = (authorization?: string) => [
    () => controller.summary(authorization),
    () => controller.customers(authorization, "search"),
    () => controller.orders(authorization, "after-sales", "search"),
    () => controller.cases(authorization, "after-sales", "AFTER_SALE", "OPEN", "search"),
    () => controller.notes(authorization, "search"),
    () => controller.createCase(authorization, { adminUserId: "forged-admin", title: "Case" }),
    () => controller.updateCase(authorization, "case-1", { adminUserId: "forged-admin", status: "CLOSED" }),
    () => controller.createNote(authorization, { adminUserId: "forged-admin", body: "Note" })
  ];
  for (const request of invoke()) await assert.rejects(request(), UnauthorizedException);
  for (const request of invoke("Bearer forged-admin")) await assert.rejects(request(), UnauthorizedException);
  assert.equal(calls.length, 0);
  for (const request of invoke("Bearer signed-session")) await request();
  assert.equal(calls.length, 8);
  assert.ok(calls.every((call) => call.actor === "verified-admin"));
});
