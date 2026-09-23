import assert from "node:assert/strict";
import { dictionary, normalizeStorefrontLocale, translate, translateValue } from "./dictionary";

assert.deepEqual(Object.keys(dictionary.en).sort(), Object.keys(dictionary["zh-CN"]).sort());
assert.equal(normalizeStorefrontLocale("zh-Hans"), "zh-CN");
assert.equal(normalizeStorefrontLocale("en-KE"), "en");
assert.equal(translate("zh-CN", "payment.confirmed"), "付款成功");
assert.equal(translate("en", "catalog.viewItems", { count: 3 }), "View 3 items");
assert.equal(translateValue("zh-CN", "Shoes"), "鞋");
assert.equal(translateValue("zh-CN", "Hoodies & sweatshirts"), "卫衣与连帽衫");
assert.equal(translateValue("en", "Shoes"), "Shoes");

// The deposit plan is the one flow where a shopper is told about money they
// can lose. Every one of its strings has to exist in both languages, and every
// placeholder has to survive translation — a zh copy that dropped {amount}
// would quietly show "still to pay" with no figure.
const depositKeys = Object.keys(dictionary.en).filter((key) =>
  key.startsWith("plan.") || key.startsWith("balance.") || key.startsWith("pay.")
  || key.startsWith("orders.lookup") || key.startsWith("order.deposit"));
assert.ok(depositKeys.length >= 30, "the deposit copy should be in the dictionary, not inline");

for (const key of depositKeys) {
  const english = dictionary.en[key as keyof typeof dictionary.en];
  const chinese = dictionary["zh-CN"][key as keyof typeof dictionary.en];
  assert.ok(chinese && chinese.trim().length, `${key} has no Chinese copy`);
  const placeholders = (text: string) => (text.match(/\{[a-zA-Z]+\}/g) ?? []).sort();
  assert.deepEqual(placeholders(chinese), placeholders(english), `${key} lost a placeholder in translation`);
}

console.log("Storefront dictionary tests passed");
