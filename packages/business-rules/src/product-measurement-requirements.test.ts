import assert from "node:assert/strict";
import test from "node:test";

import { requiredProductMeasurementTypes } from "./product-measurement-requirements";

test("requires upper-body measurements and respects sleeveless garments", () => {
  assert.deepEqual(
    requiredProductMeasurementTypes({ category: "TSHIRTS", sleeveType: "SHORT" }),
    ["LENGTH", "CHEST_WIDTH", "SHOULDER_WIDTH", "SLEEVE_LENGTH"]
  );
  assert.deepEqual(
    requiredProductMeasurementTypes({ category: "LADY_TOPS", sleeveType: "SLEEVELESS" }),
    ["LENGTH", "CHEST_WIDTH", "SHOULDER_WIDTH"]
  );
});

test("requires lower-body measurements for adult and kids pants", () => {
  const expected = ["OUTSEAM", "WAIST", "HIP", "THIGH_WIDTH", "LEG_OPENING"];
  assert.deepEqual(requiredProductMeasurementTypes({ category: "PANTS" }), expected);
  assert.deepEqual(requiredProductMeasurementTypes({ category: "SHORT" }), expected);
  assert.deepEqual(requiredProductMeasurementTypes({ category: "KIDS", subcategory: "KIDS_PANTS" }), expected);
});

test("adds waist and hip for dresses and skips non-apparel categories", () => {
  assert.deepEqual(
    requiredProductMeasurementTypes({ category: "DRESSES", sleeveType: "LONG" }),
    ["LENGTH", "CHEST_WIDTH", "SHOULDER_WIDTH", "SLEEVE_LENGTH", "WAIST", "HIP"]
  );
  assert.deepEqual(requiredProductMeasurementTypes({ category: "BAG" }), []);
});

test("uses dedicated measurement sets for skirts, jumpsuits and bodysuits", () => {
  assert.deepEqual(
    requiredProductMeasurementTypes({ category: "KIDS", subcategory: "KIDS_SKIRT" }),
    ["LENGTH", "WAIST", "HIP"]
  );
  assert.deepEqual(
    requiredProductMeasurementTypes({ category: "FULL_BODY", subcategory: "JUMPSUIT", sleeveType: "SLEEVELESS" }),
    ["LENGTH", "CHEST_WIDTH", "SHOULDER_WIDTH", "WAIST", "HIP", "INSEAM"]
  );
  assert.deepEqual(
    requiredProductMeasurementTypes({ category: "SWIMWEAR", subcategory: "ONE_PIECE_SWIM" }),
    ["LENGTH", "CHEST_WIDTH", "WAIST", "HIP"]
  );
});
