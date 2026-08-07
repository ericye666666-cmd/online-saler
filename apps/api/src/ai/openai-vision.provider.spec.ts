import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HOODED_GARMENT_MEASUREMENT_RULES,
  MEASUREMENT_GEOMETRY_RULES,
  PRODUCT_AUDIENCE_TITLE_RULES,
  PRODUCT_MATERIAL_TAG_RULES,
  SHOULDER_WIDTH_MEASUREMENT_RULES,
  openAIVisionResponseSettings,
  parseOpenAIVisionOutput
} from "./openai-vision.provider";

test("reserves the output budget for structured product fields", () => {
  const settings = openAIVisionResponseSettings();

  assert.equal(settings.reasoning.effort, "none");
  assert.equal(settings.text.verbosity, "low");
  assert.equal(settings.text.format.type, "json_object");
  assert.ok(settings.max_output_tokens >= 5000);
});

test("keeps material and tags evidence-based", () => {
  const rules = PRODUCT_MATERIAL_TAG_RULES.join(" ");
  assert.match(rules, /2 to 8 unique enum values/);
  assert.match(rules, /prefer the care label/);
  assert.match(rules, /otherwise use UNKNOWN/);
  assert.match(rules, /fitType, stretchLevel and fabricWeight/);
  assert.match(rules, /Do not claim WATER_RESISTANT/);
});

test("defaults neutral basics to unisex and keeps titles gender-neutral", () => {
  const rules = PRODUCT_AUDIENCE_TITLE_RULES.join(" ");
  assert.match(rules, /default to UNISEX/);
  assert.match(rules, /Never infer audience from color/);
  assert.match(rules, /Keep title gender-neutral/);
});

test("excludes the hood and neckline from shoulder and body measurements", () => {
  const hoodRules = HOODED_GARMENT_MEASUREMENT_RULES.join(" ");
  const shoulderRules = SHOULDER_WIDTH_MEASUREMENT_RULES.join(" ");
  assert.match(hoodRules, /hood, collar and drawstrings are never part of shoulderWidthCm or lengthCm/);
  assert.match(hoodRules, /shoulder endpoints below the hood/);
  assert.match(shoulderRules, /left sleeve-attachment shoulder seam endpoint to the right/);
  assert.match(shoulderRules, /Never measure from the collar or neckline to one shoulder/);
  assert.match(shoulderRules, /return null instead of guessing shoulderWidthCm/);
});

test("asks for four-point board calibration and editable garment endpoints", () => {
  const rules = MEASUREMENT_GEOMETRY_RULES.join(" ");
  assert.match(rules, /four printed calibration marks/);
  assert.match(rules, /OUTER corners/);
  assert.match(rules, /image-relative percentages from 0 to 100/);
  assert.match(rules, /both garment endpoints are visible/);
  assert.match(rules, /never start at the collar/);
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
