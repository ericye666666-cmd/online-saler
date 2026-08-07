export type BatchStorageProduct = {
  status?: string | null;
  inventoryItem?: { status?: string | null; locationId?: string | null } | null;
};

export function needsBatchStoragePreparation(
  products: BatchStorageProduct[],
  targetCount: number
): boolean {
  if (products.length !== targetCount || targetCount < 1) return false;
  if (!products.every((product) => product.status === "APPROVED" || product.status === "READY_FOR_STORAGE")) {
    return false;
  }
  return products.some((product) => product.status === "APPROVED" || !product.inventoryItem?.locationId);
}

export function batchStorageCompletionIssue(
  products: BatchStorageProduct[],
  targetCount: number
): string | null {
  if (products.length !== targetCount) return `本批必须包含 ${targetCount} 件商品。`;
  if (products.some((product) => product.status !== "READY_FOR_STORAGE")) {
    return "本批商品尚未全部完成审核和入仓准备。";
  }
  if (products.some((product) => !product.inventoryItem?.locationId)) {
    return "还有商品未分配货架号，请刷新后重试。";
  }
  return null;
}
