import assert from "node:assert/strict";
import { galleryIndexAtOffset, galleryIndexForKey } from "./product-gallery";

// The highlighted photo follows the nearest slide while a touch scroll settles.
assert.equal(galleryIndexAtOffset(0, 390, 4), 0);
assert.equal(galleryIndexAtOffset(180, 390, 4), 0);
assert.equal(galleryIndexAtOffset(210, 390, 4), 1);
assert.equal(galleryIndexAtOffset(780, 390, 4), 2);
assert.equal(galleryIndexAtOffset(1170, 390, 4), 3);

// Safari overscroll and subpixel offsets must never select a missing photo.
assert.equal(galleryIndexAtOffset(-60, 390, 4), 0);
assert.equal(galleryIndexAtOffset(1250, 390, 4), 3);
assert.equal(galleryIndexAtOffset(779.75, 390, 4), 2);
assert.equal(galleryIndexAtOffset(1, 0, 4), 0);
assert.equal(galleryIndexAtOffset(Number.NaN, 390, 4), 0);
assert.equal(galleryIndexAtOffset(390, 390, 0), 0);
assert.equal(galleryIndexAtOffset(390, 390, 1), 0);

// Arrow navigation stops at the ends; normal page-scrolling keys stay native.
assert.equal(galleryIndexForKey("ArrowLeft", 0, 4), 0);
assert.equal(galleryIndexForKey("ArrowLeft", 2, 4), 1);
assert.equal(galleryIndexForKey("ArrowRight", 2, 4), 3);
assert.equal(galleryIndexForKey("ArrowRight", 3, 4), 3);
assert.equal(galleryIndexForKey("Home", 3, 4), 0);
assert.equal(galleryIndexForKey("End", 0, 4), 3);
assert.equal(galleryIndexForKey("ArrowDown", 1, 4), null);
assert.equal(galleryIndexForKey("PageDown", 1, 4), null);
assert.equal(galleryIndexForKey("Tab", 1, 4), null);
assert.equal(galleryIndexForKey("ArrowRight", 0, 1), null);

console.log("Product gallery scroll and keyboard tests passed");
