export const RESERVATION_MINUTES = 15;
export const MAX_ACTIVE_RESERVATIONS_PER_PHONE = 5;
export const KIKUYU_DELIVERY_FEE_KSH = 50;
export const AFFILIATE_ATTRIBUTION_DAYS = 7;
export const COMMISSION_CONFIRMATION_HOURS = 24;
export const RETURN_REQUEST_WINDOW_HOURS = 24;
export const SIGNIFICANT_MEASUREMENT_ERROR_CM = 3;

export function createReservationExpiry(now = new Date()): Date {
  return new Date(now.getTime() + RESERVATION_MINUTES * 60 * 1000);
}

export function isReservationExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function getDeliveryFeeKsh(method: "PICKUP" | "KIKUYU_LOCAL_DELIVERY"): number {
  return method === "PICKUP" ? 0 : KIKUYU_DELIVERY_FEE_KSH;
}

export function createAttributionExpiry(clickedAt = new Date()): Date {
  return new Date(clickedAt.getTime() + AFFILIATE_ATTRIBUTION_DAYS * 24 * 60 * 60 * 1000);
}

export function createCommissionEligibleAt(deliveredAt: Date): Date {
  return new Date(deliveredAt.getTime() + COMMISSION_CONFIRMATION_HOURS * 60 * 60 * 1000);
}

export * from "./transaction-domain";
export * from "./garment-fit-engine";
export * from "./product-measurement-requirements";
