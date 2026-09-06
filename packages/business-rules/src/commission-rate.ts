export const DEFAULT_AFFILIATE_COMMISSION_RATE_BPS = 1000;

/** Preserve the existing configured-rate parsing and fallback; never rewrite rates. */
export function resolveDefaultCommissionRate(value: unknown): {
  valueBps: number;
  source: "SYSTEM_SETTING" | "FALLBACK";
} {
  const parsed = typeof value === "number" ? value
    : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return { valueBps: DEFAULT_AFFILIATE_COMMISSION_RATE_BPS, source: "FALLBACK" };
  }
  return { valueBps: Math.max(0, Math.min(5000, Math.round(parsed))), source: "SYSTEM_SETTING" };
}
