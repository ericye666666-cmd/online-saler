import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCT_DETAIL_MEASUREMENT_TEMPLATES,
  renderProductDetailMeasurementGuideSvg,
  resolveProductDetailMeasurements,
  selectProductDetailMeasurementTemplate,
  type ProductDetailMeasurementTemplateCode
} from "./product-detail-measurement-templates";

const fixtures: Array<[string, string, ProductDetailMeasurementTemplateCode]> = [
  ["TSHIRTS", "CREW_NECK_TSHIRT", "T_SHIRT"],
  ["TOPS", "BUTTON_SHIRT", "SHIRT"],
  ["LADY_TOPS", "BLOUSE", "BLOUSE"],
  ["TOPS", "HOODIE", "HOODIE"],
  ["TOPS", "SWEATER", "SWEATER"],
  ["JACKETS", "OUTDOOR_JACKET", "OUTERWEAR"],
  ["DRESSES", "MIDI_DRESS", "DRESS"],
  ["PANTS", "JEANS", "PANTS"],
  ["SHORT", "CASUAL_SHORTS", "SHORTS"],
  ["SKIRTS", "MIDI_SKIRT", "SKIRT"],
  ["KIDS", "KIDS_TOP", "KIDS_TOP"],
  ["SETS", "TWO_PIECE_SET", "TWO_PIECE_SET"]
];

test("selects each of the twelve production garment templates", () => {
  for (const [category, subcategory, expected] of fixtures) {
    assert.equal(selectProductDetailMeasurementTemplate(category, subcategory).code, expected);
  }
});

test("keeps explicit generic top, bottom and garment fallbacks", () => {
  assert.equal(selectProductDetailMeasurementTemplate("TOPS", "OTHER").code, "GENERIC_TOP");
  assert.equal(selectProductDetailMeasurementTemplate("BOTTOMS", "OTHER").code, "GENERIC_BOTTOM");
  assert.equal(selectProductDetailMeasurementTemplate("OTHER", null).code, "GENERIC_GARMENT");
  assert.equal(Object.keys(PRODUCT_DETAIL_MEASUREMENT_TEMPLATES).length, 15);
});

test("maps database measurement keys, supports aliases and hides missing values", () => {
  const resolved = resolveProductDetailMeasurements(PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.BLOUSE, {
    SHOULDER_WIDTH: 42,
    CHEST_WIDTH: 51.5,
    SLEEVE_LENGTH: 58,
    LENGTH: 66,
    HEM_WIDTH: null
  });
  assert.deepEqual(resolved.map(({ key, sourceKey, valueCm }) => ({ key, sourceKey, valueCm })), [
    { key: "shoulderWidth", sourceKey: "SHOULDER_WIDTH", valueCm: 42 },
    { key: "bustWidth", sourceKey: "CHEST_WIDTH", valueCm: 51.5 },
    { key: "sleeveLength", sourceKey: "SLEEVE_LENGTH", valueCm: 58 },
    { key: "garmentLength", sourceKey: "LENGTH", valueCm: 66 }
  ]);
});

test("renders deterministic standalone SVG without external images or unconfirmed rows", () => {
  const svg = renderProductDetailMeasurementGuideSvg({
    template: PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.PANTS,
    title: "Faded flared jeans",
    measurements: { WAIST: 45.5, HIP: 52.5, OUTSEAM: 114.5, INSEAM: 84 }
  });
  assert.match(svg, /data-template-code="PANTS"/);
  assert.match(svg, />45\.5 cm</);
  assert.match(svg, />84 cm</);
  assert.match(svg, /Some measurements are not available\./);
  assert.doesNotMatch(svg, /Not confirmed|<image|href=/i);
});

test("escapes customer-facing text before inserting it into SVG", () => {
  const svg = renderProductDetailMeasurementGuideSvg({
    template: PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.T_SHIRT,
    title: "A & B <Tee>",
    measurements: { SHOULDER_WIDTH: 40, CHEST_WIDTH: 49, SLEEVE_LENGTH: 20, LENGTH: 65 }
  });
  assert.match(svg, /A &amp; B &lt;Tee&gt;/);
  assert.doesNotMatch(svg, /Some measurements are not available/);
});
