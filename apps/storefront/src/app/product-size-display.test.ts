import assert from "node:assert/strict";
import test from "node:test";
import { toCatalogProduct } from "../db/catalog";
import { productSizeDisplay } from "./product-size-display";
import type { PublicProduct } from "./storefront-products";
import { testPublicDetail } from "./storefront-products.test-fixture";

const base = {
  id: "p-1", productCode: "DL-1", barcode: "920260906002", title: "Item",
  category: "TSHIRTS", subcategory: "TSHIRT", color: "BLACK", audience: "WOMEN",
  kidsAgeRange: null, brand: "Example", material: "COTTON", tags: [], size: "L", tagSize: "UK 14",
  shoeSizeSystem: null, shoeType: null, shoeConditionNotes: null, conditionGrade: "GOOD",
  fitType: "REGULAR", stretchLevel: "LOW", fabricWeight: "LIGHT", priceKsh: 800, onlyOneAvailable: true,
  images: [{ id: "front", type: "FRONT", url: "https://example.test/front.jpg" }],
  measurements: [], defects: [], detail: { ...testPublicDetail, title: "Item" }
} satisfies PublicProduct & { detail: NonNullable<PublicProduct["detail"]> };

test("a women's item reads as its standard size and UK size", () => {
  const display = productSizeDisplay(toCatalogProduct(base));
  assert.equal(display.headline, "L · UK 14");
  assert.equal(display.recommendation, "160-170 cm · 58-70 kg");
  assert.equal(display.ukEquivalent, null);
  assert.equal(display.age, null);
});

test("a men's item uses the men's body ranges", () => {
  const display = productSizeDisplay(toCatalogProduct({ ...base, audience: "MEN", size: "XL" }));
  assert.equal(display.headline, "XL · UK 46-48");
  assert.equal(display.recommendation, "175-185 cm · 80-95 kg");
});

test("a unisex item shows the UK equivalent on its own line", () => {
  const display = productSizeDisplay(toCatalogProduct({ ...base, audience: "UNISEX", size: "M" }));
  assert.equal(display.headline, "M · Unisex");
  assert.equal(display.ukEquivalent, "38-40");
  assert.equal(display.recommendation, "155-175 cm · 55-70 kg");
});

test("a kids item shows the age range and no UK size", () => {
  const display = productSizeDisplay(
    toCatalogProduct({ ...base, category: "KIDS", subcategory: "KIDS_TOPS", audience: "KIDS", size: "M" })
  );
  assert.equal(display.headline, "M · Kids");
  assert.equal(display.age, "5-8 Years");
  assert.equal(display.ukEquivalent, null);
  assert.equal(display.recommendation, "110-130 cm · 18-30 kg");
});

test("men's trousers show a waist with no letter size or UK equivalent", () => {
  const product = toCatalogProduct({ ...base, category: "PANTS", subcategory: "MEN_JEANS", audience: "MEN", size: "W32" });
  assert.equal(product.size, "Waist 32");
  const display = productSizeDisplay(product);
  assert.equal(display.headline, "Waist 32");
  assert.equal(display.ukEquivalent, null);
  assert.equal(display.recommendation, null);
});

test("a label the chart cannot resolve is shown as stored, with no invented guidance", () => {
  // Legacy rows keep their original label rather than being reinterpreted under the new chart.
  const legacy = toCatalogProduct({ ...base, audience: "WOMEN", size: "UK 12" });
  assert.equal(legacy.size, "UK 12");
  assert.equal(legacy.ukSize, null);
  assert.equal(legacy.recommendedHeight, null);
  assert.equal(productSizeDisplay(legacy).headline, "UK 12");
  assert.equal(productSizeDisplay(legacy).recommendation, null);

  const wrongLadder = toCatalogProduct({ ...base, audience: "WOMEN", size: "BABY" });
  assert.equal(wrongLadder.ukSize, null);
  assert.equal(productSizeDisplay(wrongLadder).recommendation, null);
});
