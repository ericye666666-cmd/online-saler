import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "@online-saler/database";
import {
  OpenAIVisionProvider,
  HOODED_GARMENT_MEASUREMENT_RULES,
  MEASUREMENT_GEOMETRY_RULES,
  PRODUCT_AUDIENCE_TITLE_RULES,
  PRODUCT_MATERIAL_TAG_RULES,
  SHOULDER_WIDTH_MEASUREMENT_RULES,
  openAIVisionResponseSettings,
  parseOpenAIVisionOutput
} from "./openai-vision.provider";

test("uses Mini-compatible JSON controls with sufficient structured output budget", () => {
  const settings = openAIVisionResponseSettings();

  assert.equal("reasoning" in settings, false);
  assert.equal("verbosity" in settings.text, false);
  assert.equal(settings.text.format.type, "json_object");
  assert.ok(settings.max_output_tokens >= 5000);
});

test("preserves prior no-reasoning controls for an explicitly retained deployment model", () => {
  const settings = openAIVisionResponseSettings("gpt-5.6-sol");

  assert.equal(settings.reasoning?.effort, "none");
  assert.equal(settings.text.verbosity, "low");
  assert.equal(settings.text.format.type, "json_object");
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


test("shoe recognition reads original pair and size label without invoking garment board detection", async () => {
  const original = { fetch: globalThis.fetch, apiKey: process.env.OPENAI_API_KEY,
    images: prisma.productImage.findMany, setting: prisma.systemSetting.findUnique };
  let boardCalls = 0;
  let payload: Record<string, any> = {};
  const downloaded: string[] = [];
  try {
    process.env.OPENAI_API_KEY = "test-key";
    prisma.systemSetting.findUnique = (async () => null) as never;
    prisma.productImage.findMany = (async () => [
      { id: "pair", type: "FRONT", originalUrl: "gs://test/pair.jpg" },
      { id: "label", type: "LABEL", originalUrl: "gs://test/label.jpg" }
    ]) as never;
    globalThis.fetch = (async (_url, init) => {
      payload = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ output_text: JSON.stringify({
        category: { value: "KIDS", confidence: 1 }, sizeLabel: { value: "EU 28", confidence: 0.8 },
        shoeSizeSystem: { value: "EU", confidence: 0.8 }, chestWidthCm: { value: 30, confidence: 0.9 }
      }) }));
    }) as typeof fetch;
    const provider = new OpenAIVisionProvider({ bucket: "test", download: async (path: string) => {
      downloaded.push(path); return { body: Buffer.from(path), contentType: "image/jpeg" };
    } } as never, { detect: async () => { boardCalls += 1; throw new Error("Board detection must not run for shoes"); } } as never);
    const result = await provider.extract({ productId: "shoe", imageIds: ["pair", "label"], promptVersion: "test", categoryHint: "SHOES" });
    assert.equal(boardCalls, 0);
    assert.deepEqual(downloaded, ["pair.jpg", "label.jpg"]);
    assert.match(payload.input[0].content, /second-hand shoes/);
    const input = payload.input[1].content;
    assert.match(input[0].text, /Never convert EU\/UK\/US sizes/);
    assert.equal(input[2].detail, "high");
    assert.equal(result.normalizedOutput.category.value, "SHOES");
    assert.equal(result.normalizedOutput.sizeLabel.value, "EU 28");
    assert.equal(result.normalizedOutput.chestWidthCm.value, null);
  } finally {
    globalThis.fetch = original.fetch;
    if (original.apiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = original.apiKey;
    prisma.productImage.findMany = original.images;
    prisma.systemSetting.findUnique = original.setting;
  }
});
