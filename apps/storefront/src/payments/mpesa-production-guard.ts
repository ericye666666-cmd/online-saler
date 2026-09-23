// The 1 KSh whitelist test mode is gone: every environment charges the real
// amount. It existed to trial the Till with a few staff phones, but left in the
// deploy form a single dropdown choice closed the shop to every real customer,
// which is what happened on 2026-09-19.
//
// "The real amount" is the order total on a pay-in-full order, and the deposit
// or the balance on a deposit order. The guard checks what the leg is supposed
// to charge, so a deposit can never be mistaken for a discounted full payment.

export type MpesaChargeDecision = {
  amountKsh: number;
  expectedAmountKsh: number;
};

export class MpesaProductionGuardError extends Error {}

type ResolveChargeInput = {
  /** What this payment leg should collect, already computed from the plan. */
  expectedAmountKsh: number;
};

type VerifyAmountInput = {
  paymentAmountKsh: number;
  expectedAmountKsh: number;
};

export function resolveMpesaCharge(input: ResolveChargeInput): MpesaChargeDecision {
  if (!Number.isInteger(input.expectedAmountKsh) || input.expectedAmountKsh <= 0) {
    throw new MpesaProductionGuardError("M-Pesa amount must be a positive whole KSh value.");
  }
  return { amountKsh: input.expectedAmountKsh, expectedAmountKsh: input.expectedAmountKsh };
}

export function mpesaPaymentAmountMatchesOrder(input: VerifyAmountInput): boolean {
  return input.paymentAmountKsh === input.expectedAmountKsh;
}
