import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BackgroundRemovalProviderError } from "./background-removal.provider";
import { resolveBackgroundRemovalMode } from "./selected-background-removal.provider";

describe("Background removal provider selection", () => {
  it("defaults to the free lightweight provider", () => {
    assert.equal(
      resolveBackgroundRemovalMode(undefined, { lightweight: true, removeBg: true }),
      "lightweight"
    );
  });

  it("uses remove.bg only when explicitly selected or as an auto fallback", () => {
    assert.equal(
      resolveBackgroundRemovalMode("remove_bg", { lightweight: true, removeBg: true }),
      "remove_bg"
    );
    assert.equal(
      resolveBackgroundRemovalMode("auto", { lightweight: false, removeBg: true }),
      "remove_bg"
    );
  });

  it("rejects unsupported provider modes", () => {
    assert.throws(
      () => resolveBackgroundRemovalMode("unknown", { lightweight: true, removeBg: true }),
      (error) =>
        error instanceof BackgroundRemovalProviderError &&
        error.code === "PROCESSOR_NOT_CONFIGURED"
    );
  });
});
