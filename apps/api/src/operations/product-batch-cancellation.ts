import { InventoryItemStatus, ProductBatchStatus, ProductStatus } from "@online-saler/database";

/**
 * Cancelling a batch stops an intake that will never be finished. Its unfinished items are treated
 * as if they were never entered: they are deleted, together with their stock record, and any shelf
 * slot they held is freed.
 *
 * An unfinished item that was ever on a customer order is archived instead, so the order history
 * stays whole. Items that already went live (PUBLISHED, or UNPUBLISHED after going live), and items
 * already archived, are left exactly as they are.
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
  /** Order lines that point at this item, from any order in any state. */
  orderItemCount?: number;
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
  /** True when the item is deleted with the batch, so its stock record goes too. */
  deleted: boolean;
};

export type BatchCancellationPlan = {
  /** Unfinished items that are deleted as if never entered. */
  delete: CancellableProduct[];
  /** Unfinished items that were on a customer order: archived, not deleted. */
  archive: CancellableProduct[];
  kept: CancellableProduct[];
  releases: ShelfRelease[];
};

export class BatchCancellationError extends Error {}

export function planBatchCancellation(
  batch: { status: ProductBatchStatus },
  products: readonly CancellableProduct[],
  reason: string | undefined,
  options: { preview?: boolean } = {}
): BatchCancellationPlan {
  if (batch.status === ProductBatchStatus.CANCELLED) {
    throw new BatchCancellationError("This batch is already cancelled.");
  }
  if (batch.status !== ProductBatchStatus.OPEN) {
    throw new BatchCancellationError("Only batches that are still in progress can be cancelled.");
  }
  if (!options.preview && !reason?.trim()) {
    throw new BatchCancellationError("A reason is required to cancel a batch.");
  }

  const unfinished = products.filter((product) => !BATCH_CANCELLATION_KEPT_STATUSES.has(product.status));
  const kept = products.filter((product) => BATCH_CANCELLATION_KEPT_STATUSES.has(product.status));
  const archive = unfinished.filter((product) => (product.orderItemCount ?? 0) > 0);
  const toDelete = unfinished.filter((product) => (product.orderItemCount ?? 0) === 0);

  const releases: ShelfRelease[] = [];
  for (const product of unfinished) {
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
      physicallyShelved: item.status === InventoryItemStatus.AVAILABLE,
      deleted: toDelete.includes(product)
    });
  }

  return { delete: toDelete, archive, kept, releases };
}
