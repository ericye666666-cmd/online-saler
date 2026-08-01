import assert from "node:assert/strict";
import test from "node:test";
import { ProductDetailStatus } from "@online-saler/database";
import { publicDetail } from "./storefront-products.controller";

test("public detail exposes only persisted copy, fit facts and asset URLs", () => {
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
      fitSummary: "Regular fit",
      measurementSummary: "Chest width 48 cm",
      conditionSummary: "Good condition",
      styleTags: ["casual"],
      missingInformation: [],
      warnings: []
    },
    assets: [{ id: "asset-1", type: "MEASUREMENT_GUIDE", publicUrl: null }]
  });

  assert.equal(detail.title, "Verified top");
  assert.deepEqual(detail.bodyRanges.chest, { min: 88, max: 94 });
  assert.equal(detail.assets[0]?.url, "/product-detail-assets/asset-1/content");
});
