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


it("shoe display reads exact original bytes and never sends the pair through garment processing", async () => {
  const imageFind = prisma.productImage.findFirst;
  const assetFind = prisma.productImageVariantAsset.findFirst;
  let displayInput: Record<string, unknown> | undefined;
  try {
    prisma.productImage.findFirst = (async ({ where }: { where: { id: string; type: string } }) =>
      where.id === "pair" && where.type === "FRONT" ? { id: "pair", originalUrl: "gs://test/pair.jpg" } : null) as never;
    prisma.productImageVariantAsset.findFirst = (async () => { throw new Error("Shoe original must not load a cutout"); }) as never;
    const runner = new ProductImageJobRunnerService({
      bucket: "test", download: async () => ({ body: Buffer.from("both-shoes-original"), contentType: "image/jpeg" })
    } as never, { removeBackground: async () => { throw new Error("No garment background processor"); } } as never,
    {} as never, { balance: async () => { throw new Error("No garment balancing"); } } as never,
    { generate: async (input: Record<string, unknown>) => { displayInput = input; return { body: Buffer.from("pair-display") }; } } as never);
    const privateRunner = runner as unknown as {
      loadSource: (job: Record<string, unknown>, category: string) => Promise<any>;
      process: (operation: string, source: any, mode: undefined, category: string) => Promise<any>;
    };
    const source = await privateRunner.loadSource({ id: "job", productId: "shoe", sourceImageId: "pair", operation: "GENERATE_AI_DISPLAY_MAIN_IMAGE" }, "SHOES");
    await privateRunner.process("GENERATE_AI_DISPLAY_MAIN_IMAGE", source, undefined, "SHOES");
    assert.equal((displayInput?.body as Buffer).toString(), "both-shoes-original");
    assert.equal(displayInput?.category, "SHOES");
  } finally {
    prisma.productImage.findFirst = imageFind;
    prisma.productImageVariantAsset.findFirst = assetFind;
  }
});
