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


for (const category of ["SHOES", "TSHIRTS", "PANTS"]) {
it(`${category} display reads exact original bytes without background removal or composition`, async () => {
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
    const source = await privateRunner.loadSource({ id: "job", productId: "shoe", sourceImageId: "pair", operation: "GENERATE_AI_DISPLAY_MAIN_IMAGE" }, category);
    await privateRunner.process("GENERATE_AI_DISPLAY_MAIN_IMAGE", source, undefined, category);
    assert.equal((displayInput?.body as Buffer).toString(), "both-shoes-original");
    assert.equal(displayInput?.category, category);
  } finally {
    prisma.productImage.findFirst = imageFind;
    prisma.productImageVariantAsset.findFirst = assetFind;
  }
});

}

it("rejects queued legacy cutout jobs and unconfirmed display jobs before loading image bytes", async () => {
  const saved = {
    claim: prisma.productImageProcessingJob.updateMany,
    find: prisma.productImageProcessingJob.findUnique,
    update: prisma.productImageProcessingJob.update,
    product: prisma.product.findUnique
  };
  let operation = "REMOVE_BACKGROUND";
  let status = "CALIBRATED";
  let downloads = 0;
  const job = () => ({ id: "legacy-job", productId: "p", sourceImageId: "front", operation, targetVariant: "AI_DISPLAY_MAIN", status: "RUNNING", retryCount: 0, createdAt: new Date(), updatedAt: new Date(), qualityIssues: [] });
  try {
    prisma.productImageProcessingJob.updateMany = (async () => ({ count: 1 })) as never;
    prisma.productImageProcessingJob.findUnique = (async () => job()) as never;
    prisma.productImageProcessingJob.update = (async ({ data }: { data: Record<string, unknown> }) => ({ ...job(), ...data })) as never;
    prisma.product.findUnique = (async () => ({ category: "TSHIRTS", status })) as never;
    const runner = new ProductImageJobRunnerService({ download: async () => { downloads++; throw new Error("must not load images"); } } as never, {} as never, {} as never, {} as never, {} as never);
    for (operation of ["REMOVE_BACKGROUND", "COMPOSE_WHITE_BACKGROUND", "OPTIMIZE_MAIN_IMAGE", "OPTIMIZE_BALANCED_MAIN_IMAGE"]) {
      const result = await runner.run("legacy-job");
      assert.equal(result.status, "FAILED");
      assert.match(result.errorMessage ?? "", /Cutout processing is retired/);
    }
    operation = "GENERATE_AI_DISPLAY_MAIN_IMAGE";
    status = "CALIBRATION_PENDING";
    const result = await runner.run("legacy-job");
    assert.equal(result.status, "FAILED");
    assert.match(result.errorMessage ?? "", /Manual product confirmation/);
    assert.equal(downloads, 0);
  } finally {
    prisma.productImageProcessingJob.updateMany = saved.claim;
    prisma.productImageProcessingJob.findUnique = saved.find;
    prisma.productImageProcessingJob.update = saved.update;
    prisma.product.findUnique = saved.product;
  }
});
