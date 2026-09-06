import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { ProductDetailFacts } from "./product-detail-copy";
import type { ProductImageStorageService } from "./product-image-storage.service";
import { ProductDetailOpenAIProvider } from "./product-detail-openai.provider";

const envKeys = [
  "OPENAI_API_KEY", "OPENAI_DETAIL_MODEL", "OPENAI_VISION_MODEL",
  "OPENAI_DETAIL_INPUT_USD_PER_MILLION", "OPENAI_DETAIL_OUTPUT_USD_PER_MILLION"
] as const;
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const facts: ProductDetailFacts = {
  productId: "product-1", sourceDataVersion: 1, title: "Plain shirt", category: "SHIRTS",
  subcategory: "SHIRT", gender: "UNISEX", color: "BLUE", pattern: "PLAIN", sleeveType: null,
  brand: null, tagSize: null, platformSize: null, conditionGrade: "GOOD", fitType: null,
  stretchLevel: null, fabricWeight: null, material: null, tags: [], priceKsh: 200,
  measurementsCm: { chestWidthCm: 50 }, defects: []
};
const copy = {
  title: "Plain blue shirt", sellingPoints: ["Blue", "Plain pattern", "Flat chest width 50 cm"],
  shortDescription: "A plain blue second-hand shirt.", fitSummary: "Flat chest width: 50 cm.",
  conditionSummary: "Employee condition grade: Good.", warnings: []
};
const images = [{ id: "front-1", type: "FRONT" as const, originalUrl: "gs://test-products/front.png" }];
const provider = new ProductDetailOpenAIProvider({
  bucket: "test-products",
  download: async () => ({ body: Buffer.from("original-image"), contentType: "image/png" })
} as unknown as ProductImageStorageService);
let requests: Array<Record<string, any>>;
let usage: Record<string, unknown> | undefined;

beforeEach(() => {
  for (const key of envKeys) delete process.env[key];
  process.env.OPENAI_API_KEY = "test-key";
  requests = [];
  usage = { input_tokens: 1000, output_tokens: 100 };
  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), "https://api.openai.com/v1/responses");
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ output_text: JSON.stringify(copy), usage }), { status: 200 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("generates bounded structured copy with the lower-cost default and original photos", async () => {
  process.env.OPENAI_DETAIL_INPUT_USD_PER_MILLION = "0.15";
  process.env.OPENAI_DETAIL_OUTPUT_USD_PER_MILLION = "0.60";
  const result = await provider.generate(facts, images);
  const request = requests[0]!;

  assert.equal(request.model, "gpt-4o-mini");
  assert.equal("reasoning" in request, false);
  assert.equal("verbosity" in request.text, false);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.equal(request.max_output_tokens, 1000);
  assert.equal(request.input[1].content[1].detail, "low");
  assert.match(request.input[1].content[1].image_url, /^data:image\/png;base64,/);
  assert.deepEqual(result.finalOutput, copy);
  assert.equal(result.estimatedCostUsd, 0.00021);
  assert.equal(result.model, "gpt-4o-mini");
});

test("preserves the explicit detail model and legacy vision-model fallback", async () => {
  process.env.OPENAI_VISION_MODEL = "gpt-5.6-sol";
  process.env.OPENAI_DETAIL_MODEL = "gpt-4o-mini";
  assert.equal((await provider.generate(facts, images)).model, "gpt-4o-mini");
  delete process.env.OPENAI_DETAIL_MODEL;
  assert.equal((await provider.generate(facts, images)).model, "gpt-5.6-sol");
  assert.deepEqual(requests.map((request) => request.model), ["gpt-4o-mini", "gpt-5.6-sol"]);
});

test("reports unknown cost when rates or token usage are missing rather than zero", async () => {
  assert.equal((await provider.generate(facts, images)).estimatedCostUsd, undefined);
  process.env.OPENAI_DETAIL_INPUT_USD_PER_MILLION = " ";
  process.env.OPENAI_DETAIL_OUTPUT_USD_PER_MILLION = " ";
  assert.equal((await provider.generate(facts, images)).estimatedCostUsd, undefined);
  process.env.OPENAI_DETAIL_INPUT_USD_PER_MILLION = "0.15";
  process.env.OPENAI_DETAIL_OUTPUT_USD_PER_MILLION = "0.60";
  usage = { input_tokens: 1000 };
  assert.equal((await provider.generate(facts, images)).estimatedCostUsd, undefined);
  usage = undefined;
  assert.equal((await provider.generate(facts, images)).estimatedCostUsd, undefined);
});

test("does not call OpenAI without credentials or original images", async () => {
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(provider.generate(facts, images), /API key is not configured/);
  process.env.OPENAI_API_KEY = "test-key";
  await assert.rejects(provider.generate(facts, []), /original product image is required/);
  assert.equal(requests.length, 0);
});
