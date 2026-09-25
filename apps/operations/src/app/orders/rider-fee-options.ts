/**
 * This order's rider pay, chosen at the moment a delivery parcel is handed to a
 * rider. The owner's rule (2026-09-25): KSh 50 or KSh 100, nothing else, and no
 * default. The API refuses anything else; this only drives the buttons.
 */
export const RIDER_FEE_OPTIONS_KSH = [50, 100] as const;
export type RiderFeeKsh = (typeof RIDER_FEE_OPTIONS_KSH)[number];

/** A stored form field ("50" / "100" / "") read back as a fee, or null. */
export function riderFeeFromField(value: string | undefined | null): RiderFeeKsh | null {
  if (!value) return null;
  const parsed = Number(value);
  return (RIDER_FEE_OPTIONS_KSH as readonly number[]).includes(parsed) ? (parsed as RiderFeeKsh) : null;
}
