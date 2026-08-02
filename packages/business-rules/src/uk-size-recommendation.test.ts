import assert from "node:assert/strict";
import test from "node:test";

import { recommendUkSize } from "./uk-size-recommendation";

test("maps a women's platform size to the corresponding UK range", () => {
  const result = recommendUkSize({
    category: "SHIRTS",
    audience: "WOMEN",
    platformSize: "L",
    measurements: {}
  });

  assert.equal(result?.size, "UK 16-18");
});

test("keeps men's and unisex top sizes as UK letter sizes", () => {
  assert.equal(recommendUkSize({
    category: "JACKETS",
    audience: "MEN",
    platformSize: "M",
    measurements: {}
  })?.size, "UK M");
  assert.equal(recommendUkSize({
    category: "TSHIRTS",
    audience: "UNISEX",
    platformSize: "XL",
    measurements: {}
  })?.size, "UK XL");
});

test("uses final flat waist width for men's pants UK W sizing", () => {
  const result = recommendUkSize({
    category: "PANTS",
    audience: "MEN",
    platformSize: "M",
    measurements: { waistCm: 41 }
  });

  assert.equal(result?.size, "UK W32");
  assert.deepEqual(result?.basis, ["UK_SIZE_V1", "PANTS_FROM_FINAL_FLAT_WAIST_WIDTH"]);
});

test("maps confirmed kids age range to a UK kids label", () => {
  const result = recommendUkSize({
    category: "KIDS",
    audience: "KIDS",
    platformSize: "L",
    kidsAgeRange: "KIDS_6_8Y",
    measurements: {}
  });

  assert.equal(result?.size, "UK 6-8Y");
});

test("returns null without enough evidence or for non-clothing categories", () => {
  assert.equal(recommendUkSize({ category: "SHIRTS", audience: "WOMEN", measurements: {} }), null);
  assert.equal(recommendUkSize({ category: "BAG", audience: "WOMEN", platformSize: "M", measurements: {} }), null);
});
