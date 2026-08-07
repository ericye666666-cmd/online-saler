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
