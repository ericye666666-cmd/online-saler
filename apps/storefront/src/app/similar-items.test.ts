import assert from "node:assert/strict";
import type { Placement } from "./shop-taxonomy";
import { similarItemsHref } from "./similar-items";

const kidsSandals: Placement = { department: "Kids", group: "Shoes", category: "Sandals & slides" };
const kidsTrainers: Placement = { department: "Kids", group: "Shoes", category: "Trainers" };
const menJeans: Placement = { department: "Men", group: "Clothing", category: "Jeans" };
const menShorts: Placement = { department: "Men", group: "Clothing", category: "Shorts" };

const item = (code: string, placement: Placement, size: string, status = "Available") => ({ code, placements: [placement], size, status });

const soldSandals = item("S1", kidsSandals, "UK 39", "Sold");
const soldJeans = item("J1", menJeans, "Waist 32", "Sold");

// Same shelf and size in stock: the list opens on that shelf with the size filter set.
assert.equal(
  similarItemsHref(soldSandals, [soldSandals, item("S2", kidsSandals, "UK 39"), item("S3", kidsSandals, "UK 35")]),
  "/?category=Kids&group=Shoes&type=Sandals+%26+slides&size=UK+39"
);

// Nothing else in that size on the shelf: the shelf without the size.
assert.equal(
  similarItemsHref(soldSandals, [soldSandals, item("S3", kidsSandals, "UK 35")]),
  "/?category=Kids&group=Shoes&type=Sandals+%26+slides"
);

// A sold or reserved piece in the same size does not count as "still for sale".
assert.equal(
  similarItemsHref(soldSandals, [soldSandals, item("S4", kidsSandals, "UK 39", "Reserved"), item("T1", kidsTrainers, "UK 39")]),
  "/?category=Kids&group=Shoes"
);

// Men's jeans: same shelf and waist when there is one, else the shelf.
assert.equal(
  similarItemsHref(soldJeans, [item("J2", menJeans, "Waist 32"), item("J3", menJeans, "Waist 34")]),
  "/?category=Men&group=Clothing&type=Jeans&size=Waist+32"
);
assert.equal(
  similarItemsHref(soldJeans, [item("J3", menJeans, "Waist 34")]),
  "/?category=Men&group=Clothing&type=Jeans"
);

// Empty shelf and group: the department; nothing in the department: everything.
assert.equal(similarItemsHref(soldJeans, [item("S2", kidsSandals, "UK 39")]), "/?view=all");
assert.equal(similarItemsHref(item("J4", menJeans, "Waist 32", "Sold"), [item("H1", menShorts, "Waist 32")]), "/?category=Men&group=Clothing");

// No confirmed size: the size step is skipped.
assert.equal(
  similarItemsHref(item("J5", menJeans, "Size not confirmed", "Sold"), [item("J6", menJeans, "Size not confirmed")]),
  "/?category=Men&group=Clothing&type=Jeans"
);

// A piece with no shelf goes to the whole catalogue; the recommender's ref is kept.
assert.equal(similarItemsHref({ code: "X", status: "Sold" }, [], "AMINA1"), "/?view=all&ref=AMINA1");
assert.equal(
  similarItemsHref(soldSandals, [item("S2", kidsSandals, "UK 39")], "AMINA1"),
  "/?category=Kids&group=Shoes&type=Sandals+%26+slides&size=UK+39&ref=AMINA1"
);

console.log("similar items ok");
