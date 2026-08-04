import assert from "node:assert/strict";
import { test } from "node:test";
import { ProductStatus } from "@online-saler/database";
import { canGenerateOrReuseBarcode, canReserveStorageLocation } from "./product-storage-reservation";

test("reserves a shelf only after formal barcode assignment", () => {
  assert.equal(canReserveStorageLocation(ProductStatus.CALIBRATED, null), false);
  assert.equal(canReserveStorageLocation(ProductStatus.BARCODE_ASSIGNED, "92621600007"), true);
  assert.equal(canReserveStorageLocation(ProductStatus.REVIEW_PENDING, "92621600007"), true);
  assert.equal(canReserveStorageLocation(ProductStatus.READY_FOR_STORAGE, "92621600007"), true);
});

test("allows a partially completed batch to reuse an existing formal barcode", () => {
  assert.equal(canGenerateOrReuseBarcode(ProductStatus.CALIBRATED, null), true);
  assert.equal(canGenerateOrReuseBarcode(ProductStatus.BARCODE_ASSIGNED, "92621600007"), true);
  assert.equal(canGenerateOrReuseBarcode(ProductStatus.BARCODE_ASSIGNED, null), false);
  assert.equal(canGenerateOrReuseBarcode(ProductStatus.REVIEW_PENDING, "92621600007"), false);
});
