import assert from "node:assert/strict";
import { normalizeKenyaPhone } from "./checkout-service";

assert.equal(normalizeKenyaPhone("0712 345 678"), "254712345678");
assert.equal(normalizeKenyaPhone("712345678"), "254712345678");
assert.equal(normalizeKenyaPhone("+254 712 345 678"), "254712345678");
assert.equal(normalizeKenyaPhone("0112-345-678"), "254112345678");
assert.throws(() => normalizeKenyaPhone("0201234567"), /valid Kenyan/);
assert.throws(() => normalizeKenyaPhone("07123"), /valid Kenyan/);

console.log("Checkout service tests passed");
