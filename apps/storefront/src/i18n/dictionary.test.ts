import assert from "node:assert/strict";
import { dictionary, normalizeStorefrontLocale, translate, translateValue } from "./dictionary";

assert.deepEqual(Object.keys(dictionary.en).sort(), Object.keys(dictionary["zh-CN"]).sort());
assert.equal(normalizeStorefrontLocale("zh-Hans"), "zh-CN");
assert.equal(normalizeStorefrontLocale("en-KE"), "en");
assert.equal(translate("zh-CN", "payment.confirmed"), "付款成功");
assert.equal(translate("en", "catalog.viewItems", { count: 3 }), "View 3 items");
assert.equal(translateValue("zh-CN", "Shoes"), "鞋履");
assert.equal(translateValue("en", "Shoes"), "Shoes");

console.log("Storefront dictionary tests passed");
