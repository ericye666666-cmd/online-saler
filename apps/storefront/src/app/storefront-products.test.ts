import assert from "node:assert/strict";
import {
  activeFilterCount,
  detailAsset,
  detailAssetSrc,
  hasApprovedPublicDetail,
  moneyKsh,
  productImageSrc,
  productMeta,
  publicProductImageSrc,
  publicProductQueryString,
  type PublicProduct
} from "./storefront-products";
import { testPublicDetail } from "./storefront-products.test-fixture";

const product: PublicProduct = {
  id: "product-1",
  title: "Coral Orange Graphic T-Shirt",
  category: "TSHIRTS",
  subcategory: "TSHIRT",
  color: "ORANGE",
  audience: "UNISEX",
  kidsAgeRange: null,
  brand: "Mock Brand",
  size: "M",
  conditionGrade: "GOOD",
  fitType: "REGULAR",
  stretchLevel: "LOW",
  fabricWeight: "REGULAR",
  priceKsh: 450,
  onlyOneAvailable: true,
  images: [{ id: "image-1", type: "FRONT", url: "/products/product-1/images/image-1/content" }],
  measurements: [{ type: "CHEST_WIDTH", valueCm: "48" }],
  defects: [],
  detail: testPublicDetail
};

assert.equal(productImageSrc(product), "/api-proxy/products/product-1/images/image-1/content");
assert.equal(publicProductImageSrc(product.images[0]!), "/api-proxy/products/product-1/images/image-1/content");
assert.equal(
  publicProductImageSrc({ id: "image-2", type: "LABEL", url: "https://storage.example/label.jpg" }),
  "https://storage.example/label.jpg"
);
assert.equal(productMeta(product), "TSHIRTS / TSHIRT / ORANGE / M");
assert.equal(detailAsset(product, "FRONT_MAIN")?.id, "detail-front");
assert.equal(hasApprovedPublicDetail(product), true);
assert.equal(hasApprovedPublicDetail({ ...product, detail: undefined }), false);
assert.equal(detailAssetSrc(testPublicDetail.assets[0]!), "/api-proxy/product-detail-assets/detail-front/content");
assert.equal(moneyKsh(450), "KSh 450");
assert.equal(moneyKsh(null), "Price pending");
assert.equal(moneyKsh(0), "Price pending");
assert.equal(
  publicProductQueryString({
    category: "TOP",
    color: "ORANGE",
    size: "",
    q: " graphic "
  }),
  "?category=TOP&color=ORANGE&q=graphic"
);
assert.equal(activeFilterCount({ category: "TOP", sort: "price_low", q: "shirt" }), 2);
assert.equal(activeFilterCount({ sort: "price_high" }), 0);

console.log("Storefront product helper tests passed");
