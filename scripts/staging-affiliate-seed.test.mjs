import assert from "node:assert/strict";
import test from "node:test";
import {
  ROLE_GRANT_LEDGER_KEY,
  defaultGrantsFor,
  permissions,
  planRoleBackfill,
  roles,
  seedStagingBaseline
} from "../packages/database/prisma/seed-staging-test-employee.mjs";

// A persistent upsert double models a second deployment against records that
// operators already edited. Unexpected destructive APIs are deliberately absent:
// there is no delete anywhere, so a seed that ever tried to revoke a grant would
// fail here rather than in production.
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

  client.role.findMany = async () => [...rows.role.keys()].map((code) => ({ code }));
  client.systemSetting.findUnique = async ({ where }) => {
    const row = rows.systemSetting.get(where.key);
    return row ? structuredClone(row) : null;
  };

  // Grants added to a role after its row exists.
  rows.rolePermission = new Map();
  client.rolePermission = {
    async findMany({ where }) {
      return held(rows, where.role.code).map((code) => ({ permission: { code } }));
    },
    async create({ data }) {
      const roleCode = data.role.connect.code;
      const permissionCode = data.permission.connect.code;
      assert.ok(rows.role.has(roleCode), `grant to missing role ${roleCode}`);
      assert.ok(rows.permission.has(permissionCode), `grant of missing permission ${permissionCode}`);
      assert.ok(!held(rows, roleCode).includes(permissionCode), `duplicate grant ${roleCode}:${permissionCode}`);
      const row = { roleCode, permissionCode };
      rows.rolePermission.set(`${roleCode}:${permissionCode}`, row);
      return structuredClone(row);
    }
  };

  return { client, rows };
}

/**
 * What a role holds right now: what its create carried -- or, where a test has
 * replaced that with a plain list, the list -- plus every later grant.
 */
function held(rows, roleCode) {
  const role = rows.role.get(roleCode);
  if (!role) return [];
  const base = Array.isArray(role.permissions)
    ? role.permissions
    : (role.permissions?.create ?? []).map(({ permission }) => permission.connect.code);
  const later = [...rows.rolePermission.values()]
    .filter((row) => row.roleCode === roleCode)
    .map((row) => row.permissionCode);
  return [...new Set([...base, ...later])].sort();
}

/** The permission codes a role picked up after its row already existed. */
function toppedUp(rows, roleCode) {
  return [...rows.rolePermission.values()]
    .filter((row) => row.roleCode === roleCode)
    .map((row) => row.permissionCode)
    .sort();
}

/** A live database as the old baseline left it: roles present, holding `grants`, no ledger yet. */
function liveDatabase(grants) {
  const { client, rows } = database();
  for (const permission of permissions) rows.permission.set(permission.code, { id: `permission-${permission.code}`, ...permission });
  for (const [code, codes] of Object.entries(grants)) {
    rows.role.set(code, { id: `role-${code}`, code, name: code, permissions: [...codes] });
  }
  return { client, rows };
}

function blueprint(code) {
  return roles.find((role) => role.code === code);
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
  assert.ok(held(rows, "SUPER_ADMIN").includes("page.product.details"));
  assert.ok(held(rows, "FINANCE").includes("orders.view"));
  assert.deepEqual(result.granted, {}, "a fresh role gets its permissions from the create, not a top-up");
});

test("every declared permission is seeded as a row", async () => {
  const { client, rows } = database();
  await seedStagingBaseline(client);
  assert.deepEqual([...rows.permission.keys()].sort(), permissions.map((permission) => permission.code).sort());
  for (const role of roles) {
    for (const code of role.permissions) {
      assert.ok(rows.permission.has(code), `role ${role.code} defaults to ${code}, which is not a declared permission`);
    }
  }
});

