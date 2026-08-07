import assert from "node:assert/strict";
import test from "node:test";
import { requiresAiMainImageConfirmation } from "./product-review-main-image";

test("blocks an automatically selected AI display main image until a human confirms it", () => {
  assert.equal(requiresAiMainImageConfirmation({ variant: "AI_DISPLAY_MAIN", confirmedAt: null }), true);
  assert.equal(requiresAiMainImageConfirmation({ variant: "AI_DISPLAY_MAIN", confirmedAt: new Date() }), false);
});

test("does not add a confirmation gate to non-generated main images", () => {
  assert.equal(requiresAiMainImageConfirmation({ variant: "OPTIMIZED_MAIN", confirmedAt: null }), false);
  assert.equal(requiresAiMainImageConfirmation(null), false);
});
