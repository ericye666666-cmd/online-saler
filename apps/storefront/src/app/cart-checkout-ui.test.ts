import assert from "node:assert/strict";
import {
  checkoutStage,
  checkoutStepStatus,
  deliveryRequiresAddress,
  googleMapsConfigured
} from "./cart-checkout-ui";

assert.equal(deliveryRequiresAddress("PICKUP"), false);
assert.equal(deliveryRequiresAddress("KIKUYU_LOCAL_DELIVERY"), true);

assert.equal(googleMapsConfigured(undefined), false);
assert.equal(googleMapsConfigured(""), false);
assert.equal(googleMapsConfigured("  "), false);
assert.equal(googleMapsConfigured("AIza-test-key"), true);

assert.equal(checkoutStage(false, false), "details");
assert.equal(checkoutStage(true, false), "payment");
assert.equal(checkoutStage(true, true), "complete");

assert.equal(checkoutStepStatus("details", "details"), "current");
assert.equal(checkoutStepStatus("payment", "details"), "done");
assert.equal(checkoutStepStatus("payment", "payment"), "current");
assert.equal(checkoutStepStatus("payment", "complete"), "pending");
assert.equal(checkoutStepStatus("complete", "payment"), "done");
assert.equal(checkoutStepStatus("complete", "complete"), "current");

console.log("Cart checkout UI helper tests passed");
