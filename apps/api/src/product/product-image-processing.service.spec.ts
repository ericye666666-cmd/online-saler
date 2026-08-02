import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  analyzeManualCutout,
  validateGuidedCutoutPoints
} from "./product-image-processing.service";

async function pngWithMask(width: number, height: number, left: number, top: number, right: number, bottom: number) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = 120;
      pixels[offset + 1] = 120;
      pixels[offset + 2] = 120;
      pixels[offset + 3] = 255;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

describe("manual cutout quality", () => {
  it("accepts a centered transparent garment mask", async () => {
    const result = await analyzeManualCutout(await pngWithMask(100, 100, 20, 15, 80, 85));
    assert.deepEqual(result.qualityIssues, []);
    assert.ok(result.qualityScore >= 0.75);
    assert.equal(result.widthPx, 100);
    assert.equal(result.heightPx, 100);
  });

  it("detects a retained board frame touching the image edges", async () => {
    const result = await analyzeManualCutout(await pngWithMask(100, 100, 0, 0, 100, 100));
    assert.ok(result.qualityIssues.includes("SUBJECT_TOO_LARGE"));
    assert.ok(result.qualityIssues.includes("SUBJECT_TOUCHES_EDGE"));
    assert.ok(result.qualityScore < 0.75);
  });
});

describe("guided cutout outline", () => {
  it("accepts a normalized garment polygon", () => {
    const points = validateGuidedCutoutPoints([
      { x: 0.35, y: 0.15 },
      { x: 0.65, y: 0.15 },
      { x: 0.85, y: 0.35 },
      { x: 0.7, y: 0.85 },
      { x: 0.3, y: 0.85 },
      { x: 0.15, y: 0.35 }
    ]);
    assert.equal(points.length, 6);
  });

  it("rejects missing, out-of-range and tiny outlines", () => {
    assert.throws(() => validateGuidedCutoutPoints([]), /between 6 and 60/);
    assert.throws(
      () => validateGuidedCutoutPoints(Array.from({ length: 6 }, (_, index) => ({ x: index === 5 ? 2 : 0.5, y: 0.5 }))),
      /between 0 and 1/
    );
    assert.throws(
      () => validateGuidedCutoutPoints(Array.from({ length: 6 }, (_, index) => ({ x: 0.4 + index * 0.001, y: 0.4 + index * 0.001 }))),
      /too small or crosses itself/
    );
  });
});
