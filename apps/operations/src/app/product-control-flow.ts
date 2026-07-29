import { stringValue, type JsonRecord } from "./operations-workspace-flow";

export function productControlImageUrl(product: JsonRecord, apiProxyUrl: string): string {
  const images = Array.isArray(product.images) ? product.images : [];
  const first = images[0] && typeof images[0] === "object" ? (images[0] as JsonRecord) : null;
  const publicUrl = stringValue(first?.publicUrl);
  return publicUrl ? `${apiProxyUrl}${publicUrl}` : "";
}

export function productControlInventoryItem(product: JsonRecord): JsonRecord | null {
  const item = product.inventoryItem;
  return item && typeof item === "object" && !Array.isArray(item) ? (item as JsonRecord) : null;
}

export function productControlLocationCode(product: JsonRecord): string {
  const item = productControlInventoryItem(product);
  const location = item?.location;
  return location && typeof location === "object" && !Array.isArray(location)
    ? stringValue((location as JsonRecord).locationCode)
    : "";
}

export function canPrintProductLabel(product: JsonRecord): boolean {
  return Boolean(stringValue(product.barcode));
}

export function canAssignProductLocation(product: JsonRecord): boolean {
  return ["READY_FOR_STORAGE", "PUBLISHED"].includes(stringValue(product.status));
}

export function canConfirmProductPlaced(product: JsonRecord): boolean {
  const item = productControlInventoryItem(product);
  return canAssignProductLocation(product) && Boolean(item?.id && item.locationId && item.status !== "AVAILABLE");
}

export function canPublishProduct(product: JsonRecord): boolean {
  const item = productControlInventoryItem(product);
  const images = Array.isArray(product.images) ? product.images : [];
  const price = typeof product.priceKsh === "number" ? product.priceKsh : 0;
  return (
    ["READY_FOR_STORAGE", "UNPUBLISHED"].includes(stringValue(product.status)) &&
    Boolean(stringValue(product.barcode)) &&
    price > 0 &&
    images.length > 0 &&
    item?.status === "AVAILABLE"
  );
}

export function canUnpublishProduct(product: JsonRecord): boolean {
  return stringValue(product.status) === "PUBLISHED";
}
