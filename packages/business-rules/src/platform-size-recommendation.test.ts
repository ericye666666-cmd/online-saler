import assert from "node:assert/strict";
import test from "node:test";

import { recommendPlatformSize } from "./platform-size-recommendation";

test("recommends M for a men's shirt with 52 cm flat chest width", () => {
  const result = recommendPlatformSize({
    category: "SHIRTS",
    audience: "MEN",
    fitType: "REGULAR",
    measurements: { chestWidthCm: 52 }
  });

  assert.equal(result?.size, "M");
  assert.deepEqual(result?.measurementsUsed, [{ type: "CHEST_WIDTH", value: 52 }]);
});

test("uses length while excluding dropped-shoulder measurements for a wide men's base layer", () => {
  const result = recommendPlatformSize({
    category: "SHIRTS",
    audience: "MEN",
    fitType: "RELAXED",
    sleeveType: "LONG",
    tags: ["DROP_SHOULDER", "BASE_LAYER"],
    measurements: {
      chestWidthCm: 55,
      lengthCm: 72,
      shoulderWidthCm: 60,
      sleeveLengthCm: 52
    }
  });

  assert.equal(result?.size, "L");
  assert.equal(result?.requiresHumanReview, false);
  assert.deepEqual(result?.measurementsUsed, [
    { type: "CHEST_WIDTH", value: 55 },
    { type: "LENGTH", value: 72 }
  ]);
  assert.ok(result?.warnings.includes("DROPPED_OR_RAGLAN_SHOULDER_EXCLUDED"));
});

test("keeps chest primary but flags conflicting top proportions for employee review", () => {
  const result = recommendPlatformSize({
    category: "SHIRTS",
    audience: "MEN",
    sleeveType: "LONG",
    measurements: {
      chestWidthCm: 52,
      lengthCm: 82,
      shoulderWidthCm: 54,
      sleeveLengthCm: 69
    }
  });

  assert.equal(result?.size, "M");
  assert.equal(result?.requiresHumanReview, true);
  assert.ok(result?.warnings.includes("LENGTH_PROPORTION_DIFFERS_FROM_CHEST"));
});

test("can suggest a provisional top size from supporting dimensions when chest is missing", () => {
  const result = recommendPlatformSize({
    category: "SHIRTS",
    audience: "MEN",
    sleeveType: "LONG",
    measurements: { lengthCm: 72, shoulderWidthCm: 46, sleeveLengthCm: 62 }
  });

  assert.equal(result?.size, "L");
  assert.equal(result?.requiresHumanReview, true);
  assert.ok(result?.warnings.includes("MISSING_CHEST_PRIMARY_MEASUREMENT"));
});

test("uses a separate women's top profile", () => {
  const result = recommendPlatformSize({
    category: "LADY_TOPS",
    audience: "WOMEN",
    measurements: { chestWidthCm: 52 }
  });

  assert.equal(result?.size, "L");
});

test("pants use the larger recommendation from waist and hip", () => {
  const result = recommendPlatformSize({
    category: "PANTS",
    audience: "MEN",
    measurements: { waistCm: 39, hipCm: 55 }
  });

  assert.equal(result?.size, "L");
  assert.equal(result?.measurementsUsed.length, 2);
});

test("dresses use the largest available chest waist and hip recommendation", () => {
  const result = recommendPlatformSize({
    category: "DRESSES",
    audience: "WOMEN",
    fitType: "REGULAR",
    measurements: { chestWidthCm: 48, waistCm: 40, hipCm: 58 }
  });

  assert.equal(result?.size, "XL");
});

test("fit labels do not silently reduce the measured platform size", () => {
  const regular = recommendPlatformSize({
    category: "JACKETS",
    audience: "UNISEX",
    fitType: "REGULAR",
    measurements: { chestWidthCm: 60 }
  });
  const oversized = recommendPlatformSize({
    category: "JACKETS",
    audience: "UNISEX",
    fitType: "OVERSIZED",
    measurements: { chestWidthCm: 60 }
  });

  assert.equal(regular?.size, "XL");
  assert.equal(oversized?.size, "XL");
});

test("kids platform size follows the confirmed age range", () => {
  const result = recommendPlatformSize({
    category: "KIDS",
    audience: "KIDS",
    kidsAgeRange: "KIDS_6_8Y",
    measurements: {}
  });

  assert.equal(result?.size, "L");
});

test("returns null for unsupported categories or missing primary measurements", () => {
  assert.equal(recommendPlatformSize({ category: "BAG", audience: "WOMEN", measurements: {} }), null);
  assert.equal(recommendPlatformSize({ category: "SHIRTS", audience: "MEN", measurements: {} }), null);
});
