import { BadRequestException } from "@nestjs/common";

/**
 * What a rider is paid for one delivery. The owner's rule (2026-09-25): the
 * store picks KSh 50 or KSh 100 when it hands the parcel over, and nothing else
 * is accepted. The rider earns it only when the delivery is completed with the
 * customer's code; the weekly M-Pesa settlement sums those per rider.
 */
export const RIDER_FEE_OPTIONS_KSH = [50, 100] as const;
export type RiderFeeKsh = (typeof RIDER_FEE_OPTIONS_KSH)[number];

/** A missing fee and a wrong one are both refused: there is no default. */
export function requireRiderFee(value: unknown): RiderFeeKsh {
  if (value === undefined || value === null || value === "") {
    throw new BadRequestException("Choose this order's rider pay: KSh 50 or KSh 100.");
  }
  const parsed = typeof value === "number" ? value
    : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim())
      : Number.NaN;
  if (!RIDER_FEE_OPTIONS_KSH.includes(parsed as RiderFeeKsh)) {
    throw new BadRequestException("Rider pay must be KSh 50 or KSh 100.");
  }
  return parsed as RiderFeeKsh;
}

/** The words the order timeline shows next to a hand-off. */
export function riderFeeNote(fee: number) {
  return `骑手费 KSh ${fee}`;
}
