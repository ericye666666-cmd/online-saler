import assert from "node:assert/strict";
import test from "node:test";
import { ProductDetailStatus } from "@online-saler/database";
import { publicDetail, publicProduct } from "./storefront-products.controller";

test("public product remains available when no approved detail exists", () => {
  const product = publicProduct({
    id: "product-1",
    productCode: "DL-0001",
    barcode: "920260800001",
    title: "Basic published item",
    description: null,
    category: "TOPS",
    subcategory: null,
    color: "BLACK",
    gender: "UNISEX",
    kidsAgeRange: null,
    brand: null,
    material: null,
    tags: [],
    finalSizeLabel: "M",
    tagSize: null,
    conditionGrade: "GOOD",
    fitType: null,
    stretchLevel: null,
    fabricWeight: null,
    priceKsh: 500,
    publishedAt: new Date("2026-08-03T00:00:00.000Z"),
    detailSourceVersion: 2,
    images: [{ id: "image-1", type: "FRONT", publicUrl: "https://example.test/front.jpg" }],
    measurements: [],
    defects: [],
    detailProfiles: []
  } as never);

  assert.equal(product.id, "product-1");
  assert.equal(product.productCode, "DL-0001");
  assert.equal(product.barcode, "920260800001");
  assert.equal(product.detail, null);
  assert.equal(product.images[0]?.url, "https://example.test/front.jpg");
});

test("public detail exposes persisted copy, factual measurements and asset URLs without fit recommendations", () => {
  const detail = publicDetail({
    id: "profile-1",
    status: ProductDetailStatus.APPROVED,
    sourceDataVersion: 3,
    fitType: "REGULAR",
    stretchLevel: "LOW",
    fabricWeight: "REGULAR",
    bodyChestMinCm: 88,
    bodyChestMaxCm: 94,
    bodyWaistMinCm: null,
    bodyWaistMaxCm: null,
    bodyHipMinCm: null,
    bodyHipMaxCm: null,
    heightMinCm: 160,
    heightMaxCm: 175,
    weightMinKg: null,
    weightMaxKg: null,
    expectedFit: "Regular",
    recommendationConfidence: 0.91,
    recommendationBasis: ["CHEST_WIDTH"],
    recommendationWarnings: [],
    sizeDisclaimer: "Reference only.",
    finalOutputJson: {
      title: "Verified top",
      sellingPoints: ["One", "Two", "Three"],
      shortDescription: "Confirmed copy",
      measurementSummary: "Chest width 48 cm",
      conditionSummary: "Good condition",
      styleTags: ["casual"],
      missingInformation: [],
      warnings: []
    },
    assets: [{ id: "asset-1", type: "MEASUREMENT_GUIDE", publicUrl: null }]
  });

  assert.equal(detail.title, "Verified top");
  assert.equal("bodyRanges" in detail, false);
  assert.equal("fitSummary" in detail, false);
  assert.equal("sizeDisclaimer" in detail, false);
  assert.equal("missingInformation" in detail, false);
  assert.equal("warnings" in detail, false);
  assert.equal(detail.assets[0]?.url, "/product-detail-assets/asset-1/content");
});

function shoeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "shoe-1", productCode: "DL-SHOE-1", barcode: "920260906001", title: "Reviewed sneakers",
    description: null, category: "SHOES", subcategory: "MEN_SPORT_SHOES", color: "BLACK",
    gender: "MEN", kidsAgeRange: null, brand: null, material: null, tags: [],
    finalSizeLabel: "UK 8.5", tagSize: "8.5", shoeSizeSystem: "UK", shoeType: "Sneakers",
    shoeConditionNotes: "Light heel wear on both soles.", shoePairConfirmed: true,
    conditionGrade: "GOOD", fitType: "REGULAR", stretchLevel: "LOW", fabricWeight: "HEAVY",
    priceKsh: 800, publishedAt: new Date("2026-09-06T00:00:00.000Z"), detailSourceVersion: 1,
    images: [{ id: "pair", type: "FRONT", publicUrl: "https://example.test/pair.jpg" }],
    measurements: [{ measurementType: "CHEST_WIDTH", finalValueCm: 48 }], defects: [],
    detailProfiles: [{
      id: "profile-1", status: ProductDetailStatus.APPROVED, sourceDataVersion: 1,
      fitType: "REGULAR", stretchLevel: "LOW", fabricWeight: "HEAVY",
      finalOutputJson: { title: "Reviewed sneakers", measurementSummary: "Chest 48 cm", conditionSummary: "Reviewed wear" },
      assets: [{ id: "front", type: "FRONT_MAIN", publicUrl: "https://example.test/front.webp" },
        { id: "old-guide", type: "MEASUREMENT_GUIDE", publicUrl: "https://example.test/old-shirt.svg" }],
    }],
    ...overrides,
  } as never;
}

test("public shoe JSON includes reviewed shoe facts and suppresses obsolete garment details", () => {
  const product = JSON.parse(JSON.stringify(publicProduct(shoeProduct())));
  assert.equal(product.shoeType, "Sneakers");
  assert.equal(product.shoeSizeSystem, "UK");
  assert.equal(product.tagSize, "8.5");
  assert.equal(product.size, "UK 8.5");
  assert.equal(product.shoeConditionNotes, "Light heel wear on both soles.");
  assert.equal(product.saleUnit, "PAIR");
  assert.equal(product.onlyOneAvailable, true);
  assert.equal("shoePairConfirmed" in product, false);
  assert.equal(product.fitType, null);
  assert.equal(product.stretchLevel, null);
  assert.equal(product.fabricWeight, null);
  assert.deepEqual(product.measurements, []);
  assert.equal(product.detail.fitType, null);
  assert.equal(product.detail.measurementSummary, null);
  assert.deepEqual(product.detail.assets.map((asset: { type: string }) => asset.type), ["FRONT_MAIN"]);
});

test("legacy kids shoes do not publish a clothing size or infer a shoe size from age", () => {
  const product = publicProduct(shoeProduct({
    category: "KIDS", subcategory: "KIDS_SHOES", finalSizeLabel: "L", tagSize: null,
    shoeSizeSystem: null, kidsAgeRange: "8-10 years",
  }));
  assert.equal(product.saleUnit, "PAIR");
  assert.equal(product.size, null);
  assert.deepEqual(product.measurements, []);
});

test("shoe API exposes only human measured insole lengths", () => {
  const measurements = publicProduct(shoeProduct({
    measurements: [
      { measurementType: "CHEST_WIDTH", finalValueCm: 48, finalSource: "HUMAN_ENTERED" },
      { measurementType: "INSOLE_LENGTH", finalValueCm: 26, finalSource: "AI_ESTIMATED" },
      { measurementType: "INSOLE_LENGTH", finalValueCm: 27.5, finalSource: "HUMAN_ENTERED" },
    ],
  })).measurements;
  assert.deepEqual(measurements, [{ type: "INSOLE_LENGTH", valueCm: "27.5" }]);
});
