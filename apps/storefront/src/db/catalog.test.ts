import assert from "node:assert/strict";
import test from "node:test";
import { catalogSizeOptions, filterCatalogProducts } from "../app/catalog-filters";
import { shoeConditionGrades } from "../app/data/products";
import { buildProductGallery, visibleMeasurements } from "../app/product-detail-commerce";
import type { PublicProduct } from "../app/storefront-products";
import { testPublicDetail } from "../app/storefront-products.test-fixture";
import { listPublishedProducts, toCatalogProduct } from "./catalog";

const shoe = {
  id: "shoe-1", productCode: "DL-SHOE-1", barcode: "920260906001", title: "Black sneakers",
  category: "SHOES", subcategory: "MEN_SPORT_SHOES", color: "BLACK", audience: "MEN",
  kidsAgeRange: null, brand: "Example", material: null, tags: [], size: "UK 8.5", tagSize: "8.5",
  shoeSizeSystem: "UK", shoeType: "Sneakers", shoeConditionNotes: "Light heel wear on both soles.",
  saleUnit: "PAIR", conditionGrade: "GOOD", fitType: "REGULAR", stretchLevel: "LOW",
  fabricWeight: "HEAVY", priceKsh: 800, onlyOneAvailable: true,
  images: [
    { id: "pair", type: "FRONT", url: "https://example.test/pair.jpg" },
    { id: "side", type: "BACK", url: "https://example.test/side.jpg" },
    { id: "soles", type: "DETAIL", url: "https://example.test/soles.jpg" },
    { id: "label", type: "LABEL", url: "https://example.test/label.jpg" },
  ],
  measurements: [{ type: "CHEST_WIDTH", valueCm: "48" }], defects: [],
  detail: {
    ...testPublicDetail,
    title: "Black sneakers",
    assets: [...testPublicDetail.assets, { id: "old-guide", type: "MEASUREMENT_GUIDE", url: "/old-shirt-guide.svg" }],
  },
} satisfies PublicProduct & { detail: NonNullable<PublicProduct["detail"]> };

test("published shoe API data survives JSON loading and actual catalog shoe filters", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([shoe]), { headers: { "content-type": "application/json" } });
  try {
    const products = await listPublishedProducts();
    assert.equal(products.length, 1);
    assert.equal(products[0]?.shoeType, "Sneakers");
    assert.equal(products[0]?.saleUnit, "PAIR");
    assert.equal(products[0]?.size, "UK 8.5");
    assert.equal(products[0]?.condition, "Good");
    assert.deepEqual(filterCatalogProducts(products, {
      category: "Shoes", shoeType: "Sneakers", size: "UK 8.5", condition: "Good",
    }).map((product) => product.code), [shoe.barcode]);
    assert.equal(filterCatalogProducts(products, { shoeType: "Sandals" }).length, 0);
    assert.equal(filterCatalogProducts(products, { size: "EU 42" }).length, 0);
    assert.deepEqual(catalogSizeOptions(products, "Shoes"), ["All", "UK 8.5"]);
    assert.ok(shoeConditionGrades.includes(products[0]!.condition as typeof shoeConditionGrades[number]));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("shoe facts retain actual label and wear while discarding stale apparel assumptions", () => {
  const product = toCatalogProduct(shoe);
  assert.equal(product.tagSize, "8.5");
  assert.equal(product.shoeSizeSystem, "UK");
  assert.equal(product.detail?.conditionSummary, "Light heel wear on both soles.");
  assert.equal(product.material, "Not specified");
  assert.equal(product.detail?.fitType, null);
  assert.equal(product.detail?.stretchLevel, null);
  assert.equal(product.detail?.fabricWeight, null);
  assert.equal(product.detail?.measurementSummary, null);
  assert.deepEqual(product.detail?.measurements, []);
  assert.equal(product.detail?.assets.some((asset) => asset.type === "MEASUREMENT_GUIDE"), false);
  const gallery = buildProductGallery(product);
  assert.ok(gallery.some((image) => image.image.endsWith("/pair.jpg") && image.label === "Pair photo"));
  assert.ok(gallery.some((image) => image.image.endsWith("/side.jpg") && image.label === "Side photo"));
  assert.ok(gallery.some((image) => image.image.endsWith("/soles.jpg")));
  assert.ok(gallery.some((image) => image.label === "Size label"));
});

test("missing and legacy kids shoe sizes never acquire an apparel or inferred age size", () => {
  const product = toCatalogProduct({
    ...shoe, category: "KIDS", subcategory: "KIDS_SHOES", size: "L", tagSize: null,
    shoeSizeSystem: null, kidsAgeRange: "8-10 years", conditionGrade: null,
  });
  assert.equal(product.category, "Shoes");
  assert.equal(product.size, "Size not confirmed");
  assert.equal(product.condition, "Not specified");
  assert.deepEqual(catalogSizeOptions([product], "Shoes"), ["All"]);
});

test("shoe measurements never include garment values; apparel behavior remains intact", () => {
  assert.deepEqual(visibleMeasurements([
    { type: "CHEST_WIDTH", valueCm: "48" }, { type: "INSOLE_LENGTH", valueCm: "27.5" },
  ], "Shoes"), [{ type: "INSOLE_LENGTH", label: "Insole length", valueCm: 27.5 }]);
  const apparel = toCatalogProduct({ ...shoe, category: "TOP", subcategory: "TSHIRT", size: "M" });
  assert.equal(apparel.category, "Tops");
  assert.equal(apparel.size, "M");
  assert.equal(apparel.detail?.fitType, "Regular");
  assert.equal(apparel.detail?.measurements[0]?.type, "CHEST_WIDTH");
  assert.equal(apparel.detail?.assets.some((asset) => asset.type === "MEASUREMENT_GUIDE"), true);
});


test("catalog preserves unavailable status so purchase controls stay disabled", () => {
  assert.equal(toCatalogProduct({ ...shoe, availability: "SOLD" }).status, "Sold");
  assert.equal(toCatalogProduct({ ...shoe, availability: "RESERVED" }).status, "Reserved");
  assert.equal(toCatalogProduct({ ...shoe, availability: "AVAILABLE" }).status, "Available");
});
