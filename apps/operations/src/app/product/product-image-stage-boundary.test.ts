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

assert.equal(
  calibrationSource.includes('operation: "GENERATE_AI_DISPLAY_MAIN_IMAGE"'),
  false,
  "Calibration must not generate AI display images."
);
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
