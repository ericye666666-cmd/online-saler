import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeTaxonomyCodes,
  defaultProductTaxonomy,
  normalizeDocument,
  normalizeTaxonomyCode
} from "./product-taxonomy";

test("default taxonomy keeps stable codes and a shared OTHER subcategory", () => {
  const document = defaultProductTaxonomy();
  assert.ok(document.groups.CATEGORY.some((option) => option.code === "LADY_TOPS"));
  assert.equal(document.groups.SUBCATEGORY.find((option) => option.code === "OTHER")?.parentCode, null);
  assert.equal(new Set(document.groups.SUBCATEGORY.map((option) => option.code)).size, document.groups.SUBCATEGORY.length);
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
