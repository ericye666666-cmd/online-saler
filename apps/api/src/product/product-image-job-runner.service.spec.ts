import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  ProductImageVariant,
  prisma
} from "@online-saler/database";
import type { BackgroundRemovalResult } from "./background-removal.provider";
import { ProductImageJobRunnerService } from "./product-image-job-runner.service";

const originalTransaction = prisma.$transaction;

afterEach(() => {
  (prisma as unknown as { $transaction: typeof prisma.$transaction }).$transaction = originalTransaction;
});

describe("ProductImageJobRunnerService", () => {
  it("creates a new derived asset for every rerun of the same image variant", async () => {
    const uploadedObjectNames: string[] = [];
    const createdAssetIds: string[] = [];
    const completedOutputIds: string[] = [];
    const storage = {
      bucket: "test-product-images",
      derivedObjectName: (_productId: string, assetId: string, variant: string) =>
        `products/${assetId}/${variant}.png`,
      upload: async (objectName: string) => {
        uploadedObjectNames.push(objectName);
      }
    };
    const transactionClient = {
      productImageVariantAsset: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdAssetIds.push(String(data.id));
          return data;
        }
      },
      productImageProcessingJob: {
        update: async ({ data }: { data: Record<string, unknown> }) => {
          completedOutputIds.push(String(data.outputImageId));
          return data;
        }
      }
    };
    (prisma as unknown as { $transaction: (callback: (tx: typeof transactionClient) => unknown) => unknown }).$transaction =
      async (callback) => callback(transactionClient);

    const runner = new ProductImageJobRunnerService(
      storage as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
    const saveResult = (
      runner as unknown as {
        saveResult: (
          job: {
            id: string;
            productId: string;
            sourceImageId: string;
            targetVariant: ProductImageVariant;
          },
          result: BackgroundRemovalResult
        ) => Promise<{ id: string }>;
      }
    ).saveResult.bind(runner);
    const result: BackgroundRemovalResult = {
      body: Buffer.from("transparent-png"),
      contentType: "image/png",
      provider: "rembg-birefnet",
      processorVersion: "test-v1",
      qualityScore: 0.91,
      qualityIssues: []
    };
    const baseJob = {
      productId: "product-1",
      sourceImageId: "original-1",
      targetVariant: ProductImageVariant.CUTOUT_TRANSPARENT
    };

    const first = await saveResult({ ...baseJob, id: "job-1" }, result);
    const second = await saveResult({ ...baseJob, id: "job-2" }, result);

    assert.notEqual(first.id, second.id);
    assert.deepEqual(createdAssetIds, [first.id, second.id]);
    assert.deepEqual(completedOutputIds, [first.id, second.id]);
    assert.equal(new Set(uploadedObjectNames).size, 2);
  });
});
