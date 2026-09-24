import {
  InventoryItemStatus,
  WarehouseLocationStatus,
  type Prisma
} from "@online-saler/database";

export const WAREHOUSE_OCCUPYING_STATUSES: InventoryItemStatus[] = [
  InventoryItemStatus.PENDING_STOCK_IN,
  InventoryItemStatus.AVAILABLE,
  InventoryItemStatus.RESERVED,
  // A deposit hold is a garment sitting on a shelf for up to a week. It takes
  // up exactly as much space as any other and has to count against capacity.
  InventoryItemStatus.DEPOSIT_HELD,
  InventoryItemStatus.PAID,
  InventoryItemStatus.RETURNED
];

export const MOVABLE_INVENTORY_STATUSES: InventoryItemStatus[] = [
  InventoryItemStatus.PENDING_STOCK_IN,
  InventoryItemStatus.AVAILABLE,
  InventoryItemStatus.RESERVED,
  InventoryItemStatus.DEPOSIT_HELD,
  InventoryItemStatus.RETURNED
];

export type ShelfCapacitySnapshot = {
  id: string;
  locationCode: string;
  capacity: number;
  currentItemCount: number;
  active: boolean;
  status: WarehouseLocationStatus;
};

export type ShelfAssignment = {
  productId: string;
  locationId: string;
  locationCode: string;
};

export type ShelfMetrics = ShelfCapacitySnapshot & {
  remainingCapacity: number;
  utilizationPercent: number;
  effectiveStatus: WarehouseLocationStatus;
};

export function locationMetrics(location: ShelfCapacitySnapshot): ShelfMetrics {
  const remainingCapacity = Math.max(0, location.capacity - location.currentItemCount);
  const utilizationPercent = location.capacity > 0
    ? Math.min(100, Math.round((location.currentItemCount / location.capacity) * 1000) / 10)
    : 0;
  const effectiveStatus = !location.active || location.status === WarehouseLocationStatus.INACTIVE
    ? WarehouseLocationStatus.INACTIVE
    : remainingCapacity === 0
      ? WarehouseLocationStatus.FULL
      : WarehouseLocationStatus.ACTIVE;
  return { ...location, remainingCapacity, utilizationPercent, effectiveStatus };
}

export function assertValidCapacity(capacity: number, currentItemCount: number): void {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError("Capacity must be a positive integer.");
  }
  if (capacity < currentItemCount) {
    throw new RangeError(`Capacity cannot be lower than the current item count (${currentItemCount}).`);
  }
}

// The warehouse has a handful of large shelves and each intake batch goes onto
// one of them as a whole, chosen by the employee. The system never picks.
export function buildShelfAllocationPlan(
  productIds: readonly string[],
  shelf: ShelfCapacitySnapshot
): ShelfAssignment[] {
  const metrics = locationMetrics(shelf);
  if (metrics.effectiveStatus === WarehouseLocationStatus.INACTIVE) {
    throw new RangeError(`Shelf ${shelf.locationCode} is not in use.`);
  }
  if (metrics.remainingCapacity < productIds.length) {
    throw new RangeError(
      `Shelf ${shelf.locationCode} has room for ${metrics.remainingCapacity} more item(s), not ${productIds.length}. Choose another shelf.`
    );
  }
  return productIds.map((productId) => ({
    productId,
    locationId: shelf.id,
    locationCode: shelf.locationCode
  }));
}

export async function refreshWarehouseLocationStatuses(
  transaction: Prisma.TransactionClient,
  locationIds: readonly string[]
): Promise<void> {
  const uniqueIds = [...new Set(locationIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;
  const [locations, counts] = await Promise.all([
    transaction.warehouseLocation.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, capacity: true, active: true, status: true }
    }),
    transaction.inventoryItem.groupBy({
      by: ["locationId"],
      where: {
        locationId: { in: uniqueIds },
        status: { in: WAREHOUSE_OCCUPYING_STATUSES }
      },
      _count: { _all: true }
    })
  ]);
  const countByLocation = new Map(counts.map((row) => [row.locationId, row._count._all]));
  await Promise.all(locations.map((location) => {
    const currentItemCount = countByLocation.get(location.id) ?? 0;
    const status = !location.active || location.status === WarehouseLocationStatus.INACTIVE
      ? WarehouseLocationStatus.INACTIVE
      : currentItemCount >= location.capacity
        ? WarehouseLocationStatus.FULL
        : WarehouseLocationStatus.ACTIVE;
    return transaction.warehouseLocation.update({
      where: { id: location.id },
      data: { status, active: status !== WarehouseLocationStatus.INACTIVE }
    });
  }));
}
