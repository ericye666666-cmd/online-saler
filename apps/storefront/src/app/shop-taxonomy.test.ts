import assert from "node:assert/strict";
import { browseHref, browseSections, classifyProduct, departmentCategories, onChosenShelf, stockedGroups, stockedMenu } from "./shop-taxonomy";

const where = (product: Parameters<typeof classifyProduct>[0]) =>
  classifyProduct(product).map((placement) => `${placement.department} > ${placement.group} > ${placement.category}`);

// Women / Men / Kids first; unisex pieces are shelved in both Women and Men.
assert.deepEqual(where({ category: "TSHIRTS", subcategory: "BASIC_TSHIRT", audience: "UNISEX" }), ["Women > Clothing > T-shirts & vests", "Men > Clothing > T-shirts"]);
assert.deepEqual(where({ category: "JACKETS", subcategory: "HOODIES", audience: "MEN" }), ["Men > Clothing > Hoodies & sweatshirts"]);
assert.deepEqual(where({ category: "LADY_TOPS", subcategory: "FANCY_TOPS", audience: "WOMEN" }), ["Women > Clothing > Tops"]);

// Misfiled pieces still reach the shelf a shopper would look on.
assert.deepEqual(where({ category: "OTHERS", subcategory: "OTHER", audience: "UNISEX", title: "Hooded Sweatshirt" }), ["Women > Clothing > Hoodies & sweatshirts", "Men > Clothing > Hoodies & sweatshirts"]);
assert.deepEqual(where({ category: "LADY_TOPS", subcategory: "OTHER", audience: "WOMEN", title: "Blazer" }), ["Women > Clothing > Jackets"]);
assert.deepEqual(where({ category: "TSHIRTS", subcategory: "POLO_SHIRTS", audience: "UNISEX" }), ["Women > Clothing > Shirts", "Men > Clothing > Polo shirts"]);

// Bags, shoes and accessories sit inside a department too, by audience.
assert.deepEqual(where({ category: "BAG", subcategory: "HANDBAG", audience: "WOMEN" }), ["Women > Bags > Handbags"]);
assert.deepEqual(where({ category: "BAG", subcategory: "CLUTCH_BAG", audience: "KIDS" }), ["Kids > Bags > Clutch bags"]);
assert.deepEqual(where({ category: "BAG", subcategory: "OTHER", audience: "UNISEX" }), ["Women > Bags > Other bags", "Men > Bags > Other bags"]);
assert.deepEqual(where({ category: "SHOES", shoeType: "High heels", audience: "WOMEN", isShoe: true }), ["Women > Shoes > Heels"]);
// Men carry no heels shelf, so a men's heel falls to Other shoes.
assert.deepEqual(where({ category: "SHOES", shoeType: "High heels", audience: "MEN", isShoe: true }), ["Men > Shoes > Other shoes"]);
assert.deepEqual(where({ category: "SHOES", subcategory: "KIDS_SHOES", audience: "KIDS", title: "Kids' Sandals", isShoe: true }), ["Kids > Shoes > Sandals & slides"]);
// "Kids' Sandals" filed as a women's shoe still goes to Kids.
assert.deepEqual(where({ category: "SHOES", subcategory: "LADIES_SHOES", audience: "WOMEN", title: "Kids' Sandals", isShoe: true }), ["Kids > Shoes > Sandals & slides"]);
assert.deepEqual(where({ category: "OTHERS", subcategory: "HATS_CAPS", audience: "UNISEX" }), ["Women > Accessories > Hats", "Men > Accessories > Hats"]);
assert.deepEqual(where({ category: "TEXTILE", subcategory: "CURTAINS" }), ["Women > Home > Curtains", "Men > Home > Curtains"]);
assert.deepEqual(where({ category: "KIDS", subcategory: "NEWBORN", audience: "KIDS" }), ["Kids > Clothing > Baby"]);

