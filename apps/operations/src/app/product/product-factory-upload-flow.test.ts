import assert from "node:assert/strict";
import {
  firstProductMissingFront,
  imageUploadIssue,
  uploadedFrontCount
} from "./product-factory-upload-flow";

assert.equal(imageUploadIssue({ type: "image/jpeg", size: 1024 }), null);
assert.match(imageUploadIssue({ type: "image/heic", size: 1024 }) ?? "", /HEIC/);
assert.match(imageUploadIssue({ type: "image/jpeg", size: 11 * 1024 * 1024 }) ?? "", /10 MB/);
assert.equal(firstProductMissingFront([{ images: [{ type: "FRONT" }] }, { images: [] }]), 1);
assert.equal(uploadedFrontCount([{ images: [{ type: "FRONT" }] }, { images: [{ type: "BACK" }] }]), 1);
