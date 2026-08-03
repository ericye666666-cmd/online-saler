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
  const runner = new ProductDetailGenerationRunnerService({} as never, {} as never);
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
