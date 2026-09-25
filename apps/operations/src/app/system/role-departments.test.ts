import assert from "node:assert/strict";

import { OPERATIONS_ROLE_BLUEPRINTS } from "../../../../api/src/operations/operations-access-policy";
import { translate } from "../../i18n/dictionary";
import { DEPARTMENTS, ROLE_DEPARTMENTS, accountDepartments, roleDepartment, roleLabel } from "./role-labels";

// Every role the system ships with has exactly one department. A new role
// added to the blueprints without one would sink into 其他 on the account
// screen, and filtering by its real department would quietly miss those people.
for (const role of OPERATIONS_ROLE_BLUEPRINTS) {
  const department = ROLE_DEPARTMENTS[role.code];
  assert.ok(
    department,
    `${role.code} has no department in ROLE_DEPARTMENTS (apps/operations/src/app/system/role-labels.ts)`
  );
  assert.ok(DEPARTMENTS.includes(department), `${role.code} maps to unknown department ${department}`);
  assert.notEqual(roleLabel(role.code), role.code, `${role.code} has no Chinese label in ROLE_LABELS`);
}

// And nothing is mapped that the system does not have.
const blueprintCodes = new Set(OPERATIONS_ROLE_BLUEPRINTS.map((role) => role.code));
for (const code of Object.keys(ROLE_DEPARTMENTS)) {
  assert.ok(blueprintCodes.has(code), `ROLE_DEPARTMENTS lists ${code}, which is not a role blueprint`);
}

// Every department name reads in English too.
for (const department of DEPARTMENTS) {
  assert.notEqual(translate("en", department), department, `Department "${department}" has no English translation`);
}

// The owner's rule: riders are store side.
assert.equal(roleDepartment("DELIVERY_RIDER"), "门店端");
assert.equal(roleDepartment("STORE_MANAGER"), "门店端");

// A role somebody created by hand still shows up, under 其他.
assert.equal(roleDepartment("HAND_MADE_ROLE"), "其他");
assert.deepEqual(accountDepartments([]), ["其他"]);
assert.deepEqual(accountDepartments(["FINANCE", "FINANCE"]), ["财务"]);

console.log(`role departments ok (${OPERATIONS_ROLE_BLUEPRINTS.length} roles)`);
