import assert from "node:assert/strict";
import test from "node:test";
import { seedStagingBaseline } from "../packages/database/prisma/seed-staging-test-employee.mjs";

// A persistent upsert double models a second deployment against records that
// operators already edited. Unexpected destructive APIs are deliberately absent.
function database() {
  const rows = {};
  const client = {};
  for (const model of ["permission", "role", "employee", "adminUser", "systemSetting", "affiliate", "affiliateLink"]) {
    rows[model] = new Map();
    client[model] = {
      async upsert({ where, create, update }) {
        const key = Object.values(where)[0];
        const previous = rows[model].get(key);
        const value = previous
          ? { ...previous, ...structuredClone(update) }
          : { id: `${model}-${key}`, ...structuredClone(create) };
        rows[model].set(key, value);
        return structuredClone(value);
      }
    };
  }
  return { client, rows };
}

test("fresh baseline supplies linked staff and default roles without putting affiliate fields on staff", async () => {
  const { client, rows } = database();
  const result = await seedStagingBaseline(client);
  const employee = rows.employee.get("STAGING-TEST-001");
  const admin = rows.adminUser.get("superadmin");
  assert.equal(result.adminUserId, admin.id);
  assert.equal(admin.linkedEmployeeId, employee.id);
  assert.equal(admin.roles.create.role.connect.code, "SUPER_ADMIN");
  assert.equal("slug" in employee, false);
  assert.equal(rows.affiliate.get("DL-AFF-001").slug, "staging-affiliate");
  assert.ok(rows.role.get("SUPER_ADMIN").permissions.create.some(({ permission }) => permission.connect.code === "page.product.details"));
  assert.ok(rows.role.get("FINANCE").permissions.create.some(({ permission }) => permission.connect.code === "orders.view"));
});

test("repeat deployment preserves restricted roles, revoked membership, disabled staff and changed passwords", async () => {
  const { client, rows } = database();
  await seedStagingBaseline(client);
  for (const key of ["SUPER_ADMIN", "PRODUCT_DIGITIZATION"]) {
    rows.role.set(key, { ...rows.role.get(key), name: "Owner edited role", permissions: [] });
  }
  rows.employee.set("STAGING-TEST-001", { ...rows.employee.get("STAGING-TEST-001"), name: "Renamed", status: "LEFT" });
  rows.adminUser.set("superadmin", {
    ...rows.adminUser.get("superadmin"), status: "DISABLED", name: "Owner edited account",
    passwordHash: "owner-password-sentinel", linkedEmployeeId: "different-employee", roles: []
  });
  const expected = structuredClone({ roles: [...rows.role], staff: [...rows.employee], admins: [...rows.adminUser] });
  await seedStagingBaseline(client);
  await seedStagingBaseline(client);
  assert.deepEqual({ roles: [...rows.role], staff: [...rows.employee], admins: [...rows.adminUser] }, expected);
});

test("repeat deployment preserves configured commission, affiliate status/rate and edited promotion links", async () => {
  const { client, rows } = database();
  await seedStagingBaseline(client);
  rows.systemSetting.set("affiliate.defaultCommissionRateBps", { key: "affiliate.defaultCommissionRateBps", valueJson: 3000, scope: "GLOBAL" });
  rows.affiliate.set("DL-AFF-001", {
    ...rows.affiliate.get("DL-AFF-001"), commissionRateBps: 1700,
    status: "DISABLED", slug: "owner-changed-slug", disabledAt: new Date("2026-09-01T00:00:00Z")
  });
  rows.affiliateLink.set("DL-AFF-001-STORE-WA", {
    ...rows.affiliateLink.get("DL-AFF-001-STORE-WA"), landingPath: "/owner-collection", campaign: "owner-campaign"
  });
  const expected = structuredClone({ settings: [...rows.systemSetting], affiliates: [...rows.affiliate], links: [...rows.affiliateLink] });
  await seedStagingBaseline(client);
  assert.deepEqual({ settings: [...rows.systemSetting], affiliates: [...rows.affiliate], links: [...rows.affiliateLink] }, expected);
});

test("new missing roles can be created without expanding an existing empty role", async () => {
  const { client, rows } = database();
  rows.role.set("PRODUCT_DIGITIZATION", { id: "restricted", code: "PRODUCT_DIGITIZATION", permissions: [] });
  await seedStagingBaseline(client);
  assert.deepEqual(rows.role.get("PRODUCT_DIGITIZATION").permissions, []);
  assert.ok(rows.role.get("WAREHOUSE_FULFILLMENT").permissions.create.length > 0);
});
