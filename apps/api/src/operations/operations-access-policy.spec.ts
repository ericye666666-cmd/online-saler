import assert from "node:assert/strict";
import test from "node:test";
import {
  OPERATIONS_PERMISSIONS,
  OPERATIONS_ROLE_BLUEPRINTS,
  hasOperationsPermission,
  hashPassword,
  rolePermissionCodes,
  uniquePermissionCodes,
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
  assert.equal(hasOperationsPermission(permissions, "page.product.details"), false);
  assert.equal(hasOperationsPermission(permissions, "action.system.manage-users"), false);
});

test("product detail generation is limited to project managers and super admins", () => {
  assert.equal(hasOperationsPermission(rolePermissionCodes(["PROJECT_MANAGER"]), "page.product.details"), true);
  assert.equal(hasOperationsPermission(rolePermissionCodes(["SUPER_ADMIN"]), "page.product.details"), true);
});

test("permission helper returns sorted unique permission codes", () => {
  assert.deepEqual(uniquePermissionCodes(["b", "a", "b"]), ["a", "b"]);
});

test("password hashing verifies only the original password", () => {
  const hash = hashPassword("ChangeMe43!", "fixedsalt");
  assert.equal(verifyPassword("ChangeMe43!", hash), true);
  assert.equal(verifyPassword("wrong-password", hash), false);
});
