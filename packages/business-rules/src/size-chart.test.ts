import assert from "node:assert/strict";
import test from "node:test";

import {
  ADULT_STANDARD_SIZES,
  KIDS_STANDARD_SIZES,
  SIZE_CHART,
  formatSizeHeadline,
  formatSizeRecommendation,
  formatAgeRange,
  formatWaistSizeLabel,
  isWaistSizeLabel,
  kidsAgeRangeCodeFor,
  kidsStandardSizeFromAgeRange,
  normalizeKidsAgeRangeCode,
  sizeChartEntry,
  standardSizesForFit,
  waistInchesFrom,
  womenStandardSizeFromUk
} from "./size-chart";

test("every fit covers its full size ladder exactly once", () => {
  for (const fit of ["MEN", "WOMEN", "UNISEX"] as const) {
    assert.deepEqual(SIZE_CHART[fit].map((row) => row.standardSize), [...ADULT_STANDARD_SIZES]);
  }
  assert.deepEqual(SIZE_CHART.KIDS.map((row) => row.standardSize), [...KIDS_STANDARD_SIZES]);
});

test("women UK 14 resolves to L with its height and weight range", () => {
  assert.equal(womenStandardSizeFromUk(14), "L");
  const entry = sizeChartEntry("WOMEN", "L");
  assert.equal(entry?.ukSize, "UK 14");
  assert.equal(formatSizeRecommendation(entry!), "160-170 cm · 58-70 kg");
  assert.equal(formatSizeHeadline(entry!), "L · UK 14");
});

test("men XL carries the UK 46-48 equivalent", () => {
  const entry = sizeChartEntry("MEN", "XL");
  assert.equal(entry?.ukSize, "UK 46-48");
  assert.equal(formatSizeRecommendation(entry!), "175-185 cm · 80-95 kg");
});

test("unisex M is a different body range from men M", () => {
  assert.equal(sizeChartEntry("UNISEX", "M")?.ukSize, "UK 38-40");
  assert.equal(formatSizeRecommendation(sizeChartEntry("UNISEX", "M")!), "155-175 cm · 55-70 kg");
  assert.equal(formatSizeRecommendation(sizeChartEntry("MEN", "M")!), "165-175 cm · 60-75 kg");
  assert.equal(formatSizeHeadline(sizeChartEntry("UNISEX", "M")!), "M · Unisex");
});

test("kids M maps to 5-8 years and back", () => {
  const entry = sizeChartEntry("KIDS", "M");
  assert.equal(formatAgeRange(entry!), "5-8 Years");
  assert.equal(formatSizeRecommendation(entry!), "110-130 cm · 18-30 kg");
  assert.equal(entry?.ukSize, null);
  assert.equal(kidsAgeRangeCodeFor("M"), "KIDS_5_8Y");
  assert.equal(kidsStandardSizeFromAgeRange("KIDS_5_8Y"), "M");
});

test("legacy kids age codes fold into the six current buckets", () => {
  assert.equal(normalizeKidsAgeRangeCode("NEWBORN"), "BABY_0_1Y");
  assert.equal(normalizeKidsAgeRangeCode("BABY_0_12M"), "BABY_0_1Y");
  assert.equal(normalizeKidsAgeRangeCode("KIDS_6_8Y"), "KIDS_5_8Y");
  assert.equal(normalizeKidsAgeRangeCode("KIDS_9_12Y"), "KIDS_8_11Y");
  assert.equal(normalizeKidsAgeRangeCode("TEEN_13_16Y"), "KIDS_11_14Y");
  assert.equal(normalizeKidsAgeRangeCode("NOT_APPLICABLE"), null);
});

test("women UK numbers outside the chart do not guess a size", () => {
  assert.equal(womenStandardSizeFromUk(11), null);
  assert.equal(womenStandardSizeFromUk(26), null);
  assert.equal(womenStandardSizeFromUk("UK 8"), "S");
  assert.equal(womenStandardSizeFromUk(""), null);
});

test("waist labels stay separate from letter sizes", () => {
  assert.equal(formatWaistSizeLabel(32), "W32");
  assert.equal(formatWaistSizeLabel("W34"), "W34");
  assert.equal(formatWaistSizeLabel(12), null);
  assert.equal(isWaistSizeLabel("W32"), true);
  assert.equal(isWaistSizeLabel("XL"), false);
  assert.equal(waistInchesFrom("W32"), 32);
  assert.equal(waistInchesFrom("32"), null);
});

test("kids and adults offer different size ladders", () => {
  assert.deepEqual(standardSizesForFit("KIDS"), KIDS_STANDARD_SIZES);
  assert.deepEqual(standardSizesForFit("WOMEN"), ADULT_STANDARD_SIZES);
  assert.equal(sizeChartEntry("KIDS", "XXL"), null);
  assert.equal(sizeChartEntry("WOMEN", "BABY"), null);
  assert.equal(sizeChartEntry(null, "M"), null);
});

test("2XL and 3XL spellings resolve to the chart rows", () => {
  assert.equal(sizeChartEntry("MEN", "2XL")?.standardSize, "XXL");
  assert.equal(sizeChartEntry("MEN", "3XL")?.standardSize, "XXXL");
});
