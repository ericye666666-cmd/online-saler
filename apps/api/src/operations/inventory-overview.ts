import { InventoryItemStatus, ProductStatus } from "@online-saler/database";
import { WAREHOUSE_OCCUPYING_STATUSES } from "./warehouse-capacity";

export type InventoryOverviewRecord = {
  status: InventoryItemStatus;
  locationId: string | null;
  product: {
    category: string | null;
    subcategory: string | null;
    gender: string | null;
    finalSizeLabel: string | null;
    conditionGrade: string | null;
    status: ProductStatus;
  };
};

export function buildInventoryOverview(records: readonly InventoryOverviewRecord[]) {
  const current = records.filter((item) =>
    Boolean(item.locationId) && WAREHOUSE_OCCUPYING_STATUSES.includes(item.status)
  );
  const categoryRows = groupedCategoryRows(current);
  return {
    metrics: {
      currentWarehouseTotal: current.length,
      available: current.filter((item) => item.status === InventoryItemStatus.AVAILABLE).length,
      reserved: current.filter((item) => item.status === InventoryItemStatus.RESERVED).length,
      paidAwaitingOutbound: current.filter((item) => item.status === InventoryItemStatus.PAID).length,
      published: current.filter((item) => item.product.status === ProductStatus.PUBLISHED).length,
      pendingPublish: current.filter((item) => item.product.status !== ProductStatus.PUBLISHED).length,
      sold: records.filter((item) => new Set<InventoryItemStatus>([
        InventoryItemStatus.PAID,
        InventoryItemStatus.PICKED,
        InventoryItemStatus.PACKED,
        InventoryItemStatus.DELIVERED
      ]).has(item.status)).length
    },
    categories: categoryRows,
    distributions: {
      gender: distribution(current.map((item) => item.product.gender)),
      size: distribution(current.map((item) => item.product.finalSizeLabel)),
      condition: distribution(current.map((item) => item.product.conditionGrade))
    }
  };
}

function groupedCategoryRows(records: readonly InventoryOverviewRecord[]) {
  const groups = new Map<string, {
    category: string;
    subcategory: string;
    currentWarehouseCount: number;
    availableCount: number;
    reservedCount: number;
    publishedCount: number;
    pendingPublishCount: number;
  }>();
  for (const item of records) {
    const category = item.product.category?.trim() || "Unclassified";
    const subcategory = item.product.subcategory?.trim() || "Unclassified";
    const key = `${category}\u0000${subcategory}`;
    const row = groups.get(key) ?? {
      category,
      subcategory,
      currentWarehouseCount: 0,
      availableCount: 0,
      reservedCount: 0,
      publishedCount: 0,
      pendingPublishCount: 0
    };
    row.currentWarehouseCount += 1;
    if (item.status === InventoryItemStatus.AVAILABLE) row.availableCount += 1;
    if (item.status === InventoryItemStatus.RESERVED) row.reservedCount += 1;
    if (item.product.status === ProductStatus.PUBLISHED) row.publishedCount += 1;
    else row.pendingPublishCount += 1;
    groups.set(key, row);
  }
  const total = records.length;
  return [...groups.values()]
    .map((row) => ({
      ...row,
      sharePercent: total > 0 ? Math.round((row.currentWarehouseCount / total) * 1000) / 10 : 0
    }))
    .sort((left, right) => right.currentWarehouseCount - left.currentWarehouseCount || left.category.localeCompare(right.category));
}

function distribution(values: readonly (string | null)[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = value?.trim() || "Unclassified";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}
