import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findDerivedImageForSource } from "./product-image-comparison";

const assets = [
  { id: "back-white", sourceImageId: "back-transparent", variant: "CUTOUT_WHITE" },
  { id: "front-white", sourceImageId: "front-transparent", variant: "CUTOUT_WHITE" },
  { id: "back-transparent", sourceImageId: "back-original", variant: "CUTOUT_TRANSPARENT" },
  { id: "front-transparent", sourceImageId: "front-original", variant: "CUTOUT_TRANSPARENT" }
] as const;

describe("product image comparison chains", () => {
  it("keeps front and back derivatives separate even when the back asset is newer", () => {
    const frontTransparent = findDerivedImageForSource(
      assets,
      "CUTOUT_TRANSPARENT",
      "front-original",
      null
    );
    const backTransparent = findDerivedImageForSource(
      assets,
      "CUTOUT_TRANSPARENT",
      "back-original",
      null
    );

    assert.equal(frontTransparent?.id, "front-transparent");
    assert.equal(backTransparent?.id, "back-transparent");
    assert.equal(
      findDerivedImageForSource(assets, "CUTOUT_WHITE", frontTransparent?.id ?? null, null)?.id,
      "front-white"
    );
    assert.equal(
      findDerivedImageForSource(assets, "CUTOUT_WHITE", backTransparent?.id ?? null, null)?.id,
      "back-white"
    );
  });
});
