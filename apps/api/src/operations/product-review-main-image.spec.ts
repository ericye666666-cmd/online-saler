import assert from "node:assert/strict";
import test from "node:test";
import { requiresAiMainImageConfirmation } from "./product-review-main-image";

test("blocks an automatically selected AI display main image until a human confirms it", () => {
  assert.equal(requiresAiMainImageConfirmation({ variant: "AI_DISPLAY_MAIN", confirmedAt: null }), true);
  assert.equal(requiresAiMainImageConfirmation({ variant: "AI_DISPLAY_MAIN", confirmedAt: new Date() }), false);
});

test("requires an AI display image instead of accepting a missing or non-generated selection", () => {
  assert.equal(requiresAiMainImageConfirmation({ variant: "OPTIMIZED_MAIN", confirmedAt: null }), true);
  assert.equal(requiresAiMainImageConfirmation({ variant: "ORIGINAL", confirmedAt: new Date() }), true);
  assert.equal(requiresAiMainImageConfirmation(null), true);
});
