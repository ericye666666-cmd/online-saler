import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runWithConcurrency } from "./product-batch-processing-concurrency";

describe("batch product processing concurrency", () => {
  it("processes every item while respecting the configured concurrency limit", async () => {
    let active = 0;
    let maximumActive = 0;
    const completed: number[] = [];

    await runWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      completed.push(item);
      active -= 1;
    });

    assert.equal(maximumActive, 2);
    assert.deepEqual([...completed].sort((left, right) => left - right), [1, 2, 3, 4, 5]);
  });
});
