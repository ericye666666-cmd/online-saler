import assert from "node:assert/strict";
import { normalizeKenyaPhone } from "./checkout-service";
import { getDeliveryFeeKsh, calculateOrderAmounts, formatDeliveryAddress, parseDeliveryAddress, deliveryMapUrl } from "@online-saler/business-rules";

for (const method of ["PICKUP", "KIKUYU_LOCAL_DELIVERY"] as const) {
  assert.equal(getDeliveryFeeKsh(method), 0);
  assert.equal(calculateOrderAmounts([{ productId: "unique-shirt", unitPriceKsh: 300 }], getDeliveryFeeKsh(method)).totalKsh, 300);
}
const pin = { lat: -1.246, lng: 36.663 };
const address = formatDeliveryAddress("Kikuyu test landmark", pin);
assert.deepEqual(parseDeliveryAddress(address), { address: "Kikuyu test landmark", point: pin });
assert.equal(parseDeliveryAddress("manual address").point, null);
assert.equal(parseDeliveryAddress("address\nGoogle Maps: javascript:alert(1)").point, null);
assert.throws(() => deliveryMapUrl({ lat: 91, lng: 36 }), /Invalid/);
assert.throws(() => deliveryMapUrl({ lat: 0, lng: Number.NaN }), /Invalid/);

assert.equal(normalizeKenyaPhone("0712 345 678"), "254712345678");
assert.equal(normalizeKenyaPhone("712345678"), "254712345678");
assert.equal(normalizeKenyaPhone("+254 712 345 678"), "254712345678");
assert.equal(normalizeKenyaPhone("0112-345-678"), "254112345678");
assert.throws(() => normalizeKenyaPhone("0201234567"), /valid Kenyan/);
assert.throws(() => normalizeKenyaPhone("07123"), /valid Kenyan/);

console.log("Checkout service tests passed");
