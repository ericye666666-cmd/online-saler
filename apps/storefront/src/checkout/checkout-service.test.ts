import assert from "node:assert/strict";
import { normalizeKenyaPhone } from "./checkout-service";
import { normalizeNotificationPhone } from "@online-saler/database";
import { KIKUYU_DELIVERY_FEE_KSH, getDeliveryFeeKsh, calculateOrderAmounts, formatDeliveryAddress, parseDeliveryAddress, deliveryMapUrl } from "@online-saler/business-rules";

// Pickup is free; local delivery charges the shopper a flat KSh 50 that the
// node's actual Bolt fare is later measured against.
assert.equal(getDeliveryFeeKsh("PICKUP"), 0);
assert.equal(getDeliveryFeeKsh("KIKUYU_LOCAL_DELIVERY"), KIKUYU_DELIVERY_FEE_KSH);
assert.equal(KIKUYU_DELIVERY_FEE_KSH, 50);
assert.equal(calculateOrderAmounts([{ productId: "unique-shirt", unitPriceKsh: 300 }], getDeliveryFeeKsh("PICKUP")).totalKsh, 300);
assert.equal(calculateOrderAmounts([{ productId: "unique-shirt", unitPriceKsh: 300 }], getDeliveryFeeKsh("KIKUYU_LOCAL_DELIVERY")).totalKsh, 350);
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

// Checkout no longer sends a WhatsApp number. The server stores null for it,
// and every notification and staff screen falls back to the M-Pesa phone.
assert.equal(normalizeNotificationPhone(undefined), null);
assert.equal(normalizeNotificationPhone(null), null);
assert.equal(normalizeNotificationPhone(""), null);

console.log("Checkout service tests passed");
