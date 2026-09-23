import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOMER_SERVICE_CASE_GROUPS,
  CUSTOMER_SERVICE_CASE_TYPES,
  DEFAULT_CUSTOMER_SERVICE_SLA_HOURS,
  caseGroupForCaseType,
  customerServiceCaseTypesByGroup,
  customerServiceSlaDueAt,
  defaultPriorityForCaseType,
  isCustomerServiceCaseOverdue,
  isCustomerServiceCaseType,
  issueTypeForCaseType,
  resolveCustomerServiceSlaHours,
  suggestedEscalationTarget,
  whatsAppLinkForPhone
} from "./customer-service";

test("every case type lands in exactly one group, and the picker shows them all", () => {
  const grouped = customerServiceCaseTypesByGroup();
  assert.deepEqual(grouped.map((entry) => entry.group), [...CUSTOMER_SERVICE_CASE_GROUPS]);
  const listed = grouped.flatMap((entry) => entry.caseTypes);
  assert.equal(listed.length, CUSTOMER_SERVICE_CASE_TYPES.length, "no case type is dropped or duplicated");
  assert.deepEqual([...listed].sort(), [...CUSTOMER_SERVICE_CASE_TYPES].sort());
});

test("every case type maps onto a coarse queue the workbench already renders", () => {
  const queues = new Set(["PAYMENT", "PICKUP", "DELIVERY", "AFTER_SALE", "ORDER", "OTHER"]);
  for (const caseType of CUSTOMER_SERVICE_CASE_TYPES) {
    assert.ok(queues.has(issueTypeForCaseType(caseType)), `${caseType} maps to a known queue`);
  }
});

test("payment reasons go to finance and delivery reasons go to fulfillment", () => {
  assert.equal(suggestedEscalationTarget("DUPLICATE_PAYMENT"), "FINANCE");
  assert.equal(suggestedEscalationTarget("ORDER_LATE"), "FULFILLMENT");
  // A refund is money leaving the business, so it is finance's call even though
  // the customer raised it as an after-sales problem.
  assert.equal(suggestedEscalationTarget("REFUND_REQUEST"), "FINANCE");
  assert.equal(suggestedEscalationTarget("OTHER"), "ADMIN");
});

test("a customer who paid and got nothing starts at the top of the queue", () => {
  assert.equal(defaultPriorityForCaseType("PAID_BUT_ORDER_MISSING"), "URGENT");
  assert.equal(defaultPriorityForCaseType("DELIVERY_CODE_NOT_RECEIVED"), "URGENT");
  assert.equal(defaultPriorityForCaseType("SIZE_ISSUE"), "NORMAL");
});

test("product complaints are grouped as PRODUCT but queue as after-sale", () => {
  assert.equal(caseGroupForCaseType("DAMAGED_ITEM"), "PRODUCT");
  assert.equal(issueTypeForCaseType("DAMAGED_ITEM"), "AFTER_SALE");
});

test("an unknown case type is rejected rather than silently becoming OTHER", () => {
  assert.equal(isCustomerServiceCaseType("DAMAGED_ITEM"), true);
  assert.equal(isCustomerServiceCaseType("NOT_A_REAL_TYPE"), false);
  assert.equal(isCustomerServiceCaseType(undefined), false);
  assert.equal(isCustomerServiceCaseType({ toString: () => "OTHER" }), false);
});

test("the SLA deadline follows priority", () => {
  const createdAt = new Date("2026-09-23T08:00:00.000Z");
  assert.equal(customerServiceSlaDueAt("URGENT", createdAt).toISOString(), "2026-09-23T10:00:00.000Z");
  assert.equal(customerServiceSlaDueAt("LOW", createdAt).toISOString(), "2026-09-24T08:00:00.000Z");
});

test("a stored SLA override only replaces the priorities it actually names", () => {
  const resolved = resolveCustomerServiceSlaHours({ URGENT: 1, HIGH: 3 });
  assert.equal(resolved.URGENT, 1);
  assert.equal(resolved.HIGH, 3);
  assert.equal(resolved.NORMAL, DEFAULT_CUSTOMER_SERVICE_SLA_HOURS.NORMAL);
  assert.equal(resolved.LOW, DEFAULT_CUSTOMER_SERVICE_SLA_HOURS.LOW);
});

test("a nonsense SLA setting cannot leave a case with no real deadline", () => {
  for (const stored of [null, undefined, "4", [], { URGENT: 0 }, { URGENT: -5 }, { URGENT: "2" }, { URGENT: Number.NaN }, { URGENT: 100000 }]) {
    assert.deepEqual(resolveCustomerServiceSlaHours(stored), DEFAULT_CUSTOMER_SERVICE_SLA_HOURS, `rejects ${JSON.stringify(stored)}`);
  }
});

test("only an unfinished case can be overdue", () => {
  const past = new Date("2026-09-23T08:00:00.000Z");
  const now = new Date("2026-09-23T09:00:00.000Z");
  assert.equal(isCustomerServiceCaseOverdue({ status: "OPEN", slaDueAt: past }, now), true);
  assert.equal(isCustomerServiceCaseOverdue({ status: "IN_PROGRESS", slaDueAt: past }, now), true);
  // Missing the deadline before resolving it does not keep it on the dashboard.
  assert.equal(isCustomerServiceCaseOverdue({ status: "RESOLVED", slaDueAt: past }, now), false);
  assert.equal(isCustomerServiceCaseOverdue({ status: "CLOSED", slaDueAt: past }, now), false);
  assert.equal(isCustomerServiceCaseOverdue({ status: "OPEN", slaDueAt: null }, now), false);
  assert.equal(isCustomerServiceCaseOverdue({ status: "OPEN", slaDueAt: new Date("2026-09-23T10:00:00.000Z") }, now), false);
});

test("WhatsApp links are built from the number the customer actually gave us", () => {
  // Shoppers read their number out as 0712...; M-Pesa stores it as 254712....
  assert.equal(whatsAppLinkForPhone("0712345678"), "https://wa.me/254712345678");
  assert.equal(whatsAppLinkForPhone("254712345678"), "https://wa.me/254712345678");
  assert.equal(whatsAppLinkForPhone("712345678"), "https://wa.me/254712345678");
  assert.equal(whatsAppLinkForPhone("+254 712 345 678"), "https://wa.me/254712345678");
});

test("a number we cannot dial gives no link at all", () => {
  for (const phone of [null, undefined, "", "12345", "254812345678", "not a phone"]) {
    assert.equal(whatsAppLinkForPhone(phone), null, `rejects ${String(phone)}`);
  }
});

test("a prefilled WhatsApp message is escaped, not concatenated", () => {
  assert.equal(
    whatsAppLinkForPhone("0712345678", "Order DL-1001 & your refund"),
    "https://wa.me/254712345678?text=Order%20DL-1001%20%26%20your%20refund"
  );
  assert.equal(whatsAppLinkForPhone("0712345678", "   "), "https://wa.me/254712345678");
});
