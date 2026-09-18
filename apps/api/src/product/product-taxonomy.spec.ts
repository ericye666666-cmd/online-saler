import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeTaxonomyCodes,
  defaultProductTaxonomy,
  normalizeDocument,
  normalizeTaxonomyCode,
  subcategoryPairs
} from "./product-taxonomy";

test("default taxonomy keeps stable codes and a shared OTHER subcategory", () => {
  const document = defaultProductTaxonomy();
  assert.ok(document.groups.CATEGORY.some((option) => option.code === "LADY_TOPS"));
  assert.ok(document.groups.SUBCATEGORY.some((option) => option.code === "BLAZERS"));
  assert.ok(document.groups.MATERIAL.some((option) => option.code === "COTTON"));
  assert.ok(document.groups.TAG.some((option) => option.code === "HOODED"));
  assert.ok(document.groups.TAG.some((option) => option.code === "DROP_SHOULDER"));
  assert.equal(document.groups.SUBCATEGORY.find((option) => option.code === "OTHER")?.parentCode, null);
  assert.equal(new Set(document.groups.SUBCATEGORY.map((option) => option.code)).size, document.groups.SUBCATEGORY.length);
});

test("adds newly shipped default subcategories to an older persisted taxonomy", () => {
  const document = normalizeDocument({
    groups: {
      SUBCATEGORY: [
        { code: "CUSTOM_TOP", displayName: "Custom top", parentCode: "LADY_TOPS", sortOrder: 1, active: true }
      ]
    }
  });

  assert.ok(document.groups.SUBCATEGORY.some((option) => option.code === "CUSTOM_TOP"));
  assert.ok(document.groups.SUBCATEGORY.some((option) => option.code === "BLAZERS"));
});

test("adds newly shipped AI tags to an older persisted taxonomy", () => {
  const document = normalizeDocument({
    groups: {
      TAG: [
        { code: "CUSTOM_TAG", displayName: "Custom tag", sortOrder: 1, active: true }
      ]
    }
  });

  assert.ok(document.groups.TAG.some((option) => option.code === "CUSTOM_TAG"));
  assert.ok(document.groups.TAG.some((option) => option.code === "DROP_SHOULDER"));
  assert.ok(document.groups.TAG.some((option) => option.code === "BASE_LAYER"));
});

test("normalizes persisted taxonomy and returns only active codes in sort order", () => {
  const document = normalizeDocument({
    groups: {
      CATEGORY: [
        { code: "vintage coats", displayName: "Vintage coats", sortOrder: 2, active: true },
        { code: "shirts", displayName: "Shirts", sortOrder: 1, active: false }
      ]
    }
  });
  assert.deepEqual(activeTaxonomyCodes(document, "CATEGORY"), ["VINTAGE_COATS"]);
  assert.equal(document.groups.CATEGORY[0].code, "SHIRTS");
});

test("normalizes admin-entered codes without changing persisted codes later", () => {
  assert.equal(normalizeTaxonomyCode("  vintage coats / premium  "), "VINTAGE_COATS_PREMIUM");
});

test("every subcategory has one owner, and the AI is told which category owns it", () => {
  const document = defaultProductTaxonomy();
  const parent = (code: string) => document.groups.SUBCATEGORY.find((option) => option.code === code)?.parentCode;
  // Shared codes would be silently re-parented by the last category listing them.
  assert.equal(parent("SWEATERS"), "LADY_TOPS");
  assert.equal(parent("KNITWEAR"), "JACKETS");
  assert.equal(parent("SWIMWEAR"), "OTHERS");
  assert.equal(parent("CURTAINS"), "TEXTILE");
  const pairs = subcategoryPairs(document);
  assert.match(pairs, /JACKETS: [^;]*HOODIES[^;]*SWEATSHIRTS/);
  assert.match(pairs, /BAG: [^;]*TRAVEL_BAG[^;]*WALLET/);
  assert.doesNotMatch(pairs, /OTHERS: [^;]*HOODIES/);
});
