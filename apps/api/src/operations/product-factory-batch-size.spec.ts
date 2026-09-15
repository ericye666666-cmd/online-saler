import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedProductBatchSize } from "./product-factory-batch-size";

test("accepts custom positive whole product counts", () => {
  for (const count of [1, 3, 5, 10, 25, 100]) {
    assert.equal(isAllowedProductBatchSize(count), true);
  }
});

test("rejects invalid counts before allocating product positions", () => {
  for (const count of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "5", null]) {
    assert.equal(isAllowedProductBatchSize(count as number), false);
  }
});
