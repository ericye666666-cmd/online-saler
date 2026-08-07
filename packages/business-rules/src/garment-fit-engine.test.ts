import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GARMENT_FIT_DISCLAIMER_EN,
  GARMENT_FIT_DISCLAIMER_ZH,
  calculateGarmentFitRecommendation
} from "./garment-fit-engine";

test("tops prioritize final chest width and provide a regular-fit body range", () => {
  const result = calculateGarmentFitRecommendation({
    category: "TSHIRTS",
    gender: "UNISEX",
    platformSize: "L",
    fitType: "REGULAR",
    stretchLevel: "LOW",
    fabricWeight: "REGULAR",
    measurements: { CHEST_WIDTH: 55, LENGTH: 72, SLEEVE_LENGTH: 62 }
  });
  assert.deepEqual([result.bodyChestMinCm, result.bodyChestMaxCm], [97, 103]);
  assert.deepEqual([result.heightMinCm, result.heightMaxCm], [160, 174]);
  assert.deepEqual([result.weightMinKg, result.weightMaxKg], [63, 82]);
  assert.equal(result.disclaimer, GARMENT_FIT_DISCLAIMER_EN);
  assert.equal(result.disclaimerZh, GARMENT_FIT_DISCLAIMER_ZH);
});

test("pants derive waist and hip body ranges before height and weight", () => {
  const result = calculateGarmentFitRecommendation({
    category: "PANTS",
    gender: "WOMEN",
    platformSize: "M",
    fitType: "REGULAR",
    stretchLevel: "NONE",
    fabricWeight: "REGULAR",
    measurements: { WAIST: 39, HIP: 51, OUTSEAM: 99 }
  });
  assert.deepEqual([result.bodyWaistMinCm, result.bodyWaistMaxCm], [70, 76]);
  assert.deepEqual([result.bodyHipMinCm, result.bodyHipMaxCm], [87, 95]);
  assert.deepEqual([result.heightMinCm, result.heightMaxCm], [161, 175]);
  assert.ok(result.basis.includes("WAIST_FROM_FINAL_FLAT_MEASUREMENT"));
});

test("stretch increases the supported maximum body measurement without inventing facts", () => {
  const none = calculateGarmentFitRecommendation({
    category: "DRESSES",
    fitType: "SLIM",
    stretchLevel: "NONE",
    fabricWeight: "LIGHT",
    measurements: { CHEST_WIDTH: 45, WAIST: 35, HIP: 47, LENGTH: 100 }
  });
  const high = calculateGarmentFitRecommendation({
    category: "DRESSES",
    fitType: "SLIM",
    stretchLevel: "HIGH",
    fabricWeight: "LIGHT",
    measurements: { CHEST_WIDTH: 45, WAIST: 35, HIP: 47, LENGTH: 100 }
  });
  assert.ok((high.bodyChestMaxCm ?? 0) > (none.bodyChestMaxCm ?? 0));
  assert.ok((high.bodyWaistMaxCm ?? 0) > (none.bodyWaistMaxCm ?? 0));
  assert.ok((high.bodyHipMaxCm ?? 0) > (none.bodyHipMaxCm ?? 0));
});

test("low-confidence and kids results suppress weight ranges", () => {
  const lowConfidence = calculateGarmentFitRecommendation({
    category: "JACKETS",
    gender: "MEN",
    platformSize: "L",
    fitType: "UNKNOWN",
    stretchLevel: "UNKNOWN",
    fabricWeight: "UNKNOWN",
    measurements: { CHEST_WIDTH: 58 }
  });
  assert.equal(lowConfidence.weightMinKg, null);
  assert.ok(lowConfidence.warnings.includes("WEIGHT_RANGE_NOT_SHOWN_WITHOUT_HIGH_CONFIDENCE"));

  const kids = calculateGarmentFitRecommendation({
    category: "PANTS",
    gender: "KIDS",
    platformSize: "M",
    fitType: "REGULAR",
    stretchLevel: "LOW",
    fabricWeight: "REGULAR",
    measurements: { WAIST: 28, HIP: 35, OUTSEAM: 70 }
  });
  assert.equal(kids.weightMinKg, null);
});

test("unsupported categories return warnings instead of fabricated recommendations", () => {
  const result = calculateGarmentFitRecommendation({
    category: "BAG",
    fitType: "REGULAR",
    stretchLevel: "NONE",
    fabricWeight: "HEAVY",
    measurements: {}
  });
  assert.equal(result.bodyChestMinCm, null);
  assert.equal(result.heightMinCm, null);
  assert.ok(result.warnings.includes("MISSING_REQUIRED_BODY_MEASUREMENTS"));
});
