import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeOpenAIVisionOutput } from "./openai-vision-normalizer";

test("normalizes OpenAI clothing recognition values into the shared AI contract", () => {
  const output = normalizeOpenAIVisionOutput(
    {
      category: { value: "shirt", confidence: 0.91 },
      color: { value: "red", confidence: 0.88 },
      pattern: { value: "graphic", confidence: 0.79 },
      sleeve: { value: "short", confidence: 0.81 },
      brand: { value: "Remon Soda Candy", confidence: 0.62 },
      size: { value: "M", confidence: 0.71 },
      title: { value: "Red Graphic Short Sleeve Shirt", confidence: 0.86 }
    },
    ["image-1"]
  );

  assert.equal(output.category.value, "SHIRT");
  assert.equal(output.primaryColor.value, "RED");
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
      primaryColor: { value: "cyan", confidence: -2 },
      pattern: { value: null, confidence: "bad" },
      sleeveType: { value: "none", confidence: 0.3 }
    },
    ["image-2"]
  );

  assert.equal(output.category.value, "OTHER");
  assert.equal(output.category.confidence, 1);
  assert.equal(output.primaryColor.value, "OTHER");
  assert.equal(output.primaryColor.confidence, 0);
  assert.equal(output.pattern.value, "OTHER");
  assert.equal(output.pattern.confidence, 0.5);
  assert.equal(output.sleeveType.value, "OTHER");
});
