import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dictionary } from "../i18n/dictionary";
import {
  checkoutStartBody,
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

const checkoutPage = readFileSync(new URL("./checkout/checkout-page-client.tsx", import.meta.url), "utf8");
assert.doesNotMatch(checkoutPage, /checkoutServiceStrip|commerceFeatureGrid|CheckoutProgress/);
assert.match(checkoutPage, /payment\.confirmed/);
assert.match(checkoutPage, /payment\.nextTitle/);
assert.match(checkoutPage, /t\("support\.title"\)/);
assert.match(checkoutPage, /payment\.viewOrder/);

// Checkout asks for one number, the M-Pesa phone, on a step called Payment.
// The WhatsApp field is gone and a checkout starts without a WhatsApp number.
const pickupBody = checkoutStartBody({
  productIds: ["p1"],
  phone: "0712345678",
  fulfillment: "PICKUP",
  deliveryAddress: "ignored for pickup",
  deliveryNote: "  ",
  pickupPointId: "node-1",
  paymentPlan: "FULL"
});
assert.deepEqual(pickupBody, {
  productIds: ["p1"],
  phone: "0712345678",
  fulfillmentMethod: "PICKUP",
  deliveryAddress: null,
  fulfillmentNodeId: "node-1",
  deliveryNote: null,
  paymentPlan: "FULL"
});
assert.equal("whatsappPhone" in pickupBody, false);
const deliveryBody = checkoutStartBody({
  productIds: ["p1", "p2"],
  phone: "0712345678",
  fulfillment: "KIKUYU_LOCAL_DELIVERY",
  deliveryAddress: "Kikuyu town",
  deliveryNote: "Gate B",
  pickupPointId: "node-1",
  paymentPlan: "DEPOSIT_50"
});
assert.equal(deliveryBody.deliveryAddress, "Kikuyu town");
assert.equal(deliveryBody.fulfillmentNodeId, null);
assert.equal(deliveryBody.deliveryNote, "Gate B");
assert.equal(deliveryBody.paymentPlan, "DEPOSIT_50");
assert.equal("whatsappPhone" in deliveryBody, false);

assert.doesNotMatch(checkoutPage, /whatsappPhone|checkout\.whatsapp|blockWhatsapp|stepContact/);
assert.match(checkoutPage, /t\("checkout\.stepPayment"\)/);
assert.match(checkoutPage, /checkoutStartBody\(/);
assert.equal(dictionary.en["checkout.stepPayment"], "Payment");
assert.equal(dictionary["zh-CN"]["checkout.stepPayment"], "支付");
assert.equal(dictionary.en["checkout.blockPhone"], "Add your M-Pesa phone");
assert.equal(Object.keys(dictionary.en).some((key) => key.startsWith("checkout.whatsapp")), false);

const checkoutRoute = readFileSync(new URL("./checkout/page.tsx", import.meta.url), "utf8");
assert.doesNotMatch(checkoutRoute, /Signed in as/);
assert.doesNotMatch(checkoutRoute, /className="checkoutIdentity"/);
assert.match(checkoutRoute, /customerIdentity=/);

const catalog = readFileSync(new URL("./components/catalog-app.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
assert.doesNotMatch(catalog, /filteredProducts\.length\} results/);
assert.equal((catalog.match(/className="depopMobileControlLabel"/g) ?? []).length, 2);
assert.doesNotMatch(catalog, /<strong>\{sort ===/);
assert.match(styles, /\.depopMobileFilterButton,[\s\S]*?\.depopSortControl[\s\S]*?font-size:\s*17px/);
assert.match(styles, /\.depopMobileControlLabel \{[\s\S]*?font-family:[\s\S]*?font-size:\s*17px;[\s\S]*?font-weight:\s*700/);

console.log("Cart checkout UI helper tests passed");
