import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { fillPlaceholders, hasEnglishTranslation, placeholderNames, translate } from "./dictionary";
import { enDictionary } from "./en";
import { normalizeOperationsLocale } from "./locale";
import { kidsAgeRangeLabels } from "../app/product/apparel-size";
import { setOperationsRuntimeLocale } from "./runtime";
import { ORDER_STATUS_TABS } from "../app/orders/order-center-routes";
import {
  PRODUCT_FACTORY_STAGE_LABELS,
  PRODUCT_FACTORY_WORKFLOW_STAGE_LABELS
} from "../app/product/product-factory-batch-display";
import { IMAGE_ISSUE_LABELS, PRODUCT_STATUS_LABELS } from "../app/product/product-factory-display";

// Chinese is the source language, so it always renders the key itself.
assert.equal(translate("zh-CN", "商品中心"), "商品中心");
assert.equal(translate("en", "商品中心"), "Product centre");

// A key with no English copy yet must fall back to Chinese rather than render blank.
assert.equal(translate("en", "尚未翻译的文案"), "尚未翻译的文案");
assert.equal(translate("en", ""), "");

// Placeholders are filled in both languages, and unknown ones are left untouched.
assert.equal(fillPlaceholders("{label}为必填项。", { label: "价格" }), "价格为必填项。");
assert.equal(translate("en", "{label}为必填项。", { label: "Price" }), "Price is required.");
assert.equal(fillPlaceholders("{a} 和 {b}", { a: 1 }), "1 和 {b}");
assert.equal(fillPlaceholders("{count} 件", { count: null }), " 件");

// Every English string must carry exactly the placeholders its Chinese source declares,
// otherwise switching language silently drops a number from the sentence.
for (const [source, english] of Object.entries(enDictionary)) {
  assert.ok(english.trim().length > 0, `English copy for "${source}" is empty.`);
  assert.deepEqual(
    [...placeholderNames(english)].sort(),
    [...placeholderNames(source)].sort(),
    `Placeholders differ between "${source}" and "${english}".`
  );
}

assert.equal(normalizeOperationsLocale("en"), "en");
assert.equal(normalizeOperationsLocale("fr"), "zh-CN");
assert.equal(normalizeOperationsLocale(undefined), "zh-CN");

// Label maps that live at module scope are translated where they render, so every value in them
// has to be a dictionary key. Without this, adding a status label silently leaves English broken.
const labelSources = [
  ...Object.values(PRODUCT_STATUS_LABELS),
  ...Object.values(IMAGE_ISSUE_LABELS),
  ...Object.values(PRODUCT_FACTORY_STAGE_LABELS),
  ...Object.values(PRODUCT_FACTORY_WORKFLOW_STAGE_LABELS),
  ...ORDER_STATUS_TABS.map(([, label]) => label)
];

for (const source of labelSources) {
  assert.notEqual(
    translate("en", source),
    source,
    `Label "${source}" has no English translation in enDictionary.`
  );
}

console.log(
  `operations i18n ok (${Object.keys(enDictionary).length} keys, ${labelSources.length} module-scope labels)`
);

// These labels are assembled from the size chart on every call. Building them in a module constant
// instead would freeze the language that was active when the module first loaded.
setOperationsRuntimeLocale("en");
const englishAgeLabels = Object.values(kidsAgeRangeLabels());
setOperationsRuntimeLocale("zh-CN");
const chineseAgeLabels = Object.values(kidsAgeRangeLabels());

assert.ok(englishAgeLabels.some((label) => label.includes("years")), "Kids age labels never render in English.");
assert.ok(chineseAgeLabels.some((label) => label.includes("岁")), "Kids age labels never render in Chinese.");
assert.notDeepEqual(englishAgeLabels, chineseAgeLabels, "Kids age labels are frozen to one language.");

console.log(`operations i18n kids age labels ok (${englishAgeLabels.length} rows)`);

/**
 * Every Chinese string the workspace renders has to have English beside it.
 *
 * `translate` falls back to the Chinese source when a key is missing, which is
 * what lets this file grow page by page without breaking the UI — and is also
 * why a missing translation is invisible unless somebody switches to English and
 * looks. A feature shipped over two days put four hundred Chinese strings on
 * screen for English-reading staff, and nothing failed. This is that check.
 */
const sourceRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceFiles = globSync("**/*.{ts,tsx}", { cwd: sourceRoot })
  .map((file) => file.replace(/\\/g, "/"))
  .filter((file) => !file.includes(".test."));
// A glob that matches nothing would make this whole check pass silently, which
// is the same failure it exists to catch.
assert.ok(sourceFiles.length > 100, `only ${sourceFiles.length} source files found — the glob is not reaching them`);
const chineseCall = /\bt\(\s*"((?:[^"\\]|\\.)*)"/g;
const chinese = /[一-鿿]/;
const untranslated: string[] = [];

for (const file of sourceFiles) {
  const source = readFileSync(new URL(`../${file.replace(/\\/g, "/")}`, import.meta.url), "utf8");
  for (const match of source.matchAll(chineseCall)) {
    const key = match[1]!.replace(/\\"/g, '"');
    if (!chinese.test(key)) continue;
    if (hasEnglishTranslation(key)) continue;
    untranslated.push(`${file}: ${key}`);
  }
}

assert.deepEqual(
  untranslated,
  [],
  `These Chinese strings render to English-reading staff as Chinese. Add them to enDictionary:\n${untranslated.join("\n")}`
);

console.log(`operations i18n coverage ok (${sourceFiles.length} source files, every t("中文") translated)`);
