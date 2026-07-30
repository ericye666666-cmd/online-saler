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
      { label: "商品数字化", href: "/", permission: "page.product.digitalization" },
      { label: "商品控制", href: "/control", permission: "page.product.control" }
    ]
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

const filtered = filterNavigation(modules, productSession);
assert.deepEqual(filtered.map((module) => module.key), ["product"]);
assert.deepEqual(filtered[0].items.map((item) => item.label), ["商品数字化"]);

assert.equal(canAccessPath("/", modules, productSession), true);
assert.equal(canAccessPath("/debug/ai", modules, productSession), false);
assert.equal(canAccessPath("/system/accounts", modules, productSession), false);
