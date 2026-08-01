export const PRODUCTION_PRODUCT_BATCH_SIZE = 10;
export const STAGING_PILOT_PRODUCT_BATCH_SIZE = 3;

export function isAllowedProductBatchSize(targetCount: number, pilotEnabled: boolean): boolean {
  if (!Number.isInteger(targetCount)) return false;
  if (targetCount === PRODUCTION_PRODUCT_BATCH_SIZE) return true;
  return pilotEnabled && targetCount === STAGING_PILOT_PRODUCT_BATCH_SIZE;
}

export function stagingPilotBatchEnabled(environment = process.env): boolean {
  return environment.NODE_ENV === "staging" && environment.STAGING_PILOT_BATCH_ENABLED === "true";
}
