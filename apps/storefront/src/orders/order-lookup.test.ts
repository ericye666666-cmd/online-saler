import assert from "node:assert/strict";
import { callerHash, normalizeOrderNumber } from "./order-lookup";

// Order numbers are read off a phone screen and typed back in. Case and stray
// spaces must not be the reason a shopper misses a deposit deadline.
assert.equal(normalizeOrderNumber(" dl-20260923-a1b2c3d4 "), "DL-20260923-A1B2C3D4");
assert.equal(normalizeOrderNumber("DL-20260923-A1B2C3D4"), "DL-20260923-A1B2C3D4");
assert.equal(normalizeOrderNumber("dl 20260923 a1b2c3d4"), "DL20260923A1B2C3D4");
assert.equal(normalizeOrderNumber("   "), "");

// The caller's address is only ever stored hashed, and the hash is stable so a
// repeat attempt from the same caller counts against the same bucket.
const first = callerHash("41.90.1.2");
assert.equal(first, callerHash("41.90.1.2"));
assert.notEqual(first, callerHash("41.90.1.3"));
assert.ok(first && !first.includes("41.90"), "the raw address must never survive hashing");

// Cloud Run sends a comma-separated chain; only the client address counts, or
// every request behind the same proxy would share one rate-limit bucket.
assert.equal(callerHash("41.90.1.2, 10.0.0.1, 10.0.0.2"), first);

// No address at all is not an error: the lookup still runs, and the per-phone
// ceiling is what holds. Returning a constant here instead would put every
// address-less caller in one shared bucket and lock out real shoppers.
assert.equal(callerHash(null), null);
assert.equal(callerHash(""), null);
assert.equal(callerHash("   "), null);

console.log("Order lookup tests passed");
