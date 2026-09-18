import assert from "node:assert/strict";
import { browseHref, classifyProduct, departmentCategories, stockedMenu } from "./shop-taxonomy";

const where = (product: Parameters<typeof classifyProduct>[0]) =>
  classifyProduct(product).map((placement) => `${placement.department}: ${placement.category}`);

// Unisex clothing is shelved in both Women and Men; gendered items in one.
assert.deepEqual(where({ category: "TSHIRTS", subcategory: "BASIC_TSHIRT", audience: "UNISEX" }), ["Women: T-shirts & vests", "Men: T-shirts"]);
assert.deepEqual(where({ category: "JACKETS", subcategory: "HOODIES", audience: "MEN" }), ["Men: Hoodies & sweatshirts"]);
assert.deepEqual(where({ category: "LADY_TOPS", subcategory: "FANCY_TOPS", audience: "WOMEN" }), ["Women: Tops"]);

// Hoodies filed under OTHER or accessories, and a blazer under women's tops,
// still reach the shelf a shopper would look on.
assert.deepEqual(where({ category: "OTHERS", subcategory: "OTHER", audience: "UNISEX", title: "Hooded Sweatshirt" }), ["Women: Hoodies & sweatshirts", "Men: Hoodies & sweatshirts"]);
assert.deepEqual(where({ category: "OTHER", subcategory: "OTHER", audience: "WOMEN", title: "Hooded Zip Jacket" }), ["Women: Hoodies & sweatshirts"]);
assert.deepEqual(where({ category: "LADY_TOPS", subcategory: "OTHER", audience: "WOMEN", title: "Blazer" }), ["Women: Jackets"]);
assert.deepEqual(where({ category: "TSHIRTS", subcategory: "POLO_SHIRTS", audience: "UNISEX" }), ["Women: Shirts", "Men: Polo shirts"]);

// Non-clothing departments ignore audience.
assert.deepEqual(where({ category: "BAG", subcategory: "CLUTCH_BAG", audience: "KIDS" }), ["Bags: Clutch bags"]);
assert.deepEqual(where({ category: "BAG", subcategory: "OTHER" }), ["Bags: Other bags"]);
assert.deepEqual(where({ category: "SHOES", shoeType: "High heels", audience: "WOMEN", isShoe: true }), ["Shoes: Heels"]);
assert.deepEqual(where({ category: "SHOES", subcategory: "KIDS_SHOES", audience: "KIDS", isShoe: true }), ["Shoes: Kids' shoes"]);
assert.deepEqual(where({ category: "OTHERS", subcategory: "HATS_CAPS" }), ["Accessories: Hats"]);
assert.deepEqual(where({ category: "OTHERS", subcategory: "OTHER", title: "Leather key ring" }), ["Accessories: Other accessories"]);
assert.deepEqual(where({ category: "TEXTILE", subcategory: "CURTAINS" }), ["Home: Curtains"]);
assert.deepEqual(where({ category: "KIDS", subcategory: "KIDS_HOODIES", audience: "KIDS" }), ["Kids: Hoodies & jackets"]);
assert.deepEqual(where({ category: "KIDS", subcategory: "NEWBORN", audience: "KIDS" }), ["Kids: Baby"]);

// Every label the classifier can return is on its department's menu.
for (const category of ["TSHIRTS", "SHIRTS", "LADY_TOPS", "JACKETS", "PANTS", "SHORT", "DRESSES", "TWO_PIECE", "OTHER", "OTHERS", "KIDS", "BAG", "TEXTILE"]) {
  for (const audience of ["WOMEN", "MEN", "UNISEX", "KIDS", null]) {
    for (const placement of classifyProduct({ category, subcategory: "OTHER", audience })) {
      assert.ok(departmentCategories[placement.department].includes(placement.category), `${placement.department} lacks ${placement.category}`);
    }
  }
}

// The menu lists stocked departments and categories only, in menu order;
// a unisex item counts once per department.
const menu = stockedMenu([
  classifyProduct({ category: "TSHIRTS", subcategory: "BASIC_TSHIRT", audience: "UNISEX" }),
  classifyProduct({ category: "JACKETS", subcategory: "HOODIES", audience: "WOMEN" }),
  classifyProduct({ category: "BAG", subcategory: "HANDBAG" }),
]);
assert.deepEqual(menu.map((entry) => [entry.department, entry.total]), [["Women", 2], ["Men", 1], ["Bags", 1]]);
assert.deepEqual(menu[0]!.categories, [{ category: "T-shirts & vests", count: 1 }, { category: "Hoodies & sweatshirts", count: 1 }]);

assert.equal(browseHref({ department: "Women", shopCategory: "Hoodies & sweatshirts" }), "/?category=Women&type=Hoodies+%26+sweatshirts");
assert.equal(browseHref({ department: "All" }, "SELLER1"), "/?ref=SELLER1");

console.log("Shop taxonomy tests passed");
