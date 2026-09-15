export const DEFAULT_PRODUCT_BATCH_SIZE = 10;

export function isAllowedProductBatchSize(targetCount: number): boolean {
  return Number.isSafeInteger(targetCount) && targetCount > 0;
}
