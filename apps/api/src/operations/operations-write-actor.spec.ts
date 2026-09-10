import "reflect-metadata";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@online-saler/database";
import { OperationsAccessService } from "./operations-access.service";
import { OperationsWarehouseService } from "./operations-warehouse.service";
import { OperationsProductFactoryAdminService } from "./operations-product-factory-admin.service";

function fixture(t: TestContext) {
  const mutations: string[] = [];
  const audits: any[] = [];
  const employeeLookups: string[] = [];
  let taxonomyDocument: unknown = null;
  let employeeExists = true;
  const employee = { id: "actual-employee", status: "ACTIVE", employeeCode: "EMP-ACTUAL", name: "Actual employee" };
  const admin = {
    id: "actual-admin", name: "Actual admin", email: null, loginAccount: "actual-admin", phone: null,
    status: "ACTIVE", linkedEmployeeId: employee.id as string | null, linkedEmployee: employee,
    lastLoginAt: null,
    roles: [{ role: {
      id: "manager-role", code: "MANAGER", name: "Manager", description: null,
      permissions: ["warehouse-locations.manage", "action.product.edit", "page.product.control"].map((code) => ({
        permission: { id: code, code, module: "test", scope: "ACTION", page: null, action: null, description: null }
      }))
    } }]
  };
  function replace(target: any, key: string, implementation: (...args: any[]) => any) {
    const original = target[key];
    target[key] = implementation;
    t.after(() => { target[key] = original; });
  }
  replace(prisma.adminUser, "findFirst", async ({ where }: any) => where.id === admin.id ? admin : null);
  replace(prisma.employee, "findUnique", async ({ where }: any) => {
    employeeLookups.push(where.id);
    return employeeExists && where.id === employee.id ? employee : null;
  });
  replace(prisma.systemSetting, "findUnique", async () => taxonomyDocument ? { valueJson: taxonomyDocument } : null);
  replace(prisma.systemSetting, "upsert", async ({ create, update }: any) => {
    mutations.push("taxonomy.write");
    taxonomyDocument = structuredClone((taxonomyDocument ? update : create).valueJson);
    return { valueJson: taxonomyDocument };
  });
  replace(prisma.auditLog, "create", async ({ data }: any) => {
    mutations.push("audit.write");
    audits.push(data);
    return { id: "audit-1", ...data };
  });
  replace(prisma.product, "groupBy", async () => []);
  replace(prisma.product, "findMany", async () => []);
  replace(prisma.productDefect, "groupBy", async () => []);
  const transaction = {
    warehouseLocation: { create: async ({ data }: any) => {
      mutations.push("warehouse.write");
      return { id: "location-1", ...data };
    } },
    auditLog: { create: async ({ data }: any) => prisma.auditLog.create({ data }) }
  };
  replace(prisma, "$transaction", async (value: any) => {
    mutations.push("transaction");
    return typeof value === "function" ? value(transaction) : Promise.all(value);
  });
  const access = new OperationsAccessService();
  return {
    admin, employee, mutations, audits, employeeLookups,
    setEmployeeExists: (value: boolean) => { employeeExists = value; },
    warehouse: new OperationsWarehouseService(access),
    factory: new OperationsProductFactoryAdminService(access)
  };
}

for (const kind of ["warehouse", "taxonomy"] as const) {
  const invoke = (h: ReturnType<typeof fixture>) => kind === "warehouse"
    ? h.warehouse.createLocation({ adminUserId: h.admin.id, locationCode: "A-01-001", capacity: 10 })
    : h.factory.createOption({ adminUserId: h.admin.id, group: "TAG", code: "AUTH_TEST_NEW_TAG", displayName: "Auth test tag" });

  test(`${kind} writes reject missing or inactive employee links before any transaction or mutation`, async (t) => {
    const h = fixture(t);
    for (const state of ["unlinked", "deleted", "inactive"] as const) {
      h.admin.linkedEmployeeId = state === "unlinked" ? null : h.employee.id;
      h.setEmployeeExists(state !== "deleted");
      h.employee.status = state === "inactive" ? "INACTIVE" : "ACTIVE";
      await assert.rejects(() => invoke(h), (error: unknown) => error instanceof ForbiddenException && error.getStatus() === 403, state);
      assert.deepEqual(h.mutations, [], `${state} employee link allowed a ${kind} mutation`);
      assert.deepEqual(h.audits, []);
    }
    assert.deepEqual(h.employeeLookups, [h.employee.id, h.employee.id]);
  });

  test(`${kind} writes record the active linked employee and authenticated admin as separate audit actors`, async (t) => {
    const h = fixture(t);
    const result = await invoke(h);
    assert.ok(result);
    assert.deepEqual(h.employeeLookups, [h.employee.id]);
    assert.ok(h.mutations.includes(kind === "warehouse" ? "warehouse.write" : "taxonomy.write"));
    assert.equal(h.audits.length, 1);
    assert.equal(h.audits[0].actorType, "EMPLOYEE");
    assert.equal(h.audits[0].actorId, h.employee.id);
    assert.equal(h.audits[0].actorAdminUserId, h.admin.id);
    assert.equal(h.audits[0].sourceApp, "OPERATIONS");
    assert.equal(h.audits[0].action, kind === "warehouse" ? "WAREHOUSE_LOCATION_CREATED" : "PRODUCT_TAXONOMY_OPTION_CREATED");
  });
}
