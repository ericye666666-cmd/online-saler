import assert from "node:assert/strict";
import {
  CART_STORAGE_VERSION,
  cartSubtotalKsh,
  createCartSnapshot,
  parseCartSnapshot,
  productToCartItem
} from "./storefront-cart";
import type { PublicProduct } from "./storefront-products";

const product: PublicProduct = {
  id: "product-1",
  title: "Coral Orange Graphic T-Shirt",
  category: "TOP",
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
  measurements: [],
  defects: []
};

const item = productToCartItem(product);
assert.equal(item.productId, "product-1");
assert.equal(item.title, "Coral Orange Graphic T-Shirt");
assert.equal(item.priceKsh, 450);
assert.equal(item.meta, "TOP / ORANGE / M");

const snapshot = createCartSnapshot(item, "2026-07-30T00:00:00.000Z");
assert.equal(snapshot.version, CART_STORAGE_VERSION);
assert.equal(cartSubtotalKsh(snapshot), 450);
assert.equal(cartSubtotalKsh(null), 0);
assert.deepEqual(parseCartSnapshot(JSON.stringify(snapshot)), snapshot);
assert.equal(parseCartSnapshot(null), null);
assert.equal(parseCartSnapshot("{bad json"), null);
assert.equal(parseCartSnapshot(JSON.stringify({ version: 0, item })), null);

console.log("Storefront cart helper tests passed");
