import assert from "node:assert/strict";
import {
  assignBatchFrontFiles,
  completedCaptureCount,
  firstProductMissingCapture,
  missingCaptureImageTypes,
  frontImage,
  firstProductMissingFront,
  imageUploadIssue,
  rotateProductImage,
  shouldAdvanceWithoutUploading,
  uploadedFrontCount
} from "./product-factory-upload-flow";

assert.equal(imageUploadIssue({ type: "image/jpeg", size: 1024 }), null);
const shoeImages = ["FRONT", "BACK", "DETAIL", "LABEL"].map((type) => ({ type }));
assert.deepEqual(missingCaptureImageTypes({ category: "SHOES", images: [{ type: "FRONT" }] }), ["BACK", "DETAIL", "LABEL"]);
assert.deepEqual(missingCaptureImageTypes({ category: "KIDS", subcategory: "KIDS_SHOES", images: shoeImages }), []);
assert.equal(completedCaptureCount([
  { category: "SHOES", images: shoeImages },
  { category: "SHOES", images: shoeImages.filter((image) => image.type !== "LABEL") },
  { category: "TSHIRTS", images: [{ type: "FRONT" }] }
]), 2);
assert.equal(firstProductMissingCapture([
  { category: "SHOES", images: shoeImages },
  { category: "SHOES", images: [{ type: "FRONT" }] }
]), 1);
assert.match(imageUploadIssue({ type: "image/heic", size: 1024 }) ?? "", /HEIC/);
assert.match(imageUploadIssue({ type: "image/jpeg", size: 11 * 1024 * 1024 }) ?? "", /10 MB/);
assert.equal(rotateProductImage(0, "RIGHT"), 90);
assert.equal(rotateProductImage(90, "LEFT"), 0);
assert.equal(rotateProductImage(270, "RIGHT"), 0);
assert.equal(rotateProductImage(0, "LEFT"), 270);
assert.equal(firstProductMissingFront([{ images: [{ type: "FRONT" }] }, { images: [] }]), 1);
assert.equal(uploadedFrontCount([{ images: [{ type: "FRONT" }] }, { images: [{ type: "BACK" }] }]), 1);
assert.deepEqual(
  frontImage([
    { id: "label-latest", type: "LABEL" },
    { id: "front-main", type: "FRONT" }
  ]),
  { id: "front-main", type: "FRONT" }
);
assert.equal(frontImage([{ id: "detail-only", type: "DETAIL" }]), null);
assert.deepEqual(
  assignBatchFrontFiles(
    [
      { id: "01", images: [{ type: "FRONT" }] },
      { id: "02", images: [] },
      { id: "03", images: [{ type: "BACK" }] }
    ],
    ["second.jpg", "third.jpg"]
  ),
  [
    { productId: "02", file: "second.jpg" },
    { productId: "03", file: "third.jpg" }
  ]
);
assert.equal(shouldAdvanceWithoutUploading({
  currentIndex: 0,
  productCount: 10,
  selectedImageCount: 0,
  pendingBatchFrontCount: 10
}), false);
assert.equal(shouldAdvanceWithoutUploading({
  currentIndex: 0,
  productCount: 10,
  selectedImageCount: 0,
  pendingBatchFrontCount: 0
}), true);
