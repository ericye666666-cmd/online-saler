import assert from "node:assert/strict";
import test from "node:test";
import { productFactoryConfigurationChecks } from "./operations-product-factory-admin.service";

test("reports the same-origin Operations API channel without requiring OPERATIONS_URL", () => {
  const checks = productFactoryConfigurationChecks({
    OPENAI_API_KEY: "configured",
    OPENAI_VISION_MODEL: "gpt-5-mini",
    OPENAI_IMAGE_EDIT_MODEL: "gpt-image-2",
    PRODUCT_IMAGE_BUCKET: "product-images",
    BACKGROUND_REMOVAL_PROVIDER: "auto",
    LIGHTWEIGHT_CUTOUT_SERVICE_URL: "https://lightweight.example",
    REMBG_BIREFNET_SERVICE_URL: "https://birefnet.example",
    BACKGROUND_REMOVAL_MIN_QUALITY_SCORE: "0.75"
  });

  assert.equal(checks.some((item) => item.key === "OPERATIONS_URL"), false);
  assert.deepEqual(
    checks.find((item) => item.key === "OPERATIONS_API_CHANNEL"),
    {
      key: "OPERATIONS_API_CHANNEL",
      label: "Operations API 通道",
      status: "CONFIGURED",
      secret: false,
      guidance: "Operations 通过同源 /api-proxy 访问 API，无需浏览器跨域配置。",
      value: "/api-proxy"
    }
  );
  assert.equal(checks.find((item) => item.key === "PRINT_AGENT")?.status, "CLIENT_CHECK");
});