test("an existing permission row is left exactly as it is", async () => {
  const { client, rows } = liveDatabase({});
  rows.permission.set("orders.view", { id: "kept", code: "orders.view", module: "orders", description: "Owner wording" });
  await seedStagingBaseline(client);
  assert.deepEqual(rows.permission.get("orders.view"), { id: "kept", code: "orders.view", module: "orders", description: "Owner wording" });
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
  assert.deepEqual(toppedUp(rows, "SUPER_ADMIN"), []);
  assert.deepEqual(toppedUp(rows, "PRODUCT_DIGITIZATION"), []);
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

test("an existing role that holds nothing was switched off, and stays off", async () => {
  const { client, rows } = liveDatabase({ PRODUCT_DIGITIZATION: [] });
  await seedStagingBaseline(client);
  assert.deepEqual(held(rows, "PRODUCT_DIGITIZATION"), []);
  assert.ok(held(rows, "WAREHOUSE_FULFILLMENT").length > 0, "a role that did not exist is still created");

  // Giving it one permission back later does not open the flood gates either.
  rows.role.set("PRODUCT_DIGITIZATION", { ...rows.role.get("PRODUCT_DIGITIZATION"), permissions: ["module.product"] });
  await seedStagingBaseline(client);
  assert.deepEqual(held(rows, "PRODUCT_DIGITIZATION"), ["module.product"]);
});

test("backfill adds the defaults an existing role is missing -- the live gaps of September 2026", async () => {
  // The customer service desk, refunds and the deposit board shipped codes that
  // already existed for the super admin, so the old "never seen before" top-up
  // skipped every other role.
  const without = (code, missing) => blueprint(code).permissions.filter((permission) => !missing.includes(permission));
  const csMissing = [
    "customer-service.assign", "customer-service.escalate", "customer-service.contact-update",
    "customer-service.refund-request", "orders.resend-code", "page.customer-service.cases", "page.customer-service.refunds"
  ];
  const financeMissing = ["customer-service.refund-approve", "orders.refund", "action.customer-service.view", "page.customer-service.refunds"];
  const supervisorMissing = ["page.orders.deposits", "orders.assign-packer"];
  const { client, rows } = liveDatabase({
    CUSTOMER_SERVICE: without("CUSTOMER_SERVICE", csMissing),
    FINANCE: without("FINANCE", financeMissing),
    ORDER_OPERATIONS: without("ORDER_OPERATIONS", supervisorMissing),
    PROJECT_MANAGER: without("PROJECT_MANAGER", supervisorMissing)
  });

  const result = await seedStagingBaseline(client);

  assert.deepEqual(result.granted.CUSTOMER_SERVICE, [...csMissing].sort());
  assert.deepEqual(result.granted.FINANCE, [...financeMissing].sort());
  assert.deepEqual(result.granted.ORDER_OPERATIONS, [...supervisorMissing].sort());
  assert.deepEqual(result.granted.PROJECT_MANAGER, [...supervisorMissing].sort());
  for (const code of ["CUSTOMER_SERVICE", "FINANCE", "ORDER_OPERATIONS", "PROJECT_MANAGER"]) {
    assert.deepEqual(held(rows, code), defaultGrantsFor(blueprint(code)), `${code} now holds exactly its defaults`);
  }

  // Idempotent: a second deployment finds nothing to do.
  const again = await seedStagingBaseline(client);
  assert.deepEqual(again.granted, {});
});

test("backfill never removes a grant, including ones outside the defaults", async () => {
  const extra = ["action.system.manage-users", "page.system.accounts"];
  const { client, rows } = liveDatabase({ CUSTOMER_SERVICE: ["module.orders", ...extra] });
  await seedStagingBaseline(client);
  const after = held(rows, "CUSTOMER_SERVICE");
  for (const code of ["module.orders", ...extra]) assert.ok(after.includes(code), `${code} was kept`);
});

test("a default the administrator removes after it was offered stays removed", async () => {
  const { client, rows } = liveDatabase({ STORE_MANAGER: ["orders.view"] });
  const first = await seedStagingBaseline(client);
  assert.ok(first.granted.STORE_MANAGER.includes("page.orders.node"));
  assert.ok(first.granted.STORE_MANAGER.includes("orders.node-receive"));

  // The administrator takes one away in role management (which rewrites the
  // role's grants wholesale), then the next deployment runs.
  const kept = held(rows, "STORE_MANAGER").filter((code) => code !== "orders.resend-code");
  rows.role.set("STORE_MANAGER", { ...rows.role.get("STORE_MANAGER"), permissions: kept });
  for (const key of [...rows.rolePermission.keys()]) if (key.startsWith("STORE_MANAGER:")) rows.rolePermission.delete(key);

  const second = await seedStagingBaseline(client);
  assert.equal(second.granted.STORE_MANAGER, undefined);
  assert.equal(held(rows, "STORE_MANAGER").includes("orders.resend-code"), false);
  assert.ok(rows.systemSetting.get(ROLE_GRANT_LEDGER_KEY).valueJson.STORE_MANAGER.includes("orders.resend-code"));
});

test("a permission added to a role's defaults later reaches the existing role once", () => {
  const role = { code: "FINANCE", permissions: ["orders.view", "page.orders.deposits"] };
  const plan = planRoleBackfill(role, {
    exists: true,
    held: new Set(["orders.view"]),
    offered: new Set(["orders.view"])
  });
  assert.deepEqual(plan.grant, ["page.orders.deposits"]);
  assert.deepEqual(plan.offer, ["page.orders.deposits"]);
});

test("customer service never receives refund approval, even if its defaults ever list it", async () => {
  // Two-person refund control: customer service asks, finance approves.
  assert.equal(blueprint("CUSTOMER_SERVICE").permissions.includes("customer-service.refund-approve"), false);

  const polluted = { ...blueprint("CUSTOMER_SERVICE") };
  polluted.permissions = [...polluted.permissions, "customer-service.refund-approve"];
  for (const state of [
    { exists: false, held: new Set(), offered: new Set() },
    { exists: true, held: new Set(["module.orders"]), offered: new Set() }
  ]) {
    const plan = planRoleBackfill(polluted, state);
    assert.equal([...plan.create, ...plan.grant, ...plan.offer].includes("customer-service.refund-approve"), false);
  }

  for (const start of [database(), liveDatabase({ CUSTOMER_SERVICE: ["module.orders"] })]) {
    await seedStagingBaseline(start.client);
    assert.equal(held(start.rows, "CUSTOMER_SERVICE").includes("customer-service.refund-approve"), false);
  }
});
