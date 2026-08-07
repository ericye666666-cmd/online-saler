import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@online-saler/database";
import {
  DETAIL_GENERATION_BATCH_CONCURRENCY,
  ProductDetailGenerationRunnerService
} from "./product-detail-generation-runner.service";

test("runs a detail batch with bounded concurrency and keeps result order", async () => {
  const originalFindMany = prisma.productDetailGenerationJob.findMany;
  const jobs = Array.from({ length: 10 }, (_, index) => ({ id: `job-${index + 1}` }));
  prisma.productDetailGenerationJob.findMany = (async () => jobs) as never;

  let active = 0;
  let maximumActive = 0;
  const runner = new ProductDetailGenerationRunnerService({} as never, {} as never, {} as never, {} as never);
  runner.run = (async (jobId: string) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return { job: { id: jobId } } as never;
  }) as never;

  try {
    const result = await runner.runBatch("batch-1");
    assert.equal(result.processed, 10);
    assert.equal(maximumActive, DETAIL_GENERATION_BATCH_CONCURRENCY);
    assert.deepEqual(result.results.map((item) => item.jobId), jobs.map((job) => job.id));
  } finally {
    prisma.productDetailGenerationJob.findMany = originalFindMany;
  }
});

test("generates an AI display image first and selects it without changing the detail source version", async () => {
  const starts: unknown[] = [];
  const selections: unknown[] = [];
  const imageProcessing = {
    getComparison: async () => ({
      cutoutWhite: { imageId: "white-1" },
      aiDisplayMain: null
    }),
    start: async (input: unknown) => {
      starts.push(input);
      return { id: "image-job-1", status: "PENDING" };
    },
    selectMainImage: async (input: unknown, options: unknown) => {
      selections.push({ input, options });
      return {
        aiDisplayMain: { imageId: "ai-1", selectedAsMain: true }
      };
    }
  };
  const imageJobs = {
    run: async () => ({ status: "SUCCEEDED", outputImageId: "ai-1" })
  };
  const runner = new ProductDetailGenerationRunnerService(
    {} as never,
    {} as never,
    imageProcessing as never,
    imageJobs as never
  );

  const selected = await runner.ensureAiDisplayMain("product-1");

  assert.equal(selected.imageId, "ai-1");
  assert.deepEqual(starts, [{
    productId: "product-1",
    sourceImageId: "white-1",
    operation: "GENERATE_AI_DISPLAY_MAIN_IMAGE"
  }]);
  assert.deepEqual(selections, [{
    input: { productId: "product-1", imageId: "ai-1" },
    options: { recordDetailSourceChange: false, humanConfirmed: false }
  }]);
});

test("reuses an existing AI display image and makes it the default main image", async () => {
  let startCalled = false;
  const imageProcessing = {
    getComparison: async () => ({
      cutoutWhite: { imageId: "white-1" },
      aiDisplayMain: { imageId: "ai-existing", selectedAsMain: false }
    }),
    start: async () => {
      startCalled = true;
      throw new Error("must not start a duplicate job");
    },
    selectMainImage: async () => ({
      aiDisplayMain: { imageId: "ai-existing", selectedAsMain: true }
    })
  };
  const runner = new ProductDetailGenerationRunnerService(
    {} as never,
    {} as never,
    imageProcessing as never,
    {} as never
  );

  const selected = await runner.ensureAiDisplayMain("product-1");

  assert.equal(selected.imageId, "ai-existing");
  assert.equal(startCalled, false);
});
