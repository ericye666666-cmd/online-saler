import assert from "node:assert/strict";
import {
  calculateOrderAmounts,
  normalizeCustomerEmail,
  ORDER_CURRENCY
} from "./transaction-domain";

assert.equal(normalizeCustomerEmail("  Eric@Example.COM "), "eric@example.com");
assert.deepEqual(
  calculateOrderAmounts(
    [
      { productId: "product-1", unitPriceKsh: 450 },
      { productId: "product-2", unitPriceKsh: 650 }
    ],
    50
  ),
  {
    itemSubtotalKsh: 1100,
    deliveryFeeKsh: 50,
    totalKsh: 1150,
    currency: ORDER_CURRENCY
  }
);
assert.throws(
  () => calculateOrderAmounts([{ productId: "product-1", unitPriceKsh: 450 }, { productId: "product-1", unitPriceKsh: 450 }], 0),
  /cannot appear twice/
);
assert.throws(
  () => calculateOrderAmounts([{ productId: "product-1", unitPriceKsh: 0 }], 0),
  /positive integer price/
);

console.log("Transaction domain tests passed");
