import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";

import { ProductImageTransformerService } from "./product-image-transformer.service";

describe("ProductImageTransformerService", () => {
  it("composes transparent pixels onto white without changing dimensions", async () => {
    const input = await sharp({
      create: { width: 80, height: 60, channels: 4, background: { r: 20, g: 30, b: 40, alpha: 0.5 } }
    }).png().toBuffer();
    const result = await new ProductImageTransformerService().composeWhiteBackground(input);
    const metadata = await sharp(result.body).metadata();

    assert.equal(result.contentType, "image/jpeg");
    assert.equal(metadata.width, 80);
    assert.equal(metadata.height, 60);
    assert.equal(metadata.hasAlpha, false);
  });

  it("creates a deterministic 1200 square storefront image", async () => {
    const input = await sharp({
      create: { width: 500, height: 800, channels: 3, background: "#ffffff" }
    })
      .composite([{ input: { create: { width: 240, height: 600, channels: 3, background: "#222222" } }, left: 130, top: 100 }])
      .png()
      .toBuffer();
    const result = await new ProductImageTransformerService().optimizeMainImage(input);
    const metadata = await sharp(result.body).metadata();

    assert.equal(result.contentType, "image/jpeg");
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 1200);
    assert.equal(result.provider, "deterministic-sharp");
  });
});
