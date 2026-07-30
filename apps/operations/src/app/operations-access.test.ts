import assert from "node:assert/strict";
import {
  canAccessPath,
  filterNavigation,
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
      { label: "商品控制", href: "/control", permission: "page.product.control" }
    ]
  },
  {
    key: "warehouse",
    label: "仓库履约",
    items: [{ label: "待拣货", href: "/warehouse/picking", permission: "action.warehouse.view" }]
  },
  {
    key: "orders",
    label: "订单中心",
    items: [{ label: "全部订单", href: "/orders", permission: "action.orders.view" }]
  },
  {
    key: "system",
    label: "系统管理",
    items: [{ label: "账号角色", href: "/system/accounts", permission: "page.system.accounts" }]
  }
];

const productSession: OperationsSession = {
  adminUser: {
    id: "admin-1",
    loginAccount: "product.operator",
    name: "Product Operator",
    status: "ACTIVE"
  },
  roles: [],
  permissions: ["page.product.digitalization"]
};

assert.equal(hasPermission(productSession, "page.product.digitalization"), true);
assert.equal(hasPermission(productSession, "action.system.manage-users"), false);

const productNavigation = filterNavigation(modules, productSession);
assert.deepEqual(productNavigation.map((module) => module.key), ["product"]);
assert.deepEqual(productNavigation[0].items.map((item) => item.label), ["商品工作台"]);

assert.equal(canAccessPath("/", modules, productSession), true);
assert.equal(canAccessPath("/debug/ai", modules, productSession), false);
assert.equal(canAccessPath("/warehouse/picking", modules, productSession), false);
assert.equal(canAccessPath("/system/accounts", modules, productSession), false);

const warehouseSession: OperationsSession = {
  adminUser: {
    id: "admin-2",
    loginAccount: "warehouse.operator",
    name: "Warehouse Operator",
    status: "ACTIVE"
  },
  roles: [],
  permissions: ["action.warehouse.view", "action.orders.view"]
};

const warehouseNavigation = filterNavigation(modules, warehouseSession);
assert.deepEqual(warehouseNavigation.map((module) => module.key), ["warehouse", "orders"]);
assert.equal(canAccessPath("/warehouse/picking", modules, warehouseSession), true);
assert.equal(canAccessPath("/orders", modules, warehouseSession), true);
assert.equal(canAccessPath("/system/accounts", modules, warehouseSession), false);
