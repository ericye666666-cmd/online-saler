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

  it("frames generated display images to the same subject size whatever the model produced", async () => {
    const service = new ProductImageTransformerService();
    // Same garment, framed small by the model in one image and edge to edge in
    // the other — the two must come out identical in subject size.
    const generated = async (subjectSize: number) => ({
      body: await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#ffffff" } })
        .composite([{
          input: {
            create: { width: subjectSize, height: subjectSize, channels: 3, background: { r: 20, g: 30, b: 40 } }
          },
          left: Math.floor((1024 - subjectSize) / 2),
          top: Math.floor((1024 - subjectSize) / 2)
        }])
        .png()
        .toBuffer(),
      contentType: "image/png" as const,
      provider: "openai-image-edit",
      processorVersion: "test",
      widthPx: 1024,
      heightPx: 1024
    });

    const subjectWidth = async (body: Buffer) => {
      const { data, info } = await sharp(body).raw().toBuffer({ resolveWithObject: true });
      let left = info.width;
      let right = -1;
      for (let x = 0; x < info.width; x += 1) {
        const index = (Math.floor(info.height / 2) * info.width + x) * info.channels;
        if (data[index] < 200) {
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
      return right - left + 1;
    };

    const small = await service.normalizeDisplayFraming(await generated(300));
    const large = await service.normalizeDisplayFraming(await generated(1000));

    assert.equal((await sharp(small.body).metadata()).width, 1200);
    assert.equal((await sharp(large.body).metadata()).width, 1200);
    const smallWidth = await subjectWidth(small.body);
    const largeWidth = await subjectWidth(large.body);
    assert.ok(Math.abs(smallWidth - largeWidth) <= 4, `subject widths differ: ${smallWidth} vs ${largeWidth}`);
    // 1000px frame for the subject plus a 5% bleed on each side of it.
    assert.ok(smallWidth >= 890 && smallWidth <= 930, `subject width off target: ${smallWidth}`);
    assert.equal(small.provider, "openai-image-edit");
  });

  it("lets a soft contact shadow fade out instead of ending in a hard line", async () => {
    const service = new ProductImageTransformerService();
    // A dark garment with a soft shadow under it that fades from grey to white.
    const shadowRows = 90;
    const gradient = Buffer.alloc(400 * shadowRows * 3);
    for (let y = 0; y < shadowRows; y += 1) {
      const value = Math.round(205 + (50 * y) / (shadowRows - 1));
      gradient.fill(value, y * 400 * 3, (y + 1) * 400 * 3);
    }
    const generated = {
      body: await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#ffffff" } })
        .composite([
          { input: { create: { width: 400, height: 400, channels: 3, background: { r: 20, g: 30, b: 40 } } }, left: 312, top: 250 },
          { input: gradient, raw: { width: 400, height: shadowRows, channels: 3 }, left: 312, top: 650 }
        ])
        .png()
        .toBuffer(),
      contentType: "image/png" as const,
      provider: "openai-image-edit",
      processorVersion: "test",
      widthPx: 1024,
      heightPx: 1024
    };

    const result = await service.normalizeDisplayFraming(generated);
    const { data, info } = await sharp(result.body).greyscale().raw().toBuffer({ resolveWithObject: true });
    const column = Math.floor(info.width / 2);
    const values = Array.from({ length: info.height }, (_, y) => data[y * info.width + column]);
    // Scan only below the garment. Its own hard synthetic edge rings under
    // resampling, which says nothing about how the shadow ends.
    const lastGarmentRow = values.reduce((last, value, y) => (value < 100 ? y : last), -1);
    let largestStep = 0;
    for (let y = lastGarmentRow + 12; y < values.length; y += 1) {
      largestStep = Math.max(largestStep, Math.abs(values[y] - values[y - 1]));
    }

    assert.ok(lastGarmentRow > 0, "garment not found");
    assert.ok(largestStep <= 3, `shadow ends in a visible step of ${largestStep}`);
    assert.ok(values.slice(lastGarmentRow).some((value) => value >= 254), "shadow never reaches white");
  });

  it("keeps a near-white subject rather than trimming it away", async () => {
    const service = new ProductImageTransformerService();
    const whiteOnWhite = {
      body: await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#ffffff" } })
        .png()
        .toBuffer(),
      contentType: "image/png" as const,
      provider: "openai-image-edit",
      processorVersion: "test",
      widthPx: 1024,
      heightPx: 1024
    };

    const result = await service.normalizeDisplayFraming(whiteOnWhite);
    const metadata = await sharp(result.body).metadata();

    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 1200);
  });

});
