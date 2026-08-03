import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRODUCT_AI_BATCH_CONCURRENCY,
  PRODUCT_IMAGE_BATCH_CONCURRENCY,
  PRODUCT_UPLOAD_BATCH_CONCURRENCY,
  runWithConcurrency
} from "./product-batch-processing-concurrency";

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

  it("starts all ten product images in one batch while keeping OpenAI separately limited", async () => {
    assert.equal(PRODUCT_UPLOAD_BATCH_CONCURRENCY, 10);
    assert.equal(PRODUCT_IMAGE_BATCH_CONCURRENCY, 10);
    assert.equal(PRODUCT_AI_BATCH_CONCURRENCY, 3);

    let active = 0;
    let maximumActive = 0;
    let releaseBatch: (() => void) | undefined;
    const batchStarted = new Promise<void>((resolve) => { releaseBatch = resolve; });
    let started = 0;

    await runWithConcurrency(Array.from({ length: 10 }, (_, index) => index), PRODUCT_IMAGE_BATCH_CONCURRENCY, async () => {
      active += 1;
      started += 1;
      maximumActive = Math.max(maximumActive, active);
      if (started === 10) releaseBatch?.();
      await batchStarted;
      active -= 1;
    });

    assert.equal(maximumActive, 10);
  });
});
