export const PRODUCTION_PRODUCT_BATCH_SIZE = 10;
export const STAGING_PILOT_PRODUCT_BATCH_SIZE = 3;

export function productBatchSizeOptions(pilotEnabled: boolean): number[] {
  return pilotEnabled
    ? [STAGING_PILOT_PRODUCT_BATCH_SIZE, PRODUCTION_PRODUCT_BATCH_SIZE]
    : [PRODUCTION_PRODUCT_BATCH_SIZE];
}
