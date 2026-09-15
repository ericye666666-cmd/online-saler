import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const calibrationSource = readFileSync(
  join(process.cwd(), "src/app/product/product-batch-calibration-client.tsx"),
  "utf8"
);
const detailSource = readFileSync(
  join(process.cwd(), "src/app/product/product-detail-generation-client.tsx"),
  "utf8"
);
const executionSource = readFileSync(
  join(process.cwd(), "src/app/product/product-batch-execution-client.tsx"),
  "utf8"
);
const reviewSource = readFileSync(
  join(process.cwd(), "src/app/product/product-batch-review-client.tsx"),
  "utf8"
);

assert.equal(
  calibrationSource.includes('operation: "GENERATE_AI_DISPLAY_MAIN_IMAGE"'),
  false,
  "Calibration must not generate AI display images."
);
assert.equal(
  calibrationSource.includes("<ManualMeasurementEditor"),
  false,
  "Manual size entry must not require a board or measurement-line editor."
);
assert.ok(
  calibrationSource.includes('<ApparelSizeField category={form.category} value={form.sizeLabel}') &&
    calibrationSource.includes('onChange={(value) => updateForm("sizeLabel", value)}'),
  "Staff must have a controlled manual UK/letter size field."
);
const sizeFieldSource = readFileSync(join(process.cwd(), "src/app/product/apparel-size-field.tsx"), "utf8");
assert.ok(sizeFieldSource.includes('data-field-key="sizeLabel"'), "Manual size validation must target the visible size field.");
assert.ok(sizeFieldSource.includes('value="UK"') && sizeFieldSource.includes('value="LETTER"'), "Staff must be able to choose UK or letter sizing.");
assert.equal(
  calibrationSource.includes("recommendPlatformSize"),
  false,
  "AI measurements must not recommend or overwrite staff-entered size."
);
const centerSource = readFileSync(join(process.cwd(), "src/app/product/product-center-client.tsx"), "utf8");
for (const source of [calibrationSource, executionSource, centerSource]) {
  assert.equal(source.includes('"REMOVE_BACKGROUND"'), false, "Intake must never request cutout processing.");
  assert.equal(source.includes('"COMPOSE_WHITE_BACKGROUND"'), false, "Intake must never compose an intermediate white image.");
  assert.equal(source.includes("<ManualCutoutEditor"), false, "No cutout editor in intake.");
}
assert.ok(detailSource.includes("comparison.original.imageId"), "Display generation must use the original photo.");
assert.equal(
  calibrationSource.includes("设为商城主图"),
  false,
  "Calibration must not select the storefront main image."
);
assert.ok(
  detailSource.includes('operation: "GENERATE_AI_DISPLAY_MAIN_IMAGE"'),
  "Detail generation must create AI display main-image candidates."
);
assert.equal(
  executionSource.includes('"GENERATE_AI_DISPLAY_MAIN_IMAGE"'),
  false,
  "Generation is coordinated by the shared background queue."
);
assert.ok(
  calibrationSource.includes("<BatchDisplayProgress"),
  "Manual information editing must display concurrent image progress."
);
assert.ok(
  reviewSource.includes("humanConfirmed: true"),
  "Final review must explicitly confirm the generated main image."
);
assert.equal(
  detailSource.includes("MODEL_DISPLAY"),
  false,
  "Restoring AI display main images must not restore the removed Model View detail asset."
);
assert.ok(
  detailSource.includes("人工确认 AI 主图"),
  "Generated display images must keep an explicit human-confirmation action."
);
assert.ok(
  detailSource.includes("设为商城主图"),
  "Detail generation must own storefront main-image selection."
);
assert.equal(
  detailSource.includes("请先选择商城主图"),
  false,
  "Detail approval must not require a storefront main image."
);
assert.ok(
  detailSource.includes("商品发布仍由价格、库存、状态和商品控制规则共同决定"),
  "Detail approval must preserve the product publication gates."
);

assert.equal(centerSource.includes("!comparison?.selectedMainImageId"), false,
  "Manual information confirmation must not depend on display generation.");
