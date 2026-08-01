import type { PublicProductDetail } from "./storefront-products";

export const testPublicDetail: PublicProductDetail = {
  profileId: "detail-1",
  title: "Coral Orange Graphic T-Shirt",
  sellingPoints: ["Measured flat", "Regular fit", "One item only"],
  shortDescription: "A calibrated second-hand T-shirt.",
  fitSummary: "Regular fit with low stretch.",
  measurementSummary: "Chest width 48 cm.",
  conditionSummary: "Good condition.",
  styleTags: ["casual"],
  missingInformation: [],
  warnings: [],
  fitType: "REGULAR",
  stretchLevel: "LOW",
  fabricWeight: "REGULAR",
  bodyRanges: {
    chest: { min: 88, max: 94 },
    waist: { min: null, max: null },
    hip: { min: null, max: null },
    height: { min: 160, max: 175 },
    weight: { min: null, max: null }
  },
  expectedFit: "Regular",
  recommendationConfidence: 0.9,
  recommendationBasis: ["CHEST_WIDTH"],
  recommendationWarnings: [],
  sizeDisclaimer: "Height and weight are reference only.",
  assets: [{ id: "detail-front", type: "FRONT_MAIN", url: "/product-detail-assets/detail-front/content" }]
};
