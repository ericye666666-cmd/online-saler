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
      material: { value: "cotton blend", confidence: 0.72 },
      tags: { value: ["crew neck", "graphic-print", "casual", "casual"], confidence: 0.8 },
      brand: { value: "Remon Soda Candy", confidence: 0.62 },
      size: { value: "M", confidence: 0.71 },
      ukSize: { value: "UK 12", confidence: 0.69 },
      title: { value: "Red Graphic Short Sleeve Shirt", confidence: 0.86 },
      lengthCm: { value: 68.04, confidence: 0.81 },
      chest_width_cm: { value: "51.2", confidence: 0.78 },
      shoulderWidthCm: { value: 43, confidence: 0.76 },
      sleeveLengthCm: { value: 21, confidence: 0.75 }
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
  assert.equal(output.material.value, "COTTON_BLEND");
  assert.deepEqual(output.tags.value, ["CREW_NECK", "GRAPHIC_PRINT", "CASUAL"]);
  assert.equal(output.brandLabel.value, "Remon Soda Candy");
  assert.equal(output.sizeLabel.value, "M");
  assert.equal(output.ukSizeLabel.value, "UK 12");
  assert.equal(output.title.value, "Red Graphic Short Sleeve Shirt");
  assert.equal(output.lengthCm.value, 68);
  assert.equal(output.chestWidthCm.value, 51.2);
  assert.equal(output.shoulderWidthCm.value, 43);
  assert.equal(output.sleeveLengthCm.value, 21);
  assert.equal(output.waistCm.value, null);
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
      sleeveType: { value: "none", confidence: 0.3 },
      material: { value: "unobtainium", confidence: 0.9 },
      tags: { value: ["hooded", "invented", "hooded"], confidence: 0.6 },
      lengthCm: { value: -4, confidence: 0.9 },
      chestWidthCm: { value: 999, confidence: 0.9 }
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
  assert.equal(output.material.value, "UNKNOWN");
  assert.deepEqual(output.tags.value, ["HOODED"]);
  assert.equal(output.lengthCm.value, null);
  assert.equal(output.chestWidthCm.value, null);
});

test("accepts active runtime taxonomy values and rejects inactive values", () => {
  const output = normalizeOpenAIVisionOutput(
    {
      category: { value: "VINTAGE_COATS", confidence: 0.9 },
      subcategory: { value: "WOOL_COAT", confidence: 0.8 },
      primaryColor: { value: "MOSS_GREEN", confidence: 0.7 },
      material: { value: "RECYCLED_COTTON", confidence: 0.7 },
      tags: { value: ["VINTAGE", "POCKETS", "INACTIVE_TAG"], confidence: 0.7 }
    },
    ["image-3"],
    {
      categories: ["VINTAGE_COATS", "OTHER"],
      subcategories: ["WOOL_COAT", "OTHER"],
      colors: ["MOSS_GREEN", "OTHER"],
      materials: ["RECYCLED_COTTON", "UNKNOWN"],
      tags: ["VINTAGE", "POCKETS"]
    }
  );

  assert.equal(output.category.value, "VINTAGE_COATS");
  assert.equal(output.subcategory.value, "WOOL_COAT");
  assert.equal(output.primaryColor.value, "MOSS_GREEN");
  assert.equal(output.material.value, "RECYCLED_COTTON");
  assert.deepEqual(output.tags.value, ["VINTAGE", "POCKETS"]);

  const inactive = normalizeOpenAIVisionOutput(
    { category: { value: "SHIRTS", confidence: 0.9 } },
    ["image-4"],
    { categories: ["OTHER"] }
  );
  assert.equal(inactive.category.value, "OTHER");
});
