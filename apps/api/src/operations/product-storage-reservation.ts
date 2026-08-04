import { ProductStatus } from "@online-saler/database";

const LOCATION_RESERVABLE_STATUSES = new Set<ProductStatus>([
  ProductStatus.BARCODE_ASSIGNED,
  ProductStatus.REVIEW_PENDING,
  ProductStatus.APPROVED,
  ProductStatus.READY_FOR_STORAGE,
  ProductStatus.PUBLISHED
]);

export function canReserveStorageLocation(status: ProductStatus, barcode: string | null): boolean {
  return Boolean(barcode) && LOCATION_RESERVABLE_STATUSES.has(status);
}

export function canGenerateOrReuseBarcode(status: ProductStatus, barcode: string | null): boolean {
  return status === ProductStatus.CALIBRATED ||
    (status === ProductStatus.BARCODE_ASSIGNED && Boolean(barcode));
}
