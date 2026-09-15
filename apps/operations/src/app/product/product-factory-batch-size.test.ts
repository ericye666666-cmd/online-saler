import assert from "node:assert/strict";
import { isAllowedProductBatchSize } from "./product-factory-batch-size";

for (const count of [1, 3, 5, 10, 25, 100]) {
  assert.equal(isAllowedProductBatchSize(count), true);
}
for (const count of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
  assert.equal(isAllowedProductBatchSize(count), false);
}
