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
  "Detail generation must own AI display image generation."
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
  detailSource.includes("不会阻碍详情批准或商品发布"),
  "Detail approval must explain that incomplete details never block publication."
);
