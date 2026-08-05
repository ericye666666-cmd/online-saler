import {
  InventoryItemStatus,
  WarehouseLocationStatus,
  type Prisma
} from "@online-saler/database";

export const WAREHOUSE_OCCUPYING_STATUSES: InventoryItemStatus[] = [
  InventoryItemStatus.PENDING_STOCK_IN,
  InventoryItemStatus.AVAILABLE,
  InventoryItemStatus.RESERVED,
  InventoryItemStatus.PAID,
  InventoryItemStatus.RETURNED
];

export const MOVABLE_INVENTORY_STATUSES: InventoryItemStatus[] = [
  InventoryItemStatus.PENDING_STOCK_IN,
  InventoryItemStatus.AVAILABLE,
  InventoryItemStatus.RESERVED,
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

export function buildShelfAllocationPlan(
  productIds: readonly string[],
  shelves: readonly ShelfCapacitySnapshot[],
  random: () => number = Math.random
): ShelfAssignment[] {
  const remainingProducts = [...productIds];
  const available = shelves
    .map(locationMetrics)
    .filter((shelf) => shelf.effectiveStatus === WarehouseLocationStatus.ACTIVE && shelf.remainingCapacity > 0);
  const assignments: ShelfAssignment[] = [];

  while (remainingProducts.length > 0 && available.length > 0) {
    const randomValue = Math.max(0, Math.min(0.999999999, random()));
    const selectedIndex = Math.floor(randomValue * available.length);
    const [shelf] = available.splice(selectedIndex, 1);
    const fillCount = Math.min(shelf.remainingCapacity, remainingProducts.length);
    for (let index = 0; index < fillCount; index += 1) {
      assignments.push({
        productId: remainingProducts.shift()!,
        locationId: shelf.id,
        locationCode: shelf.locationCode
      });
    }
  }

  if (remainingProducts.length > 0) {
    throw new RangeError("No shelf location has enough available capacity.");
  }
  return assignments;
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
