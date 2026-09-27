import { InventoryItemStatus, ProductStatus } from "@online-saler/database";
import { canReserveStorageLocation } from "./product-storage-reservation";

/**
 * Restoring undoes an archive. A garment archived by mistake (a reviewer's reject, or a whole batch
 * cancelled while the clothes were still in the warehouse) goes back to the step it was on, so it
 * can finish digitalization and be sold. Nothing is skipped: every later step still runs its own
 * checks.
 *
 * Items from a cancelled batch come back together, because every batch step (barcodes, storage,
 * stock-in) works on the whole batch at once.
 */

/** Where a garment goes back to, given the status it had just before it was archived. */
export function restoreTargetStatus(previous: ProductStatus | null): ProductStatus | null {
  if (!previous) return null;
  // The AI job was abandoned when the item was archived; send it back so the job runs again.
  if (previous === ProductStatus.AI_PROCESSING) return ProductStatus.PHOTOGRAPHED;
  // An item that was already live is not an intake to finish: that is a publishing decision.
  if (previous === ProductStatus.PUBLISHED || previous === ProductStatus.UNPUBLISHED) return null;
  if (previous === ProductStatus.ARCHIVED) return null;
  return previous;
}

/** Inventory an archived garment may still hold: the reservation or stock-in the archive left behind. */
const RESTORABLE_INVENTORY_STATUSES: ReadonlySet<InventoryItemStatus> = new Set([
  InventoryItemStatus.PENDING_STOCK_IN,
  InventoryItemStatus.AVAILABLE
]);

export type RestorationCandidate = {
  id: string;
  productCode: string;
  status: ProductStatus;
  barcode: string | null;
  /** Status recorded in the archive audit entry; null when no entry was found. */
  previousStatus: ProductStatus | null;
  inventoryItem: {
    id: string;
    status: InventoryItemStatus;
    locationId: string | null;
  } | null;
  /** The shelf the archive took the garment off, if any. */
  previousShelf: { id: string; locationCode: string } | null;
};

export type ShelfSpace = {
  id: string;
  locationCode: string;
  capacity: number;
  currentItemCount: number;
  active: boolean;
};

export type RestorationPlan = {
  restore: Array<{ id: string; productCode: string; fromStatus: ProductStatus; toStatus: ProductStatus }>;
  /** Garments that go straight back onto the shelf they came off. */
  shelfReturns: Array<{
    inventoryItemId: string;
    productId: string;
    productCode: string;
    locationId: string;
    locationCode: string;
    /** True when staff must physically put the garment back on that shelf. */
    physicallyShelved: boolean;
  }>;
  /** Garments that need a shelf chosen later (the old one is full or gone). The batch steps ask for it. */
  needsShelf: Array<{ productId: string; productCode: string }>;
};

export class ProductRestorationError extends Error {}

export function planProductRestoration(
  candidates: readonly RestorationCandidate[],
  shelves: readonly ShelfSpace[]
): RestorationPlan {
  if (candidates.length === 0) {
    throw new ProductRestorationError("There is nothing to restore.");
  }
  const plan: RestorationPlan = { restore: [], shelfReturns: [], needsShelf: [] };
  const remaining = new Map(shelves.map((shelf) => [
    shelf.id,
    shelf.active ? Math.max(0, shelf.capacity - shelf.currentItemCount) : 0
  ]));
  const shelfById = new Map(shelves.map((shelf) => [shelf.id, shelf]));

  for (const candidate of candidates) {
    if (candidate.status !== ProductStatus.ARCHIVED) {
      throw new ProductRestorationError(`${candidate.productCode} is not archived.`);
    }
    const toStatus = restoreTargetStatus(candidate.previousStatus);
    if (!toStatus) {
      throw new ProductRestorationError(
        candidate.previousStatus
          ? `${candidate.productCode} was ${candidate.previousStatus} before it was archived and cannot be restored here.`
          : `${candidate.productCode} has no record of the step it was on, so it cannot be restored.`
      );
    }
    const item = candidate.inventoryItem;
    // Anything else means a customer order touched the garment; restoring must never go near that.
    if (item && !RESTORABLE_INVENTORY_STATUSES.has(item.status)) {
      throw new ProductRestorationError(
        `${candidate.productCode} has inventory in status ${item.status}; it cannot be restored.`
      );
    }
    plan.restore.push({ id: candidate.id, productCode: candidate.productCode, fromStatus: candidate.status, toStatus });

    if (!item || item.locationId || !canReserveStorageLocation(toStatus, candidate.barcode)) continue;
    const shelf = candidate.previousShelf ? shelfById.get(candidate.previousShelf.id) : undefined;
    const space = shelf ? remaining.get(shelf.id) ?? 0 : 0;
    if (shelf && space > 0) {
      remaining.set(shelf.id, space - 1);
      plan.shelfReturns.push({
        inventoryItemId: item.id,
        productId: candidate.id,
        productCode: candidate.productCode,
        locationId: shelf.id,
        locationCode: shelf.locationCode,
        physicallyShelved: item.status === InventoryItemStatus.AVAILABLE
      });
    } else {
      plan.needsShelf.push({ productId: candidate.id, productCode: candidate.productCode });
    }
  }
  return plan;
}
