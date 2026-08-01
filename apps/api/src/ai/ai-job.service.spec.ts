import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ProductStatus, prisma } from "@online-saler/database";
import { AIJobService } from "./ai-job.service";

const originals = {
  productFindUnique: prisma.product.findUnique,
  productUpdate: prisma.product.update,
  productUpdateMany: prisma.product.updateMany,
  extractionCreate: prisma.aIExtraction.create,
  extractionUpdate: prisma.aIExtraction.update,
  transaction: prisma.$transaction
};

afterEach(() => {
  prisma.product.findUnique = originals.productFindUnique;
  prisma.product.update = originals.productUpdate;
  prisma.product.updateMany = originals.productUpdateMany;
  prisma.aIExtraction.create = originals.extractionCreate;
  prisma.aIExtraction.update = originals.extractionUpdate;
  prisma.$transaction = originals.transaction;
});

describe("AIJobService", () => {
  it("restores the prior product state when the provider fails", async () => {
    let recovery: Record<string, unknown> | undefined;

    prisma.product.findUnique = (async () => ({
      id: "product-1",
      status: ProductStatus.CALIBRATION_PENDING
    })) as never;
    prisma.aIExtraction.create = (async () => ({ id: "extraction-1" })) as never;
    prisma.product.update = (async ({ data }: { data: unknown }) => data) as never;
    prisma.aIExtraction.update = (async ({ data }: { data: unknown }) => data) as never;
    prisma.product.updateMany = (async (input: Record<string, unknown>) => {
      recovery = input;
      return { count: 1 };
    }) as never;
    prisma.$transaction = (async (operations: Promise<unknown>[]) => Promise.all(operations)) as never;

    const service = new AIJobService({
      extract: async () => { throw new Error("provider failed"); }
    });

    await assert.rejects(
      service.submit({ productId: "product-1", imageIds: ["image-1"], promptVersion: "test-v1" }),
      /provider failed/
    );
    assert.deepEqual(recovery, {
      where: { id: "product-1", status: ProductStatus.AI_PROCESSING },
      data: { status: ProductStatus.CALIBRATION_PENDING }
    });
  });
});
