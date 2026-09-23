import assert from "node:assert/strict";
import test from "node:test";
import { OPERATIONS_PERMISSIONS, OPERATIONS_ROLE_BLUEPRINTS } from "./operations-access-policy";

/**
 * The spec lists what customer service must not be able to do. These tests are
 * that list, read back off the role blueprints -- so nobody can quietly widen
 * the role by adding a permission code to it.
 */

function role(code: string) {
  const blueprint = OPERATIONS_ROLE_BLUEPRINTS.find((entry) => entry.code === code);
  assert.ok(blueprint, `${code} role exists`);
  return new Set(blueprint.permissions);
}

test("every new customer service permission is declared and belongs to its module", () => {
  const declared = new Map(OPERATIONS_PERMISSIONS.map((permission) => [permission.code, permission]));
  for (const code of [
    "customer-service.assign",
    "customer-service.escalate",
    "customer-service.contact-update",
    "customer-service.refund-request",
    "customer-service.refund-approve",
    "page.customer-service.cases",
    "page.customer-service.refunds"
  ]) {
    const permission = declared.get(code);
    assert.ok(permission, `${code} is declared`);
    assert.equal(permission.module, "customer-service", `${code} is filed under customer-service`);
  }
});

test("customer service can raise a refund request but can never approve or record one", () => {
  const cs = role("CUSTOMER_SERVICE");
  assert.ok(cs.has("customer-service.refund-request"));
  assert.ok(!cs.has("customer-service.refund-approve"), "cannot approve its own request");
  assert.ok(!cs.has("orders.refund"), "cannot record money as returned");
});

test("customer service cannot complete a delivery, settle a payment or touch a commission", () => {
  const cs = role("CUSTOMER_SERVICE");
  for (const forbidden of [
    "orders.complete",
    "orders.payment-review",
    "orders.write-off",
    "orders.dispatch",
    "orders.cancel",
    "action.affiliate.approve",
    "action.affiliate.edit",
    "action.product.edit",
    "action.product.publish",
    "warehouse-locations.move-product"
  ]) {
    assert.ok(!cs.has(forbidden), `customer service must not hold ${forbidden}`);
  }
});

test("customer service can resend a delivery code, which is the only code action there is", () => {
  const cs = role("CUSTOMER_SERVICE");
  assert.ok(cs.has("orders.resend-code"));
  // There is deliberately no permission that reveals a code: resending mints a
  // new one and texts it to the customer, and the plaintext never comes back.
  assert.ok(!OPERATIONS_PERMISSIONS.some((permission) => /view-code|read-code|reveal/.test(permission.code)));
});

test("finance approves refunds and customer service does not; neither role is both halves", () => {
  const finance = role("FINANCE");
  assert.ok(finance.has("customer-service.refund-approve"));
  assert.ok(finance.has("orders.refund"), "finance records the executed refund");
  assert.ok(!finance.has("customer-service.refund-request"), "finance cannot raise the request it approves");
});

test("only finance and the super admin can approve a refund", () => {
  const approvers = OPERATIONS_ROLE_BLUEPRINTS
    .filter((blueprint) => blueprint.permissions.includes("customer-service.refund-approve"))
    .map((blueprint) => blueprint.code)
    .sort();
  assert.deepEqual(approvers, ["FINANCE", "SUPER_ADMIN"]);
});

test("customer service can own and escalate a case", () => {
  const cs = role("CUSTOMER_SERVICE");
  assert.ok(cs.has("customer-service.assign"));
  assert.ok(cs.has("customer-service.escalate"));
  assert.ok(cs.has("customer-service.contact-update"));
  assert.ok(cs.has("page.customer-service.cases"));
});
