import assert from "node:assert/strict";
import test from "node:test";
import {
  OPERATIONS_PERMISSIONS,
  OPERATIONS_ROLE_BLUEPRINTS,
  bearerOperationsAccessToken,
  hasOperationsPermission,
  hashPassword,
  issueOperationsAccessToken,
  operationsAccessTokenSubject,
  rolePermissionCodes,
  uniquePermissionCodes,
  verifyOperationsAccessToken,
  verifyPassword
} from "./operations-access-policy";

test("super admin role includes every operations permission", () => {
  const admin = OPERATIONS_ROLE_BLUEPRINTS.find((role) => role.code === "SUPER_ADMIN");
  assert.ok(admin);
  assert.deepEqual(admin.permissions.sort(), OPERATIONS_PERMISSIONS.map((permission) => permission.code).sort());
});

test("product digitization role cannot access system account management", () => {
  const permissions = rolePermissionCodes(["PRODUCT_DIGITIZATION"]);
  assert.equal(hasOperationsPermission(permissions, "page.product.digitalization"), true);
  assert.equal(hasOperationsPermission(permissions, "page.product.warehouse-locations"), true);
  assert.equal(hasOperationsPermission(permissions, "inventory-overview.view"), true);
  assert.equal(hasOperationsPermission(permissions, "warehouse-locations.edit-capacity"), false);
  assert.equal(hasOperationsPermission(permissions, "page.product.details"), false);
  assert.equal(hasOperationsPermission(permissions, "action.system.manage-users"), false);
});

test("warehouse management mutations require explicit supervisor permissions", () => {
  const manager = rolePermissionCodes(["PROJECT_MANAGER"]);
  assert.equal(hasOperationsPermission(manager, "warehouse-locations.manage"), true);
  assert.equal(hasOperationsPermission(manager, "warehouse-locations.edit-capacity"), true);
  assert.equal(hasOperationsPermission(manager, "warehouse-locations.move-product"), true);
  assert.equal(hasOperationsPermission(rolePermissionCodes(["DATA_ANALYST"]), "analytics.warehouse.view"), true);
});

test("product detail generation is limited to project managers and super admins", () => {
  assert.equal(hasOperationsPermission(rolePermissionCodes(["PROJECT_MANAGER"]), "page.product.details"), true);
  assert.equal(hasOperationsPermission(rolePermissionCodes(["SUPER_ADMIN"]), "page.product.details"), true);
});

test("order fulfillment permissions are action-specific", () => {
  const permissions = rolePermissionCodes(["WAREHOUSE_FULFILLMENT"]);
  assert.equal(hasOperationsPermission(permissions, "orders.view"), true);
  assert.equal(hasOperationsPermission(permissions, "orders.pick"), true);
  assert.equal(hasOperationsPermission(permissions, "orders.pack"), true);
  assert.equal(hasOperationsPermission(permissions, "orders.dispatch"), true);
  assert.equal(hasOperationsPermission(permissions, "orders.assign-rider"), false);
  assert.equal(hasOperationsPermission(permissions, "orders.cancel"), false);
  assert.equal(hasOperationsPermission(permissions, "warehouse-locations.manage"), false);
});

test("an employee without an order action permission cannot modify fulfillment state", () => {
  const productPermissions = rolePermissionCodes(["PRODUCT_DIGITIZATION"]);
  assert.equal(hasOperationsPermission(productPermissions, "orders.view"), false);
  assert.equal(hasOperationsPermission(productPermissions, "orders.pick"), false);
  assert.equal(hasOperationsPermission(productPermissions, "orders.pack"), false);
  assert.equal(hasOperationsPermission(productPermissions, "orders.complete"), false);
});

test("permission helper returns sorted unique permission codes", () => {
  assert.deepEqual(uniquePermissionCodes(["b", "a", "b"]), ["a", "b"]);
});

test("password hashing verifies only the original password", () => {
  const hash = hashPassword("ChangeMe43!", "fixedsalt");
  assert.equal(verifyPassword("ChangeMe43!", hash), true);
  assert.equal(verifyPassword("wrong-password", hash), false);
});

test("operations access tokens are signed, expire, and reject tampering", () => {
  const now = new Date("2026-08-12T10:00:00.000Z");
  const passwordHash = hashPassword("ChangeMe43!", "fixedsalt");
  const issued = issueOperationsAccessToken("admin-123", passwordHash, now);

  assert.equal(operationsAccessTokenSubject(issued.accessToken), "admin-123");
  assert.equal(verifyOperationsAccessToken(issued.accessToken, passwordHash, now)?.sub, "admin-123");
  assert.equal(verifyOperationsAccessToken(`${issued.accessToken}x`, passwordHash, now), null);
  assert.equal(verifyOperationsAccessToken(issued.accessToken, `${passwordHash}changed`, now), null);
  assert.equal(verifyOperationsAccessToken(issued.accessToken, passwordHash, new Date("2026-08-12T22:00:01.000Z")), null);
  assert.equal(bearerOperationsAccessToken(`Bearer ${issued.accessToken}`), issued.accessToken);
  assert.equal(bearerOperationsAccessToken("admin-123"), null);
});
