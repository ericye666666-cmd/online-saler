import { ProductStatus } from "@online-saler/database";

/**
 * A batch keeps its rejected (archived) items: they still count towards the
 * number of garments the batch was opened for, and they can be restored. But
 * they take no further part in it — no barcode, no shelf, no stock-in, no
 * publishing — so the rest of the batch can finish without them.
 */
export function activeBatchProducts<T extends { status: ProductStatus | string }>(products: readonly T[]): T[] {
  return products.filter((product) => product.status !== ProductStatus.ARCHIVED);
}

/**
 * Every garment the batch was opened for is present (rejected ones included)
 * and at least one is still going ahead.
 */
export function batchItemsAccountedFor(
  batch: { targetCount: number },
  products: readonly { status: ProductStatus | string }[]
): boolean {
  return products.length === batch.targetCount && activeBatchProducts(products).length > 0;
}

/**
 * Steps from which one item can be rejected on the white-background review
 * page without touching the rest of its batch. Only before the barcode: after
 * that the item has a label and may hold a shelf place, and the existing
 * review decision handles it.
 */
export const DISPLAY_REVIEW_REJECTABLE_STATUSES: ReadonlySet<ProductStatus> = new Set([ProductStatus.CALIBRATED]);
