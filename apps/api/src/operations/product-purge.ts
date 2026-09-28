import { InventoryItemStatus, ProductStatus } from "@online-saler/database";

/**
 * Purging permanently deletes "Rejected" (archived) products and the batches a cancellation left
 * empty. It is for records that should not exist at all; a garment that should still be sold is
 * restored instead. Anything a customer order has touched is never deleted, so order history stays
 * whole.
 */

/** Inventory an archived garment may still hold without a customer being involved. */
const PURGEABLE_INVENTORY_STATUSES: ReadonlySet<InventoryItemStatus> = new Set([
  InventoryItemStatus.PENDING_STOCK_IN,
  InventoryItemStatus.AVAILABLE
]);

export type PurgeCandidate = {
  id: string;
  productCode: string;
  title: string | null;
  status: ProductStatus;
  batchId: string | null;
  batchCode: string | null;
  orderItemCount: number;
  inventoryStatus: InventoryItemStatus | null;
};

export type PurgePlan = {
  purge: Array<{ id: string; productCode: string; title: string | null; batchCode: string | null }>;
  /** Archived products that stay, with the reason. */
  kept: Array<{ productCode: string; reason: string }>;
};

export function planProductPurge(candidates: readonly PurgeCandidate[]): PurgePlan {
  const plan: PurgePlan = { purge: [], kept: [] };
  for (const candidate of candidates) {
    if (candidate.status !== ProductStatus.ARCHIVED) {
      plan.kept.push({ productCode: candidate.productCode, reason: "Not rejected." });
    } else if (candidate.orderItemCount > 0) {
      plan.kept.push({ productCode: candidate.productCode, reason: "It is on a customer order." });
    } else if (candidate.inventoryStatus && !PURGEABLE_INVENTORY_STATUSES.has(candidate.inventoryStatus)) {
      plan.kept.push({ productCode: candidate.productCode, reason: `Its stock is ${candidate.inventoryStatus}.` });
    } else {
      plan.purge.push({ id: candidate.id, productCode: candidate.productCode, title: candidate.title, batchCode: candidate.batchCode });
    }
  }
  return plan;
}

/** Cancelled batches with nothing left in them once the purge is done. */
export function emptiedCancelledBatchIds(
  cancelledBatches: ReadonlyArray<{ id: string; productIds: readonly string[] }>,
  purgedProductIds: ReadonlySet<string>
): string[] {
  return cancelledBatches
    .filter((batch) => batch.productIds.every((id) => purgedProductIds.has(id)))
    .map((batch) => batch.id);
}
