import assert from "node:assert/strict";
import {
  CART_MAX_ITEMS,
  CART_STORAGE_VERSION,
  addCartItem,
  cartItemCount,
  cartProductIds,
  cartSubtotalKsh,
  catalogProductToCartItem,
  createCartSnapshot,
  isCartFull,
  removeCartItem,
  parseCartSnapshot,
  productToCartItem,
  tryAddCartItem
} from "./storefront-cart";
import { dictionary, translate } from "../i18n/dictionary";
import { MAX_ACTIVE_RESERVATIONS_PER_PHONE } from "@online-saler/business-rules";
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

// The bag holds 50 pieces, the same as one phone may pay for at once (owner,
// 2026-10-05). The 51st is refused out loud, never dropped silently.
assert.equal(CART_MAX_ITEMS, 50);
assert.equal(CART_MAX_ITEMS, MAX_ACTIVE_RESERVATIONS_PER_PHONE);
const pieces = Array.from({ length: 51 }, (_, index) => ({ productId: `piece-${index + 1}`, addedAt: "2026-10-05T00:00:00.000Z" }));
let bag: ReturnType<typeof createCartSnapshot> | null = null;
for (const piece of pieces.slice(0, 50)) {
  const added = tryAddCartItem(bag, piece, "2026-10-05T00:00:00.000Z");
  assert.equal(added.status, "added");
  bag = added.snapshot;
}
assert.equal(cartItemCount(bag), 50);
assert.equal(isCartFull(bag), true);
const overflow = tryAddCartItem(bag, pieces[50], "2026-10-05T00:00:01.000Z");
assert.equal(overflow.status, "full");
assert.equal(overflow.snapshot, bag, "a full bag is left exactly as it was");
assert.equal(cartItemCount(overflow.snapshot), 50);
assert.ok(!cartProductIds(overflow.snapshot).includes("piece-51"));
// A piece already in a full bag is not reported as overflow.
assert.equal(tryAddCartItem(bag, pieces[0]).status, "alreadyInBag");
// Removing one makes room again.
const roomAgain = removeCartItem(bag, "piece-1");
assert.equal(isCartFull(roomAgain), false);
assert.equal(tryAddCartItem(roomAgain, pieces[50]).status, "added");
// A stored 50-piece bag survives a reload intact.
assert.equal(cartItemCount(parseCartSnapshot(JSON.stringify(bag))), 50);
assert.equal(
  translate("en", "product.bagFull", { count: CART_MAX_ITEMS }),
  "Your bag is full (50 pieces). Check out these first, then add more."
);
assert.equal(translate("zh-CN", "product.bagFull", { count: CART_MAX_ITEMS }), "购物袋已满（50 件）。请先结账这些，再继续添加。");
assert.ok(dictionary["zh-CN"]["product.bagFull"].includes("{count}"));

console.log("Storefront cart helper tests passed");
