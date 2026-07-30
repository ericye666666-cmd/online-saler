import assert from "node:assert/strict";
import {
  activeFilterCount,
  moneyKsh,
  productImageSrc,
  productMeta,
  publicProductQueryString,
  type PublicProduct
} from "./storefront-products";

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
  priceKsh: 450,
  onlyOneAvailable: true,
  images: [{ id: "image-1", type: "FRONT", url: "/products/product-1/images/image-1/content" }],
  measurements: [{ type: "CHEST_WIDTH", valueCm: "48" }],
  defects: []
};

assert.equal(productImageSrc(product), "/api-proxy/products/product-1/images/image-1/content");
assert.equal(productMeta(product), "TSHIRTS / TSHIRT / ORANGE / M");
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
