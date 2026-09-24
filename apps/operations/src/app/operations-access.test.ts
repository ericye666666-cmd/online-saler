import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canAccessPath,
  filterNavigation,
  firstAllowedPath,
  hasPermission,
  type NavigationModule,
  type OperationsSession
} from "../components/admin/operations-access";

const modules: NavigationModule[] = [
  {
    key: "product",
    label: "商品中心",
    items: [
      { label: "商品工作台", href: "/", permission: "page.product.digitalization" },
      { label: "货架位管理", href: "/product/warehouse-locations", permission: "page.product.warehouse-locations" },
      { label: "库存概览", href: "/product/inventory-overview", permission: "page.product.inventory-overview" }
    ]
  },
  {
    key: "orders",
    label: "订单中心",
    items: [
      { label: "订单工作台", href: "/orders", permission: "page.orders.workbench" },
      { label: "全部订单", href: "/orders/all", permission: "page.orders.all" },
      { label: "售后订单", href: "/orders/after-sales", permission: "page.orders.after-sale" },
      { label: "异常订单", href: "/orders/exceptions", permission: "page.orders.exceptions" }
    ]
  },
  { key: "affiliate", label: "推广中心", items: [] },
  { key: "service", label: "客服中心", items: [] },
  { key: "analytics", label: "数据中心", items: [] },
  { key: "system", label: "系统管理", items: [] }
];

const pickerSession: OperationsSession = {
  adminUser: {
    id: "admin-picker",
    loginAccount: "picker.operator",
    name: "Picker Operator",
    status: "ACTIVE"
  },
  roles: [],
  permissions: ["module.orders", "page.orders.workbench", "page.orders.all", "orders.view", "orders.pick"]
};

assert.equal(hasPermission(pickerSession, "orders.pick"), true);
assert.equal(hasPermission(pickerSession, "orders.pack"), false);

const navigation = filterNavigation(modules, pickerSession);
assert.deepEqual(navigation.map((module) => module.label), ["订单中心"]);
assert.deepEqual(navigation[0].items.map((item) => item.label), ["订单工作台", "全部订单"]);

assert.equal(canAccessPath("/orders", modules, pickerSession), true);
assert.equal(canAccessPath("/orders/all", modules, pickerSession), true);
assert.equal(canAccessPath("/orders/order-123", modules, pickerSession), true);
assert.equal(canAccessPath("/warehouse/packing", modules, pickerSession), true);
assert.equal(canAccessPath("/warehouse/inventory", modules, pickerSession), false);
assert.equal(canAccessPath("/orders/after-sales", modules, pickerSession), false);
assert.equal(canAccessPath("/orders/exceptions", modules, pickerSession), false);
assert.equal(canAccessPath("/system/warehouse/locations", modules, pickerSession), false);
assert.equal(modules.some((module) => module.label === "仓库履约"), false);

const managerSession: OperationsSession = {
  adminUser: {
    id: "admin-manager",
    loginAccount: "operations.manager",
    name: "Operations Manager",
    status: "ACTIVE"
  },
  roles: [],
  permissions: [
    "module.orders",
    "module.product",
    "page.orders.workbench",
    "page.orders.all",
    "page.orders.after-sale",
    "page.orders.exceptions",
    "page.product.warehouse-locations",
    "page.product.inventory-overview",
    "orders.view",
    "warehouse-locations.view"
  ]
};

assert.equal(canAccessPath("/orders/after-sales", modules, managerSession), true);
assert.equal(canAccessPath("/orders/exceptions", modules, managerSession), true);
assert.equal(canAccessPath("/system/warehouse/locations", modules, managerSession), true);
assert.equal(canAccessPath("/product/warehouse-locations", modules, managerSession), true);
assert.equal(canAccessPath("/product/inventory-overview", modules, managerSession), true);
assert.equal(canAccessPath("/warehouse/inventory", modules, managerSession), true);

const accessProvider = readFileSync(new URL("../components/admin/operations-access-provider.tsx", import.meta.url), "utf8");
const accessClient = readFileSync(new URL("./system/access-client.ts", import.meta.url), "utf8");
const accessTransport = readFileSync(new URL("../lib/operations-api.ts", import.meta.url), "utf8");
assert.match(accessTransport, /operations\.access\.accessToken/);
assert.match(accessProvider, /Authorization: `Bearer \$\{accessToken\}`/);
assert.match(accessClient, /operationsFetch\(/);
assert.match(accessProvider, /addEventListener\(OPERATIONS_SESSION_EXPIRED_EVENT, sessionExpired\)/);

console.log("Operations access tests passed");

// --- every role lands in the end it actually works in ---------------------
//
// The home page "/" belongs to 商品中心 and needs a product permission. A store
// manager signing in on their phone therefore met "403 无权限访问" before they
// could touch anything, and so did the warehouse, finance, customer service and
// everyone else off the product side.
//
// Landing is now the end each role can open the most of. The named pairs below
// are the ones staff would notice: a picker opening on 货架位管理 instead of the
// morning's dispatch run is not a 403, which is exactly why it went unnoticed.

{
  const { OPERATIONS_ROLE_BLUEPRINTS } = require("../../../api/src/operations/operations-access-policy") as
    typeof import("../../../api/src/operations/operations-access-policy");
  const { operationsModules } = require("../components/admin/operations-admin-shell") as
    typeof import("../components/admin/operations-admin-shell");

  const sessionFor = (permissions: readonly string[]) =>
    ({ adminUser: null, roles: [], permissions } as unknown as OperationsSession);

  const expected: Record<string, string> = {
    WAREHOUSE_FULFILLMENT: "/orders/dispatch",
    STORE_MANAGER: "/store",
    DELIVERY_RIDER: "/rider",
    ORDER_OPERATIONS: "/orders/dispatch",
    AFFILIATE_OPERATIONS: "/affiliate",
    CUSTOMER_SERVICE: "/customer-service",
    // The money screens live in 数据中心, so that is where finance opens.
    FINANCE: "/analytics",
    DATA_ANALYST: "/analytics"
  };

  assert.equal(OPERATIONS_ROLE_BLUEPRINTS.length, 11, "a new role needs a landing page checked here");

  for (const role of OPERATIONS_ROLE_BLUEPRINTS) {
    const session = sessionFor(role.permissions);
    const landing = firstAllowedPath(operationsModules, session);
    assert.ok(landing, `${role.code} has no page it can open, so signing in would 403`);
    assert.ok(
      canAccessPath(landing!, operationsModules, session),
      `${role.code} would be redirected to ${landing}, which it cannot open`
    );
    // A landing of "/" would bounce the redirect back into the 403 it came from.
    assert.notEqual(landing, "/", `${role.code} must land somewhere other than the home page`);

    const wanted = expected[role.code];
    if (wanted) assert.equal(landing, wanted, `${role.code} should open on ${wanted}`);
  }

  // The three product-side roles can open "/" and are never redirected, so
  // their landing is unasserted on purpose rather than forgotten.
  for (const code of ["SUPER_ADMIN", "PROJECT_MANAGER", "PRODUCT_DIGITIZATION"]) {
    const role = OPERATIONS_ROLE_BLUEPRINTS.find((item) => item.code === code)!;
    assert.ok(
      canAccessPath("/", operationsModules, sessionFor(role.permissions)),
      `${code} can no longer open the home page, so it now needs a landing of its own`
    );
  }
}

console.log("operations access tests passed");
