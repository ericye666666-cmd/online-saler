import { Prisma, ProductStatus } from "@online-saler/database";

/**
 * Permanently deletes products, as if they were never entered. Their stock record, stock
 * movements, photos, measurements and other child rows go with them through the schema's cascades;
 * the image tables that hold a productId without a foreign key are cleaned up here first.
 *
 * Each delete is conditional on the status the caller planned from, so a product that moved in the
 * meantime (e.g. it was just published) is not deleted. Returns how many were deleted; callers roll
 * back when that is not every one.
 */
export async function hardDeleteProducts(
  transaction: Prisma.TransactionClient,
  products: ReadonlyArray<{ id: string; status: ProductStatus }>
): Promise<number> {
  if (products.length === 0) return 0;
  const ids = products.map((product) => product.id);
  await transaction.productImageVariantAsset.deleteMany({ where: { productId: { in: ids } } });
  await transaction.productImageProcessingJob.deleteMany({ where: { productId: { in: ids } } });
  await transaction.productMainImageSelection.deleteMany({ where: { productId: { in: ids } } });
  let deleted = 0;
  for (const product of products) {
    const result = await transaction.product.deleteMany({ where: { id: product.id, status: product.status } });
    deleted += result.count;
  }
  return deleted;
}
