import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HOODED_GARMENT_MEASUREMENT_RULES,
  PRODUCT_MATERIAL_TAG_RULES,
  openAIVisionResponseSettings,
  parseOpenAIVisionOutput
} from "./openai-vision.provider";

test("reserves the output budget for structured product fields", () => {
  const settings = openAIVisionResponseSettings();

  assert.equal(settings.reasoning.effort, "none");
  assert.equal(settings.text.verbosity, "low");
  assert.equal(settings.text.format.type, "json_object");
  assert.ok(settings.max_output_tokens >= 3000);
});

test("keeps material and tags evidence-based", () => {
  const rules = PRODUCT_MATERIAL_TAG_RULES.join(" ");
  assert.match(rules, /at most 8 unique enum values/);
  assert.match(rules, /prefer the care label/);
  assert.match(rules, /otherwise use UNKNOWN/);
  assert.match(rules, /Do not claim WATER_RESISTANT/);
});

test("excludes the hood and neckline from shoulder and body measurements", () => {
  const rules = HOODED_GARMENT_MEASUREMENT_RULES.join(" ");
  assert.match(rules, /hood, collar and drawstrings are never part of shoulderWidthCm or lengthCm/);
  assert.match(rules, /shoulder endpoints below the hood/);
  assert.match(rules, /return null instead of measuring across the hood or neckline/);
});

test("reads nested output text from a direct Responses API payload", () => {
  const result = parseOpenAIVisionOutput({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: '{"lengthCm":{"value":60,"confidence":0.8}}' }]
      }
    ]
  }) as Record<string, { value: number }>;

  assert.equal(result.lengthCm.value, 60);
});

test("reports an incomplete response reason when no output text exists", () => {
  assert.throws(
    () => parseOpenAIVisionOutput({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [{ type: "reasoning" }]
    }),
    /incomplete: max_output_tokens/
  );
});
