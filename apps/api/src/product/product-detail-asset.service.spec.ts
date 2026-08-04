import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@online-saler/database";
import { ProductDetailAssetService } from "./product-detail-asset.service";

test("activates the new measurement template catalog without rewriting existing product assets", async () => {
  const originalTransaction = prisma.$transaction;
  const originalTemplateUpdateMany = prisma.productDetailTemplate.updateMany;
  const originalTemplateUpsert = prisma.productDetailTemplate.upsert;
  const originalAssetUpdateMany = prisma.productDetailAsset.updateMany;
  let templateUpserts = 0;
  let assetUpdates = 0;

  prisma.productDetailTemplate.updateMany = (async () => ({ count: 0 })) as never;
  prisma.productDetailTemplate.upsert = (async ({ create }: { create: Record<string, unknown> }) => {
    templateUpserts += 1;
    return create;
  }) as never;
  prisma.productDetailAsset.updateMany = (async () => {
    assetUpdates += 1;
    return { count: 0 };
  }) as never;
  (prisma as unknown as { $transaction: (queries: Promise<unknown>[]) => Promise<unknown[]> }).$transaction =
    async (queries) => Promise.all(queries);

  try {
    const service = new ProductDetailAssetService({} as never, {} as never, {} as never, {} as never);
    await service.onModuleInit();
  } finally {
    (prisma as unknown as { $transaction: typeof prisma.$transaction }).$transaction = originalTransaction;
    prisma.productDetailTemplate.updateMany = originalTemplateUpdateMany;
    prisma.productDetailTemplate.upsert = originalTemplateUpsert;
    prisma.productDetailAsset.updateMany = originalAssetUpdateMany;
  }

  assert.equal(templateUpserts, 24);
  assert.equal(assetUpdates, 0);
});
