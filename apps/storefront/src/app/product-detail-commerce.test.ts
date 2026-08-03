import assert from "node:assert/strict";
import {
  buildProductGallery,
  formatMeasurement,
  normalizeProductTitle,
  optionalDisplayValue,
  productCopyWithoutPrice,
  publicProductCode,
  sellingPointsWithoutPrice,
  visibleMeasurements,
} from "./product-detail-commerce";
import type { Product } from "./data/products";

assert.equal(
  normalizeProductTitle("Cipo & Baxx", "Cipo & Baxx Cipo & Baxx Faded Flared Jeans"),
  "Cipo & Baxx Faded Flared Jeans",
);
assert.equal(normalizeProductTitle("Nike", "Air Max 90"), "Nike Air Max 90");
assert.equal(normalizeProductTitle("Unbranded", "Striped shirt"), "Striped shirt");
assert.equal(optionalDisplayValue("Not confirmed"), null);
assert.equal(optionalDisplayValue("  Regular  "), "Regular");
assert.equal(
  productCopyWithoutPrice("Heavy denim with low stretch. KSh 500."),
  "Heavy denim with low stretch.",
);
assert.deepEqual(
  sellingPointsWithoutPrice(["KSh 700", "Faded wash", "Zip-front design"]),
  ["Faded wash", "Zip-front design"],
);
assert.equal(publicProductCode({ id: "uuid", productCode: "DL-1", barcode: "920260800001" }), "920260800001");
assert.equal(publicProductCode({ id: "uuid", productCode: "DL-1", barcode: null }), "DL-1");

const measurements = visibleMeasurements([
  { type: "INSEAM", valueCm: "84" },
  { type: "SHOULDER_WIDTH", valueCm: null },
  { type: "WAIST_WIDTH", valueCm: "45.5" },
  { type: "OUTSEAM", valueCm: "114.5" },
  { type: "HIP_WIDTH", valueCm: "52.5" },
], "Trousers");
assert.deepEqual(measurements.map((measurement) => measurement.type), [
  "WAIST_WIDTH",
  "HIP_WIDTH",
  "OUTSEAM",
  "INSEAM",
]);
assert.equal(formatMeasurement(measurements[0]!.valueCm), "45.5 cm");

const product = {
  code: "920260800001",
  title: "Example trousers",
  category: "Trousers",
  brand: "Example",
  price: 500,
  size: "M",
  material: "Cotton",
  color: "Blue",
  store: "Kikuyu",
  status: "Available",
  condition: "Good",
  image: "/optimized.webp",
  ogImage: "/optimized.webp",
  description: "Example",
  detail: {
    sellingPoints: [],
    measurementSummary: null,
    conditionSummary: null,
    styleTags: [],
    fitType: "Regular",
    stretchLevel: "Low",
    fabricWeight: "Medium",
    measurements: [],
    defects: [],
    assets: [
      { id: "back", type: "BACK_MAIN", image: "/back.webp" },
      { id: "front-duplicate", type: "FRONT_MAIN", image: "/optimized.webp" },
    ],
    sourceImages: [
      { id: "detail", type: "DETAIL", image: "/detail.webp" },
      { id: "empty", type: "DEFECT", image: "" },
    ],
  },
} satisfies Product;

assert.deepEqual(buildProductGallery(product).map((item) => item.label), [
  "Front main",
  "Back main",
  "Detail 1",
]);

console.log("Storefront product detail commerce tests passed");
