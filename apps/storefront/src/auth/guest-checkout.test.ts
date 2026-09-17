process.env.CUSTOMER_SESSION_SECRET ??= "test-customer-session-secret-0123456789";

import assert from "node:assert/strict";
import { guestCheckoutToken, parseGuestCheckout, rememberGuestOrder, type GuestCheckout } from "./guest-checkout";

const guest: GuestCheckout = {
  customerId: "customer-1",
  phone: "254712345678",
  orderIds: ["order-a"],
  expiresAt: Date.now() + 60_000
};

// A signed cookie survives the round trip untouched.
assert.deepEqual(parseGuestCheckout(guestCheckoutToken(guest)), guest);

// Anything the shopper edits by hand is rejected rather than trusted.
const token = guestCheckoutToken(guest);
const [payload, signature] = token.split(".");
const forged = Buffer.from(JSON.stringify({ ...guest, orderIds: ["order-b"] }), "utf8").toString("base64url");
assert.equal(parseGuestCheckout(`${forged}.${signature}`), null);
assert.equal(parseGuestCheckout(`${payload}.${signature.slice(0, -1)}x`), null);
assert.equal(parseGuestCheckout("not-a-token"), null);
assert.equal(parseGuestCheckout(undefined), null);

// Expired cookies stop granting access.
assert.equal(parseGuestCheckout(guestCheckoutToken({ ...guest, expiresAt: Date.now() - 1 })), null);

// A guest only ever reaches the orders this device started.
const parsed = parseGuestCheckout(guestCheckoutToken(guest))!;
assert.equal(parsed.orderIds.includes("order-a"), true);
assert.equal(parsed.orderIds.includes("someone-elses-order"), false);

// Newest order first, no duplicates.
const second = rememberGuestOrder(guest, "customer-1", "254712345678", "order-b");
assert.deepEqual(second.orderIds, ["order-b", "order-a"]);
assert.deepEqual(rememberGuestOrder(second, "customer-1", "254712345678", "order-a").orderIds, ["order-a", "order-b"]);

// The cookie rides on every request, so the remembered list stays bounded.
let capped = rememberGuestOrder(null, "customer-1", "254712345678", "order-0");
for (let index = 1; index <= 25; index += 1) {
  capped = rememberGuestOrder(capped, "customer-1", "254712345678", `order-${index}`);
}
assert.equal(capped.orderIds.length, 20);
assert.equal(capped.orderIds[0], "order-25");
assert.equal(capped.orderIds.includes("order-0"), false);

// Checking out with a different M-Pesa number is a different shopper: the
// previous customer's orders must not carry over to the new identity.
const switched = rememberGuestOrder(guest, "customer-2", "254798765432", "order-c");
assert.deepEqual(switched.orderIds, ["order-c"]);
assert.equal(switched.customerId, "customer-2");
assert.equal(switched.phone, "254798765432");

console.log("Guest checkout tests passed");
