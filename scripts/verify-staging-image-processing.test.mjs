import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";

import {
  evaluateStorefrontCutoutQuality,
  inspectJpeg,
  inspectTransparentPng
} from "./verify-staging-image-processing.mjs";

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
}

function rgbaPng(alphaValues) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(alphaValues.length, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanline = Buffer.from([0, ...alphaValues.flatMap((alpha) => [10, 20, 30, alpha])]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scanline)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

test("accepts an RGBA PNG containing transparent and opaque pixels", () => {
  const result = inspectTransparentPng(rgbaPng([0, 255]));
  assert.equal(result.transparentPixels, 1);
  assert.equal(result.opaquePixels, 1);
  assert.equal(result.colorType, 6);
});

test("rejects output without transparent background pixels", () => {
  assert.throws(() => inspectTransparentPng(rgbaPng([255, 255])), /transparent background/);
});

test("accepts a complete JPEG byte stream", () => {
  assert.equal(inspectJpeg(Buffer.from([255, 216, 255, 224, 0, 255, 217])).byteLength, 7);
});

test("rejects a truncated JPEG byte stream", () => {
  assert.throws(() => inspectJpeg(Buffer.from([255, 216, 255, 224])), /EOI marker/);
});

test("accepts cutout quality that satisfies the storefront gate", () => {
  assert.deepEqual(evaluateStorefrontCutoutQuality({ qualityScore: 0.8, qualityIssues: [] }, {}), {
    pass: true,
    reason: null
  });
});

test("rejects cutout quality below the storefront score threshold", () => {
  assert.deepEqual(evaluateStorefrontCutoutQuality({ qualityScore: 0.487, qualityIssues: [] }, {}), {
    pass: false,
    reason: "QUALITY_SCORE_BELOW_THRESHOLD:0.487<0.75"
  });
});

test("rejects blocking cutout issues even when the score passes", () => {
  assert.deepEqual(
    evaluateStorefrontCutoutQuality({ qualityScore: 0.9, qualityIssues: ["SUBJECT_TOUCHES_EDGE"] }, {}),
    { pass: false, reason: "QUALITY_ISSUE:SUBJECT_TOUCHES_EDGE" }
  );
});

test("allows non-blocking cutout issues when the score passes", () => {
  assert.deepEqual(
    evaluateStorefrontCutoutQuality({ qualityScore: 0.9, qualityIssues: ["SUBJECT_TOO_SMALL"] }, {}),
    { pass: true, reason: null }
  );
});
