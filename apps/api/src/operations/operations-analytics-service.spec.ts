import assert from "node:assert/strict";
import test from "node:test";
import { noSourceMetric, ratio } from "./operations-analytics.service";
import { parseTags } from "./operations-customer-service.service";

test("analytics ratio returns one-decimal percentage and no value without a denominator", () => {
  assert.equal(ratio(7, 20), 35);
  assert.equal(ratio(1, 6), 16.7);
  assert.equal(ratio(1, 0), null);
});

test("no-source analytics metric cannot be mistaken for real data", () => {
  const metric = noSourceMetric("productViews", "商品浏览量", "No server event source yet.");
  assert.equal(metric.value, null);
  assert.equal(metric.status, "NO_SOURCE");
  assert.equal(metric.source, "No source");
});

test("customer service tags are normalized and bounded", () => {
  assert.deepEqual(parseTags(" mpesa, urgent, , delivery "), ["mpesa", "urgent", "delivery"]);
  assert.deepEqual(parseTags([" one ", "", "two"]), ["one", "two"]);
});
