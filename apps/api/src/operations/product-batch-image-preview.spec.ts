import assert from "node:assert/strict";
import test from "node:test";
import { buildProductBatchImagePreviews } from "./product-batch-image-preview";

const originals = [
  { id: "label", type: "LABEL", publicUrl: "/label" },
  { id: "front", type: "FRONT", publicUrl: "/front" }
];

const variants = [
  { id: "old-white", variant: "CUTOUT_WHITE", publicUrl: "/old-white" },
  { id: "balanced", variant: "OPTIMIZED_BALANCED_MAIN", publicUrl: "/balanced" },
  { id: "optimized", variant: "OPTIMIZED_MAIN", publicUrl: "/optimized" },
  { id: "white", variant: "CUTOUT_WHITE", publicUrl: "/white" },
  { id: "transparent", variant: "CUTOUT_TRANSPARENT", publicUrl: "/transparent" }
];

test("places the selected storefront image first without duplicating it", () => {
  const previews = buildProductBatchImagePreviews(originals, variants, { selectedImageId: "white" });
  assert.equal(previews[0]?.imageId, "white");
  assert.equal(previews[0]?.selectedAsMain, true);
  assert.equal(previews.filter((preview) => preview.variant === "CUTOUT_WHITE").length, 1);
});

test("uses the newest asset for each variant in the stable preview order", () => {
  const previews = buildProductBatchImagePreviews(originals, variants, null);
  assert.deepEqual(
    previews.map((preview) => preview.imageId),
    ["balanced", "optimized", "old-white", "transparent", "front"]
  );
});

test("never uses a label, back, detail or defect image as the batch thumbnail", () => {
  const previews = buildProductBatchImagePreviews(
    [
      { id: "detail", type: "DETAIL", publicUrl: "/detail" },
      { id: "back", type: "BACK", publicUrl: "/back" },
      { id: "label", type: "LABEL", publicUrl: "/label" }
    ],
    [],
    null
  );
  assert.deepEqual(previews, []);
});

test("falls back to the latest front original when no edited image is available", () => {
  const previews = buildProductBatchImagePreviews(originals, [], null);
  assert.deepEqual(previews, [
    { imageId: "front", variant: "ORIGINAL", publicUrl: "/front", selectedAsMain: false }
  ]);
});
