import { InventoryItemStatus, ProductBatchStatus, ProductStatus } from "@online-saler/database";

/**
 * Cancelling a batch stops an intake that will never be finished. It never deletes anything:
 * unfinished items are archived with the reason, and any shelf slot they were holding is freed.
 *
 * Items that already went live (PUBLISHED, or UNPUBLISHED after going live) are left exactly as
 * they are — they belong to product management now, not to the intake.
 */
export const BATCH_CANCELLATION_KEPT_STATUSES: ReadonlySet<ProductStatus> = new Set([
  ProductStatus.PUBLISHED,
  ProductStatus.UNPUBLISHED,
  ProductStatus.ARCHIVED
]);

/** Inventory an unpublished item can hold: a reserved slot, or an item already put on the shelf. */
const RELEASABLE_INVENTORY_STATUSES: ReadonlySet<InventoryItemStatus> = new Set([
  InventoryItemStatus.PENDING_STOCK_IN,
  InventoryItemStatus.AVAILABLE
]);

export type CancellableProduct = {
  id: string;
  productCode: string;
  status: ProductStatus;
  inventoryItem: {
    id: string;
    status: InventoryItemStatus;
    locationId: string | null;
    location?: { locationCode: string } | null;
  } | null;
};

export type ShelfRelease = {
  inventoryItemId: string;
  productId: string;
  productCode: string;
  locationId: string;
  locationCode: string | null;
  /** True when staff already put the garment on the shelf and must take it back off. */
  physicallyShelved: boolean;
};

export type BatchCancellationPlan = {
  archive: CancellableProduct[];
  kept: CancellableProduct[];
  releases: ShelfRelease[];
};

export class BatchCancellationError extends Error {}

export function planBatchCancellation(
  batch: { status: ProductBatchStatus },
  products: readonly CancellableProduct[],
  reason: string | undefined
): BatchCancellationPlan {
  if (batch.status === ProductBatchStatus.CANCELLED) {
    throw new BatchCancellationError("This batch is already cancelled.");
  }
  if (batch.status !== ProductBatchStatus.OPEN) {
    throw new BatchCancellationError("Only batches that are still in progress can be cancelled.");
  }
  if (!reason?.trim()) {
    throw new BatchCancellationError("A reason is required to cancel a batch.");
  }

  const archive = products.filter((product) => !BATCH_CANCELLATION_KEPT_STATUSES.has(product.status));
  const kept = products.filter((product) => BATCH_CANCELLATION_KEPT_STATUSES.has(product.status));

  const releases: ShelfRelease[] = [];
  for (const product of archive) {
    const item = product.inventoryItem;
    if (!item) continue;
    // An unpublished item can only hold a reservation or sit on the shelf. Anything else means a
    // customer order is involved, and cancelling must never touch that.
    if (!RELEASABLE_INVENTORY_STATUSES.has(item.status)) {
      throw new BatchCancellationError(
        `${product.productCode} has inventory in status ${item.status}; it cannot be cancelled with the batch.`
      );
    }
    if (!item.locationId) continue;
    releases.push({
      inventoryItemId: item.id,
      productId: product.id,
      productCode: product.productCode,
      locationId: item.locationId,
      locationCode: item.location?.locationCode ?? null,
      physicallyShelved: item.status === InventoryItemStatus.AVAILABLE
    });
  }

  return { archive, kept, releases };
}
