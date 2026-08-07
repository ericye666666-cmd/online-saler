import assert from "node:assert/strict";
import test from "node:test";

import { missingPublishMeasurementTypes } from "./operations-product-publish-readiness";

test("accepts complete top measurements without requiring lower-body fields", () => {
  assert.deepEqual(missingPublishMeasurementTypes({
    category: "TSHIRTS",
    sleeveType: "SHORT",
    measurements: [
      { measurementType: "LENGTH", finalValueCm: 68 },
      { measurementType: "CHEST_WIDTH", finalValueCm: 51 },
      { measurementType: "SHOULDER_WIDTH", finalValueCm: 43 },
      { measurementType: "SLEEVE_LENGTH", finalValueCm: 22 }
    ]
  }), []);
});

test("pants require lower-body measurements instead of chest width", () => {
  assert.deepEqual(missingPublishMeasurementTypes({
    category: "PANTS",
    measurements: [
      { measurementType: "OUTSEAM", finalValueCm: 100 },
      { measurementType: "WAIST", finalValueCm: 41 },
      { measurementType: "HIP", finalValueCm: 53 }
    ]
  }), ["THIGH_WIDTH", "LEG_OPENING"]);
});

test("non-apparel products do not require garment measurements", () => {
  assert.deepEqual(missingPublishMeasurementTypes({ category: "BAG", measurements: [] }), []);
});
