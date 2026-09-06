import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ProductStatus, prisma } from "@online-saler/database";
import { AIJobService } from "./ai-job.service";
import { MockAIProvider } from "./mock-ai.provider";
import type { AIExtractionRequest } from "@online-saler/shared-types";

const originals = {
  productFindUnique: prisma.product.findUnique,
  imagesFindMany: prisma.productImage.findMany,
  productUpdate: prisma.product.update,
  productUpdateMany: prisma.product.updateMany,
  extractionCreate: prisma.aIExtraction.create,
  extractionUpdate: prisma.aIExtraction.update,
  fieldDecisionCreate: prisma.aIFieldDecision.create,
  transaction: prisma.$transaction
};

afterEach(() => {
  prisma.product.findUnique = originals.productFindUnique;
  prisma.productImage.findMany = originals.imagesFindMany;
  prisma.product.update = originals.productUpdate;
  prisma.product.updateMany = originals.productUpdateMany;
  prisma.aIExtraction.create = originals.extractionCreate;
  prisma.aIExtraction.update = originals.extractionUpdate;
  prisma.aIFieldDecision.create = originals.fieldDecisionCreate;
  prisma.$transaction = originals.transaction;
});

describe("AIJobService", () => {
  it("restores the prior product state when the provider fails", async () => {
    let recovery: Record<string, unknown> | undefined;
    let categoryHint: string | null | undefined;

    prisma.product.findUnique = (async () => ({
      id: "product-1",
      status: ProductStatus.CALIBRATION_PENDING,
      category: "SHOES"
    })) as never;
    prisma.productImage.findMany = (async () => ["FRONT", "BACK", "DETAIL", "LABEL"].map((type) => ({ id: type, type }))) as never;
    prisma.aIExtraction.create = (async () => ({ id: "extraction-1" })) as never;
    prisma.product.update = (async ({ data }: { data: unknown }) => data) as never;
    prisma.aIExtraction.update = (async ({ data }: { data: unknown }) => data) as never;
    prisma.product.updateMany = (async (input: Record<string, unknown>) => {
      recovery = input;
      return { count: 1 };
    }) as never;
    prisma.$transaction = (async (operations: Promise<unknown>[]) => Promise.all(operations)) as never;

    const service = new AIJobService({
      extract: async (request) => { categoryHint = request.categoryHint; throw new Error("provider failed"); }
    });

    await assert.rejects(
      service.submit({ productId: "product-1", imageIds: ["FRONT", "BACK", "DETAIL", "LABEL"], promptVersion: "test-v1", categoryHint: "TSHIRTS" }),
      /provider failed/
    );
    assert.equal(categoryHint, "SHOES");
    assert.deepEqual(recovery, {
      where: { id: "product-1", status: ProductStatus.AI_PROCESSING },
      data: { status: ProductStatus.CALIBRATION_PENDING }
    });
  });
});


it("rejects direct shoe AI requests missing required views or reusing an outdated size label before invoking a provider", async () => {
  prisma.product.findUnique = (async () => ({ id: "shoe", category: "KIDS", subcategory: "KIDS_SHOES", status: ProductStatus.PHOTOGRAPHED })) as never;
  prisma.productImage.findMany = (async () => [
    { id: "label-new", type: "LABEL" }, { id: "pair", type: "FRONT" },
    { id: "side", type: "BACK" }, { id: "soles", type: "DETAIL" }, { id: "label-old", type: "LABEL" }
  ]) as never;
  let calls = 0;
  const service = new AIJobService({ extract: async () => { calls += 1; throw new Error("Must not invoke provider"); } });
  await assert.rejects(service.submit({ productId: "shoe", imageIds: ["pair"], promptVersion: "test" }), /missing: BACK, DETAIL, LABEL/);
  await assert.rejects(service.submit({ productId: "shoe", imageIds: ["pair", "side", "soles", "label-old"], promptVersion: "test" }), /missing: LABEL/);
  await assert.rejects(service.submit({ productId: "shoe", imageIds: ["pair", "side", "soles", "label-new", "another-products-image"], promptVersion: "test" }), /only this product's original images/);
  assert.equal(calls, 0);
});


it("sends only latest shoe views and stores the same canonical IDs when historical retakes are submitted", async () => {
  prisma.product.findUnique = (async () => ({ id: "shoe", category: "SHOES", status: ProductStatus.PHOTOGRAPHED })) as never;
  prisma.productImage.findMany = (async () => [
    { id: "defect-new", type: "DEFECT" }, { id: "label-new", type: "LABEL" },
    { id: "pair-new", type: "FRONT" }, { id: "side", type: "BACK" }, { id: "soles", type: "DETAIL" },
    { id: "label-old", type: "LABEL" }, { id: "pair-old", type: "FRONT" }, { id: "defect-old", type: "DEFECT" }
  ]) as never;
  let persistedRequest: AIExtractionRequest | undefined;
  let persistedImageIds: string[] | undefined;
  let providerRequest: AIExtractionRequest | undefined;
  prisma.aIExtraction.create = (async ({ data }: { data: { requestJson: AIExtractionRequest; inputImageIds: string[] } }) => {
    persistedRequest = data.requestJson;
    persistedImageIds = data.inputImageIds;
    return { id: "extraction-1" };
  }) as never;
  prisma.product.update = (async ({ data }: { data: unknown }) => data) as never;
  prisma.aIExtraction.update = (async ({ data }: { data: unknown }) => data) as never;
  prisma.aIFieldDecision.create = (async ({ data }: { data: unknown }) => data) as never;
  prisma.$transaction = (async (operations: Promise<unknown>[]) => Promise.all(operations)) as never;
  const service = new AIJobService({ extract: async (request) => {
    providerRequest = request;
    return new MockAIProvider().extract(request);
  } });
  service.get = (async () => ({ extractionId: "extraction-1", status: "SUCCEEDED" })) as never;
  const requestedIds = ["pair-old", "label-old", "defect-old", "pair-new", "side", "soles", "label-new", "pair-new"];
  const result = await service.submit({ productId: "shoe", imageIds: requestedIds, promptVersion: "test" });
  const expected = ["pair-new", "side", "soles", "label-new", "defect-new"];
  assert.equal(result.status, "SUCCEEDED");
  assert.deepEqual(providerRequest?.imageIds, expected);
  assert.deepEqual(persistedRequest?.imageIds, expected);
  assert.deepEqual(persistedImageIds, expected);
  assert.ok(requestedIds.includes("label-old")); // Do not mutate the caller's audit input.
});
