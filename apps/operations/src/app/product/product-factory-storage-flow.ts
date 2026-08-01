export type StorageScanProduct = {
  barcode?: string | null;
  status?: string | null;
  inventoryItem?: { status?: string | null } | null;
};

export function normalizeStorageScan(value: string): string {
  return value.trim().toUpperCase();
}

export function storageScanIssue(
  barcodeValue: string,
  locationValue: string,
  products: StorageScanProduct[]
): string | null {
  const barcode = normalizeStorageScan(barcodeValue);
  const locationCode = normalizeStorageScan(locationValue);
  if (!barcode) return "请扫描商品 Barcode。";
  const product = products.find((item) => normalizeStorageScan(item.barcode ?? "") === barcode);
  if (!product) return "该 Barcode 不属于当前批次。";
  if (product.inventoryItem?.status === "AVAILABLE") return "该商品已经完成入仓，请勿重复扫描。";
  if (product.status !== "READY_FOR_STORAGE") return "该商品尚未完成审核和入仓准备。";
  if (!locationCode) return "请扫描货位码。";
  return null;
}
