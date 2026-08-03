import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCT_DETAIL_MEASUREMENT_TEMPLATES,
  renderProductDetailMeasurementGuideSvg,
  resolveProductDetailMeasurements,
  selectProductDetailMeasurementTemplate,
  type ProductDetailMeasurementTemplateCode
} from "./product-detail-measurement-templates";

const fixtures: Array<[string, string, string | null, ProductDetailMeasurementTemplateCode]> = [
  ["LADY_TOPS", "CAMISOLE", "SLEEVELESS", "TOP_SLEEVELESS"],
  ["TSHIRTS", "CREW_NECK_TSHIRT", "SHORT", "TOP_SHORT_SLEEVE"],
  ["TOPS", "SWEATER", "LONG", "TOP_LONG_SLEEVE"],
  ["JACKETS", "OUTDOOR_JACKET", "LONG", "OUTERWEAR_JACKET"],
  ["PANTS", "JEANS", null, "PANTS"],
  ["SHORT", "CASUAL_SHORTS", null, "SHORTS"],
  ["SKIRTS", "MIDI_SKIRT", null, "SKIRT"],
  ["DRESSES", "MIDI_DRESS", "SLEEVELESS", "DRESS_SLEEVELESS"],
  ["DRESSES", "MIDI_DRESS", "SHORT", "DRESS_SHORT_SLEEVE"],
  ["DRESSES", "MIDI_DRESS", "LONG", "DRESS_LONG_SLEEVE"],
  ["SETS", "TWO_PIECE_SET", null, "TWO_PIECE_SET"],
  ["KIDS", "KIDS_TOP", "SHORT", "KIDS_TOP_SHORT_SLEEVE"],
  ["KIDS", "KIDS_TOP", "LONG", "KIDS_TOP_LONG_SLEEVE"],
  ["KIDS", "KIDS_JACKET", "LONG", "KIDS_OUTERWEAR"],
  ["KIDS", "KIDS_PANTS", null, "KIDS_PANTS"],
  ["KIDS", "KIDS_DRESS", "SHORT", "KIDS_DRESS"],
  ["KIDS", "KIDS_SKIRT", null, "KIDS_SKIRT"],
  ["FULL_BODY", "JUMPSUIT", null, "JUMPSUIT_ROMPER"],
  ["BABY", "ONESIE", null, "BABY_ONESIE"],
  ["SWIMWEAR", "ONE_PIECE_SWIM", null, "BODYSUIT_SWIMWEAR"],
  ["COATS", "TRENCH_COAT", "LONG", "LONG_COAT_TRENCH"]
];

test("selects each of the twenty-one specialised garment templates", () => {
  for (const [category, subcategory, sleeveType, expected] of fixtures) {
    assert.equal(selectProductDetailMeasurementTemplate(category, subcategory, sleeveType).code, expected);
  }
});

test("keeps explicit generic top, bottom and garment fallbacks", () => {
  assert.equal(selectProductDetailMeasurementTemplate("TOPS", "OTHER").code, "GENERIC_TOP");
  assert.equal(selectProductDetailMeasurementTemplate("BOTTOMS", "OTHER").code, "GENERIC_BOTTOM");
  assert.equal(selectProductDetailMeasurementTemplate("OTHER", null).code, "GENERIC_GARMENT");
  assert.equal(Object.keys(PRODUCT_DETAIL_MEASUREMENT_TEMPLATES).length, 24);
});

test("gives every template field a diagram guide so rendered rows and markers stay paired", () => {
  for (const template of Object.values(PRODUCT_DETAIL_MEASUREMENT_TEMPLATES)) {
    for (const measurementField of template.measurementFields) {
      assert.ok(
        template.measurementGuides[measurementField.key],
        `${template.code} is missing the ${measurementField.key} diagram guide`
      );
    }
  }
});

test("selects distinct sleeveless, short-sleeve and long-sleeve dress outlines", () => {
  assert.equal(
    selectProductDetailMeasurementTemplate("DRESSES", "MIDI_DRESSES", "SLEEVELESS").code,
    "DRESS_SLEEVELESS"
  );
  assert.equal(
    selectProductDetailMeasurementTemplate("DRESSES", "MIDI_DRESSES", "LONG").code,
    "DRESS_LONG_SLEEVE"
  );
  assert.equal(
    selectProductDetailMeasurementTemplate("DRESSES", "MIDI_DRESSES", null).code,
    "DRESS_SHORT_SLEEVE"
  );
});

test("maps database measurement keys, supports aliases and hides missing values", () => {
  const resolved = resolveProductDetailMeasurements(PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.DRESS_SHORT_SLEEVE, {
    SHOULDER_WIDTH: 42,
    CHEST_WIDTH: 51.5,
    SLEEVE_LENGTH: 58,
    LENGTH: 66,
    HEM_WIDTH: null
  });
  assert.deepEqual(resolved.map(({ key, sourceKey, valueCm }) => ({ key, sourceKey, valueCm })), [
    { key: "shoulderWidth", sourceKey: "SHOULDER_WIDTH", valueCm: 42 },
    { key: "bustWidth", sourceKey: "CHEST_WIDTH", valueCm: 51.5 },
    { key: "garmentLength", sourceKey: "LENGTH", valueCm: 66 },
    { key: "sleeveLength", sourceKey: "SLEEVE_LENGTH", valueCm: 58 }
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

test("injects A-E markers, labels and calibrated values into a sleeveless dress SVG", () => {
  const svg = renderProductDetailMeasurementGuideSvg({
    template: PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.DRESS_SLEEVELESS,
    title: "Cream floral sleeveless midi dress",
    measurements: {
      SHOULDER_WIDTH: 24,
      CHEST_WIDTH: 33.5,
      WAIST: 29,
      HIP: 45,
      LENGTH: 107.5
    }
  });
  assert.match(svg, /data-template-code="DRESS_SLEEVELESS"/);
  assert.match(svg, /data-template-version="measurement-guides-v3\.0\.0"/);
  assert.match(svg, /data-measurement-count="5"/);
  assert.match(svg, /<circle cx="24" cy="0"/);
  assert.match(svg, /<text x="418" y="7" text-anchor="end" class="value">33\.5 cm</);
  assert.doesNotMatch(svg, /cx="724"/);
  for (const marker of ["A", "B", "C", "D", "E"]) {
    assert.match(svg, new RegExp(`class="diagram-marker">${marker}<`));
  }
  for (const label of ["Shoulder width", "Bust width", "Waist width", "Hip width", "Garment length"]) {
    assert.match(svg, new RegExp(`>${label}<`));
  }
  for (const value of ["24 cm", "33.5 cm", "29 cm", "45 cm", "107.5 cm"]) {
    assert.match(svg, new RegExp(`>${value}<`));
  }
  assert.doesNotMatch(svg, /Sleeve length/);
});

test("escapes customer-facing text before inserting it into SVG", () => {
  const svg = renderProductDetailMeasurementGuideSvg({
    template: PRODUCT_DETAIL_MEASUREMENT_TEMPLATES.TOP_SHORT_SLEEVE,
    title: "A & B <Tee>",
    measurements: { SHOULDER_WIDTH: 40, CHEST_WIDTH: 49, SLEEVE_LENGTH: 20, LENGTH: 65 }
  });
  assert.match(svg, /A &amp; B &lt;Tee&gt;/);
  assert.doesNotMatch(svg, /Some measurements are not available/);
});