// Every label the classifier can return is on its shelf's menu.
for (const category of ["TSHIRTS", "SHIRTS", "LADY_TOPS", "JACKETS", "PANTS", "SHORT", "DRESSES", "TWO_PIECE", "OTHER", "OTHERS", "KIDS", "BAG", "TEXTILE", "SHOES"]) {
  for (const audience of ["WOMEN", "MEN", "UNISEX", "KIDS", null]) {
    for (const placement of classifyProduct({ category, subcategory: "OTHER", audience, shoeType: "High heels" })) {
      assert.ok(departmentCategories[placement.department][placement.group].includes(placement.category), `${placement.department}/${placement.group} lacks ${placement.category}`);
    }
  }
}

// The menu lists stocked departments, groups and categories only, in menu order.
const stock = [
  classifyProduct({ category: "TSHIRTS", subcategory: "BASIC_TSHIRT", audience: "UNISEX" }),
  classifyProduct({ category: "JACKETS", subcategory: "HOODIES", audience: "WOMEN" }),
  classifyProduct({ category: "BAG", subcategory: "HANDBAG", audience: "WOMEN" }),
];
const menu = stockedMenu(stock);
assert.deepEqual(menu.map((entry) => [entry.department, entry.total]), [["Women", 3], ["Men", 1]]);
assert.deepEqual(menu[0]!.groups.map((entry) => [entry.group, entry.total]), [["Bags", 1], ["Clothing", 2]]);
assert.deepEqual(menu[0]!.groups[1]!.categories, [{ category: "T-shirts & vests", count: 1 }, { category: "Hoodies & sweatshirts", count: 1 }]);
assert.deepEqual(stockedGroups(stock), [{ group: "Bags", total: 1 }, { group: "Clothing", total: 2 }]);

// "All" at any level matches everything below it.
assert.ok(onChosenShelf(stock[2], "All", "Bags"));
assert.ok(onChosenShelf(stock[2], "Women", "Bags", "Handbags"));
assert.ok(!onChosenShelf(stock[2], "Men"));
assert.ok(onChosenShelf(stock[0], "Men", "Clothing", "T-shirts"));

assert.equal(browseHref({ department: "Women", group: "Clothing", shopCategory: "Hoodies & sweatshirts" }), "/?category=Women&group=Clothing&type=Hoodies+%26+sweatshirts");
assert.equal(browseHref({ department: "All", group: "Bags" }), "/?group=Bags");
assert.equal(browseHref({ department: "All" }), "/?view=all");
assert.equal(browseHref({ department: "All" }, "SELLER1"), "/?view=all&ref=SELLER1");

// Browse splits clothing into Tops / Bottoms / Jackets… and gives each category a cover photo.
const racks = [
  { code: "A", image: "a.png", placements: classifyProduct({ category: "TSHIRTS", subcategory: "BASIC_TSHIRT", audience: "WOMEN" }) },
  { code: "B", image: "b.png", placements: classifyProduct({ category: "TSHIRTS", subcategory: "BASIC_TSHIRT", audience: "WOMEN" }) },
  { code: "C", image: "c.png", placements: classifyProduct({ category: "PANTS", subcategory: "MEN_JEANS", audience: "UNISEX" }) },
  { code: "D", image: "d.png", placements: classifyProduct({ category: "JACKETS", subcategory: "DENIM_JACKETS", audience: "WOMEN" }) },
  { code: "E", image: "e.png", placements: classifyProduct({ category: "BAG", subcategory: "HANDBAG", audience: "WOMEN" }) },
  { code: "F", image: "f.png", placements: classifyProduct({ category: "TWO_PIECE", subcategory: "LONG_TWO_PIECE", audience: "WOMEN" }) },
];
const women = browseSections(racks, "Women");
assert.deepEqual(women.map((entry) => [entry.section, entry.total, entry.group]),
  [["Tops", 2, undefined], ["Bottoms", 1, undefined], ["Jackets & coats", 1, undefined], ["Sets & more", 1, undefined], ["Bags", 1, "Bags"]]);
assert.deepEqual(women[0]!.categories, [{ group: "Clothing", category: "T-shirts & vests", count: 2, image: "a.png" }]);
assert.deepEqual(browseSections(racks, "Men").map((entry) => entry.section), ["Bottoms"]);
assert.deepEqual(browseSections(racks, "Kids"), []);

console.log("Shop taxonomy tests passed");
