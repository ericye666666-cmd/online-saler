import "reflect-metadata";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { BadRequestException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { prisma, type AdminUserStatus } from "@online-saler/database";
import { OperationsAccessService } from "./operations-access.service";
import { hashPassword, verifyOperationsAccessToken } from "./operations-access-policy";

const password = "test-only-operator-password";
const passwordHash = hashPassword(password);

// Prisma delegates expose methods through a Proxy, so Node's descriptor-based
// mock.method cannot replace them. Restore each replacement after the test.
function replaceMethod(t: TestContext, target: object, key: string, replacement: unknown) {
  const record = target as Record<string, unknown>;
  const original = record[key];
  record[key] = replacement;
  t.after(() => { record[key] = original; });
}

function loginHarness(t: TestContext, status: AdminUserStatus = "ACTIVE") {
  const account = {
    id: "owner-edited-account", name: "Existing employee", loginAccount: "operator", email: null,
    phone: null, status, passwordHash, linkedEmployeeId: "employee-a",
    linkedEmployee: { id: "employee-a", name: "Employee A", employeeCode: "EMP-A" },
    roles: [{ role: { id: "role-a", code: "PRODUCT_DIGITIZATION", name: "Restricted by owner", description: "Owner policy", permissions: [] } }],
    lastLoginAt: null
  };
  const writes: unknown[] = [];
  replaceMethod(t, prisma.adminUser, "findFirst", async () => account);
  replaceMethod(t, prisma.adminUser, "update", async ({ data }: { data: unknown }) => {
    writes.push(data);
    return { ...account, ...(data as object) };
  });
  for (const model of [prisma.permission, prisma.role, prisma.employee, prisma.adminUser, prisma.userRole, prisma.rolePermission]) {
    replaceMethod(t, model, "upsert", async () => { throw new Error("Login must not provision or restore the access baseline"); });
    replaceMethod(t, model, "deleteMany", async () => { throw new Error("Login must not replace existing permissions"); });
  }
  return { service: new OperationsAccessService(), account, writes };
}

test("successful login preserves operator-edited permissions and writes only last login time", async (t) => {
  const h = loginHarness(t);
  const session = await h.service.login({ login: " Operator ", password });
  assert.deepEqual(session.permissions, []);
  assert.equal(session.roles[0].name, "Restricted by owner");
  assert.equal(session.adminUser.status, "ACTIVE");
  assert.equal(verifyOperationsAccessToken(session.accessToken, passwordHash)?.sub, h.account.id);
  assert.equal(h.writes.length, 1);
  assert.deepEqual(Object.keys(h.writes[0] as object), ["lastLoginAt"]);
});

test("wrong and missing credentials cause no provisioning or account writes", async (t) => {
  const h = loginHarness(t);
  await assert.rejects(h.service.login({ login: "operator", password: "wrong" }), UnauthorizedException);
  await assert.rejects(h.service.login({ login: "operator" }), BadRequestException);
  assert.deepEqual(h.writes, []);
});

for (const status of ["DISABLED", "LOCKED"] as const) {
  test(`${status.toLowerCase()} accounts stay inactive even with the correct password`, async (t) => {
    const h = loginHarness(t, status);
    await assert.rejects(h.service.login({ login: "operator", password }), ForbiddenException);
    assert.equal(h.account.status, status);
    assert.deepEqual(h.writes, []);
  });
}

test("new staff accounts create their own linked employee with the account", async (t) => {
  const access = new OperationsAccessService();
  replaceMethod(t, access, "requirePermission", async () => ({}));
  replaceMethod(t, access, "session", async () => ({}));
  replaceMethod(t, prisma.role, "findMany", async () => []);
  replaceMethod(t, prisma.userRole, "deleteMany", async () => ({ count: 0 }));
  replaceMethod(t, prisma, "$transaction", async (operations: Promise<unknown>[]) => Promise.all(operations));
  let input: { name: string; linkedEmployee: { create: { employeeCode: string; name: string; status: string } } } | undefined;
  replaceMethod(t, prisma.adminUser, "create", async ({ data }: { data: typeof input }) => { input = data; return { id: "new-staff" }; });
  await access.createAdminUser("authorized-manager", { name: "New digitizer", loginAccount: "digitizer", initialPassword: password });
  assert.ok(input);
  assert.equal(input.linkedEmployee.create.name, "New digitizer");
  assert.equal(input.linkedEmployee.create.status, "ACTIVE");
  assert.match(input.linkedEmployee.create.employeeCode, /^OPS-[0-9a-f-]{36}$/);
});
