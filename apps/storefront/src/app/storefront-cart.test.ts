import assert from "node:assert/strict";
import {
  CART_STORAGE_VERSION,
  addCartItem,
  cartItemCount,
  cartProductIds,
  cartSubtotalKsh,
  catalogProductToCartItem,
  createCartSnapshot,
  removeCartItem,
  parseCartSnapshot,
  productToCartItem
} from "./storefront-cart";
import type { Product as CatalogProduct } from "./data/products";
import type { PublicProduct } from "./storefront-products";
import { testPublicDetail } from "./storefront-products.test-fixture";

const product: PublicProduct = {
  id: "product-1",
  productCode: "DL-0001",
  barcode: "920260800001",
  title: "Coral Orange Graphic T-Shirt",
  category: "TOP",
  subcategory: "TSHIRT",
  color: "ORANGE",
  audience: "UNISEX",
  kidsAgeRange: null,
  brand: "Mock Brand",
  material: "COTTON_BLEND",
  tags: ["CREW_NECK", "GRAPHIC_PRINT"],
  size: "M",
  conditionGrade: "GOOD",
  fitType: "REGULAR",
  stretchLevel: "LOW",
  fabricWeight: "REGULAR",
  priceKsh: 450,
  onlyOneAvailable: true,
  images: [{ id: "image-1", type: "FRONT", url: "/products/product-1/images/image-1/content" }],
  measurements: [],
  defects: [],
  detail: testPublicDetail
};

const item = productToCartItem(product);
assert.equal(item.productId, "product-1");
assert.ok(item.addedAt);

const catalogProduct: CatalogProduct = {
  code: "catalog-1",
  title: "Coral button-front midi dress",
  category: "Dresses",
  brand: "Unbranded",
  price: 650,
  size: "M",
  material: "Viscose blend",
  color: "Coral",
  store: "Kikuyu",
  status: "Available",
  condition: "Very good",
  image: "/products/920260718001.webp",
  ogImage: "/og/920260718001.jpg",
  description: "Checked in Kikuyu"
};
const catalogItem = catalogProductToCartItem(catalogProduct);
assert.equal(catalogItem.productId, "catalog-1");
assert.ok(catalogItem.addedAt);

const snapshot = createCartSnapshot(item, "2026-07-30T00:00:00.000Z");
assert.equal(snapshot.version, CART_STORAGE_VERSION);
assert.deepEqual(cartProductIds(snapshot), ["product-1"]);
assert.equal(cartItemCount(snapshot), 1);
assert.equal(cartSubtotalKsh([{ priceKsh: 450, canCheckout: true }, { priceKsh: 650, canCheckout: false }]), 450);
assert.equal(cartSubtotalKsh(null), 0);
assert.deepEqual(parseCartSnapshot(JSON.stringify(snapshot)), snapshot);
assert.deepEqual(parseCartSnapshot(JSON.stringify({ version: CART_STORAGE_VERSION, item: catalogItem, updatedAt: "2026-07-30T00:00:00.000Z" }))?.items[0]?.productId, "catalog-1");
assert.equal(parseCartSnapshot(null), null);
assert.equal(parseCartSnapshot("{bad json"), null);
assert.equal(parseCartSnapshot(JSON.stringify({ version: 0, item })), null);

const withDuplicate = addCartItem(addCartItem(snapshot, catalogItem, "2026-07-30T00:00:01.000Z"), catalogItem, "2026-07-30T00:00:02.000Z");
assert.deepEqual(cartProductIds(withDuplicate), ["product-1", "catalog-1"]);
assert.deepEqual(cartProductIds(removeCartItem(withDuplicate, "product-1")), ["catalog-1"]);

console.log("Storefront cart helper tests passed");
