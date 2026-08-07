import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";

import { ProductImageTransformerService } from "./product-image-transformer.service";
import { parseProductImageUploadRotation } from "./product-image-upload-orientation";

describe("ProductImageTransformerService", () => {
  it("accepts only supported upload rotations", () => {
    assert.equal(parseProductImageUploadRotation(undefined), 0);
    assert.equal(parseProductImageUploadRotation("180"), 180);
    assert.throws(() => parseProductImageUploadRotation("45"), /0, 90, 180 or 270/);
  });

  it("applies the selected upload orientation to the stored image", async () => {
    const input = await sharp({
      create: { width: 80, height: 40, channels: 3, background: "#eeeeee" }
    }).jpeg().toBuffer();
    const body = await new ProductImageTransformerService().orientUploadedImage(input, "image/jpeg", 90);
    const metadata = await sharp(body).metadata();

    assert.equal(metadata.width, 40);
    assert.equal(metadata.height, 80);
  });

  it("trims, scales and centers a transparent cutout on the canonical white canvas", async () => {
    const input = await sharp({
      create: { width: 1000, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .composite([{
        input: { create: { width: 400, height: 300, channels: 4, background: { r: 20, g: 30, b: 40, alpha: 1 } } },
        left: 100,
        top: 200
      }])
      .png()
      .toBuffer();
    const result = await new ProductImageTransformerService().composeWhiteBackground(input);
    const metadata = await sharp(result.body).metadata();
    const { data, info } = await sharp(result.body).raw().toBuffer({ resolveWithObject: true });
    let left = info.width;
    let right = -1;
    let top = info.height;
    let bottom = -1;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        if ((data[offset] ?? 255) < 220 && (data[offset + 1] ?? 255) < 220 && (data[offset + 2] ?? 255) < 220) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    }

    assert.equal(result.contentType, "image/jpeg");
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 1200);
    assert.equal(metadata.hasAlpha, false);
    assert.ok(right - left + 1 >= 1078);
    assert.ok(bottom - top + 1 >= 808);
    assert.ok(Math.abs((left + right) / 2 - 599.5) <= 1);
    assert.ok(Math.abs((top + bottom) / 2 - 599.5) <= 1);
    assert.equal(result.processorVersion, "sharp-v2-centered-white");
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
