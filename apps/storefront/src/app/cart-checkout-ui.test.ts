import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const checkoutPage = readFileSync(new URL("./checkout/checkout-page-client.tsx", import.meta.url), "utf8");
assert.doesNotMatch(checkoutPage, /checkoutServiceStrip|commerceFeatureGrid|CheckoutProgress/);
assert.match(checkoutPage, /payment\.confirmed/);
assert.match(checkoutPage, /payment\.nextTitle/);
assert.match(checkoutPage, /Direct Loop customer service/);
assert.match(checkoutPage, /payment\.viewOrder/);

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
