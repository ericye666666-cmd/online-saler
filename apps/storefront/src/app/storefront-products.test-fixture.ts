import type { PublicProductDetail } from "./storefront-products";

export const testPublicDetail: PublicProductDetail = {
  profileId: "detail-1",
  title: "Coral Orange Graphic T-Shirt",
  sellingPoints: ["Measured flat", "Regular fit", "One item only"],
  shortDescription: "A calibrated second-hand T-shirt.",
  measurementSummary: "Chest width 48 cm.",
  conditionSummary: "Good condition.",
  styleTags: ["casual"],
  fitType: "REGULAR",
  stretchLevel: "LOW",
  fabricWeight: "REGULAR",
  assets: [{ id: "detail-front", type: "FRONT_MAIN", url: "/product-detail-assets/detail-front/content" }]
};
