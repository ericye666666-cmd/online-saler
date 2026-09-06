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

  assert.equal(templateUpserts, 25);
  assert.equal(assetUpdates, 0);
});

for (const productType of [
  { category: "SHOES", subcategory: "MEN_SPORT_SHOES", finalSource: "HUMAN_ENTERED" },
  { category: "KIDS", subcategory: "KIDS_SHOES", finalSource: "AI_ACCEPTED" }
]) {
  test(`shoe details preserve both original shoes and replace garment assets for ${productType.subcategory}`, async () => {
    const originals = {
      transaction: prisma.$transaction,
      profile: prisma.productDetailProfile.findUnique,
      product: prisma.product.findUnique,
      selection: prisma.productMainImageSelection.findUnique,
      variant: prisma.productImageVariantAsset.findFirst,
      templateUpdate: prisma.productDetailTemplate.updateMany,
      templateUpsert: prisma.productDetailTemplate.upsert,
      assetUpdate: prisma.productDetailAsset.updateMany,
      assetFind: prisma.productDetailAsset.findUnique,
      assetUpsert: prisma.productDetailAsset.upsert
    };
    const images = ["FRONT", "BACK", "LABEL", "DETAIL"].map((type) => ({
      id: type.toLowerCase(), type, originalUrl: `gs://products/${type.toLowerCase()}.jpg`, publicUrl: null
    }));
    const assetWrites: Array<Record<string, any>> = [];
    const updates: Array<Record<string, any>> = [];
    let card: Record<string, any> | undefined;
    prisma.productDetailProfile.findUnique = (async () => ({
      id: "profile-shoe", productId: "shoe-1", status: "GENERATING", sourceDataVersion: 3,
      finalOutputJson: { title: "Used shoes" },
      product: {
        ...productType, title: "Used shoes", detailSourceVersion: 3,
        sleeveType: "LONG", tagSize: "42", shoeSizeSystem: "EU", shoePairConfirmed: true,
        images, defects: [], measurements: [
          { measurementType: "CHEST_WIDTH", finalValueCm: 50, finalSource: "HUMAN_ENTERED" },
          { measurementType: "INSOLE_LENGTH", finalValueCm: 27, finalSource: productType.finalSource }
        ]
      }
    })) as never;
    prisma.product.findUnique = (async () => ({ detailSourceVersion: 3 })) as never;
    // Ignore a stale garment-derived main image, which may contain only one shoe.
    prisma.productMainImageSelection.findUnique = (async () => ({
      variant: "OPTIMIZED_MAIN", selectedImageId: "stale-one-shoe"
    })) as never;
    prisma.productImageVariantAsset.findFirst = (async () => { throw new Error("Shoes must not reuse garment cutouts"); }) as never;
    prisma.productDetailTemplate.updateMany = (async () => ({ count: 0 })) as never;
    prisma.productDetailTemplate.upsert = (async ({ create }: { create: unknown }) => create) as never;
    prisma.productDetailAsset.updateMany = (async (input: Record<string, any>) => {
      updates.push(input);
      return { count: 1 };
    }) as never;
    prisma.productDetailAsset.findUnique = (async () => ({ id: "old-garment-card" })) as never;
    prisma.productDetailAsset.upsert = (async (input: Record<string, any>) => {
      assetWrites.push(input);
      return input.create;
    }) as never;
    prisma.$transaction = (async (queries: Promise<unknown>[]) => Promise.all(queries)) as never;
    const service = new ProductDetailAssetService({
      measurementCard: async () => { throw new Error("Shoes must not render a garment diagram"); },
      informationCard: async (input: Record<string, any>) => { card = input; return Buffer.from("shoe-size-card"); }
    } as never, {
      bucket: "products", derivedObjectName: () => "shoe-size.webp", upload: async () => undefined
    } as never, {
      removeBackground: async () => { throw new Error("Shoes must not use single-object cutouts"); }
    } as never, {} as never);
    try {
      await service.generateForProfile("profile-shoe");
      assert.equal(card?.eyebrow, "Shoe size");
      assert.deepEqual(card?.rows.slice(0, 3), [
        { label: "Original size label", value: "42" },
        { label: "Confirmed size", value: "EU 42" },
        { label: "Pair checked", value: "Matching pair confirmed" }
      ]);
      assert.equal(card?.rows.some((row: { label: string }) => row.label === "Removable insole length"),
        productType.finalSource === "HUMAN_ENTERED");
      assert.doesNotMatch(JSON.stringify(card), /CHEST_WIDTH|Sleeve|Flat garment/);
      assert.equal(assetWrites.find((entry) => entry.create.type === "FRONT_MAIN")?.create.storageUrl, "gs://products/front.jpg");
      assert.equal(assetWrites.find((entry) => entry.create.type === "BACK_MAIN")?.create.storageUrl, "gs://products/back.jpg");
      const sizeCard = assetWrites.find((entry) => entry.create.type === "MEASUREMENT_GUIDE");
      assert.equal(sizeCard?.create.templateCode, "shoe-size-v1");
      assert.equal(sizeCard?.update.templateVersion, "shoe-size-v1");
      assert.equal(sizeCard?.update.outdatedReason, null);
      assert.ok(updates.some((entry) => entry.data.outdatedReason === "MEASUREMENT_TEMPLATE_CHANGED" &&
        entry.where.OR.some((condition: Record<string, any>) => condition.templateCode?.not === "shoe-size-v1")));
    } finally {
      prisma.$transaction = originals.transaction;
      prisma.productDetailProfile.findUnique = originals.profile;
      prisma.product.findUnique = originals.product;
      prisma.productMainImageSelection.findUnique = originals.selection;
      prisma.productImageVariantAsset.findFirst = originals.variant;
      prisma.productDetailTemplate.updateMany = originals.templateUpdate;
      prisma.productDetailTemplate.upsert = originals.templateUpsert;
      prisma.productDetailAsset.updateMany = originals.assetUpdate;
      prisma.productDetailAsset.findUnique = originals.assetFind;
      prisma.productDetailAsset.upsert = originals.assetUpsert;
    }
  });
}
