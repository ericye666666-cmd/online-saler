// The 1 KSh whitelist test mode is gone: every environment charges the order
// total. It existed to trial the Till with a few staff phones, but left in the
// deploy form a single dropdown choice closed the shop to every real customer,
// which is what happened on 2026-09-19.

export type MpesaChargeDecision = {
  amountKsh: number;
  orderAmountKsh: number;
};

export class MpesaProductionGuardError extends Error {}

type ResolveChargeInput = {
  orderAmountKsh: number;
};

type VerifyAmountInput = {
  paymentAmountKsh: number;
  orderAmountKsh: number;
};

export function resolveMpesaCharge(input: ResolveChargeInput): MpesaChargeDecision {
  if (!Number.isInteger(input.orderAmountKsh) || input.orderAmountKsh <= 0) {
    throw new MpesaProductionGuardError("M-Pesa amount must be a positive whole KSh value.");
  }
  return { amountKsh: input.orderAmountKsh, orderAmountKsh: input.orderAmountKsh };
}

export function mpesaPaymentAmountMatchesOrder(input: VerifyAmountInput): boolean {
  return input.paymentAmountKsh === input.orderAmountKsh;
}
