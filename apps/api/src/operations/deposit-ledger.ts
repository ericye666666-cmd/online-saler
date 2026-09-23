import { lapsedDepositRefundKsh } from "@online-saler/business-rules";

/**
 * What the deposit plan is worth, in money.
 *
 * Two numbers that behave nothing alike and must never be added together:
 *
 * - **Deposit held** is cash in the M-Pesa account against sales that have not
 *   happened. It is not revenue. Most of it turns into a completed sale, some
 *   of it turns into a refund, and until the balance lands nobody knows which.
 * - **Forfeit** is revenue, earned the moment a hold lapses: the shop kept the
 *   piece off sale for a week and this is what it was paid for that.
 *
 * Both are computed from the payments and refund requests actually recorded,
 * not from the policy rate, so a part-collected deposit or a refund finance
 * adjusted by hand reports what really happened rather than what should have.
 */

export type LapsedDepositOrder = {
  totalKsh: number;
  payments: ReadonlyArray<{ amountKsh: number }>;
  refundRequests: ReadonlyArray<{ amountKsh: number; status: string; completedAt: Date | null }>;
};

export type DepositLedger = {
  lapsedOrders: number;
  /** Deposit money the shop keeps on holds that ran out. This is income. */
  forfeitKsh: number;
  /** Raised and not yet executed in M-Pesa. This is a debt. */
  refundOwedKsh: number;
  /** Already paid back to shoppers. */
  refundPaidKsh: number;
};

/** A request someone cancelled or rejected is not a debt. */
function liveRequests(order: LapsedDepositOrder) {
  return order.refundRequests.filter((request) => request.status !== "CANCELLED" && request.status !== "REJECTED");
}

export function summariseLapsedDeposits(orders: readonly LapsedDepositOrder[]): DepositLedger {
  const ledger: DepositLedger = { lapsedOrders: orders.length, forfeitKsh: 0, refundOwedKsh: 0, refundPaidKsh: 0 };

  for (const order of orders) {
    const collectedKsh = order.payments.reduce((sum, payment) => sum + payment.amountKsh, 0);
    const live = liveRequests(order);
    // No request at all means the sweep raised none, which happens only when no
    // deposit was ever collected. Fall back to the policy figure so a missing
    // row cannot silently book a whole deposit as income.
    //
    // A request that exists but was cancelled or rejected is the opposite case:
    // finance looked at it and decided nothing is owed, so the shop really does
    // keep all of it. Folding those two together would quietly overrule them.
    const refundRaisedKsh = order.refundRequests.length
      ? live.reduce((sum, request) => sum + request.amountKsh, 0)
      : Math.min(lapsedDepositRefundKsh(order.totalKsh), collectedKsh);

    ledger.forfeitKsh += Math.max(0, collectedKsh - refundRaisedKsh);
    for (const request of live) {
      if (request.completedAt) ledger.refundPaidKsh += request.amountKsh;
      else ledger.refundOwedKsh += request.amountKsh;
    }
  }

  return ledger;
}

export type HeldDepositOrder = {
  balanceKsh: number;
  payments: ReadonlyArray<{ amountKsh: number }>;
};

export type HeldDepositSummary = {
  heldOrders: number;
  /** Collected, unearned. Never counted as revenue. */
  depositHeldKsh: number;
  /** Still to be collected before any of these sales complete. */
  balanceOutstandingKsh: number;
};

export function summariseHeldDeposits(orders: readonly HeldDepositOrder[]): HeldDepositSummary {
  return {
    heldOrders: orders.length,
    depositHeldKsh: orders.reduce(
      (sum, order) => sum + order.payments.reduce((paid, payment) => paid + payment.amountKsh, 0),
      0
    ),
    balanceOutstandingKsh: orders.reduce((sum, order) => sum + order.balanceKsh, 0)
  };
}
