import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeOpenAIVisionOutput } from "./openai-vision-normalizer";

test("normalizes OpenAI clothing recognition values into the shared AI contract", () => {
  const output = normalizeOpenAIVisionOutput(
    {
      category: { value: "shirt", confidence: 0.91 },
      subcategory: { value: "short shirt", confidence: 0.83 },
      color: { value: "red", confidence: 0.88 },
      gender: { value: "female", confidence: 0.77 },
      kidsAgeRange: { value: "not applicable", confidence: 0.91 },
      pattern: { value: "graphic", confidence: 0.79 },
      sleeve: { value: "short", confidence: 0.81 },
      brand: { value: "Remon Soda Candy", confidence: 0.62 },
      size: { value: "M", confidence: 0.71 },
      title: { value: "Red Graphic Short Sleeve Shirt", confidence: 0.86 }
    },
    ["image-1"]
  );

  assert.equal(output.category.value, "SHIRTS");
  assert.equal(output.subcategory.value, "SHORT_SHIRTS");
  assert.equal(output.primaryColor.value, "RED");
  assert.equal(output.audience.value, "WOMEN");
  assert.equal(output.kidsAgeRange.value, "NOT_APPLICABLE");
  assert.equal(output.pattern.value, "GRAPHIC");
  assert.equal(output.sleeveType.value, "SHORT");
  assert.equal(output.brandLabel.value, "Remon Soda Candy");
  assert.equal(output.sizeLabel.value, "M");
  assert.equal(output.title.value, "Red Graphic Short Sleeve Shirt");
  assert.deepEqual(output.category.evidenceImageIds, ["image-1"]);
});

test("falls back to OTHER and clamps confidence for unusable model values", () => {
  const output = normalizeOpenAIVisionOutput(
    {
      category: { value: "hat", confidence: 3 },
      subcategory: { value: "unknown", confidence: 0.8 },
      primaryColor: { value: "cyan", confidence: -2 },
      audience: { value: "robot", confidence: 0.4 },
      kidsAgeRange: { value: "age 100", confidence: 0.6 },
      pattern: { value: null, confidence: "bad" },
      sleeveType: { value: "none", confidence: 0.3 }
    },
    ["image-2"]
  );

  assert.equal(output.category.value, "OTHER");
  assert.equal(output.category.confidence, 1);
  assert.equal(output.subcategory.value, "OTHER");
  assert.equal(output.primaryColor.value, "OTHER");
  assert.equal(output.primaryColor.confidence, 0);
  assert.equal(output.audience.value, "UNISEX");
  assert.equal(output.kidsAgeRange.value, "NOT_APPLICABLE");
  assert.equal(output.pattern.value, "OTHER");
  assert.equal(output.pattern.confidence, 0.5);
  assert.equal(output.sleeveType.value, "OTHER");
});

test("accepts active runtime taxonomy values and rejects inactive values", () => {
  const output = normalizeOpenAIVisionOutput(
    {
      category: { value: "VINTAGE_COATS", confidence: 0.9 },
      subcategory: { value: "WOOL_COAT", confidence: 0.8 },
      primaryColor: { value: "MOSS_GREEN", confidence: 0.7 }
    },
    ["image-3"],
    {
      categories: ["VINTAGE_COATS", "OTHER"],
      subcategories: ["WOOL_COAT", "OTHER"],
      colors: ["MOSS_GREEN", "OTHER"]
    }
  );

  assert.equal(output.category.value, "VINTAGE_COATS");
  assert.equal(output.subcategory.value, "WOOL_COAT");
  assert.equal(output.primaryColor.value, "MOSS_GREEN");

  const inactive = normalizeOpenAIVisionOutput(
    { category: { value: "SHIRTS", confidence: 0.9 } },
    ["image-4"],
    { categories: ["OTHER"] }
  );
  assert.equal(inactive.category.value, "OTHER");
});
