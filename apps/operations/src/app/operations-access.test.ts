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
    items: [{ label: "商品工作台", href: "/", permission: "page.product.digitalization" }]
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
  {
    key: "system",
    label: "系统管理",
    items: [{ label: "货架位管理", href: "/system/warehouse/locations", permission: "page.system.warehouse-locations" }]
  }
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
    "module.system",
    "page.orders.workbench",
    "page.orders.all",
    "page.orders.after-sale",
    "page.orders.exceptions",
    "page.system.warehouse-locations",
    "orders.view",
    "warehouse-locations.view"
  ]
};

assert.equal(canAccessPath("/orders/after-sales", modules, managerSession), true);
assert.equal(canAccessPath("/orders/exceptions", modules, managerSession), true);
assert.equal(canAccessPath("/system/warehouse/locations", modules, managerSession), true);

console.log("Operations access tests passed");
