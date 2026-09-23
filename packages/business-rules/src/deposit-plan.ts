/**
 * The 50% deposit plan.
 *
 * A shopper who cannot pay for a garment today pays half of it now and the
 * garment is taken off sale for seven days while they find the rest. Every
 * item here is one of one, so a hold is the only way to promise it is still
 * there when they come back — and a hold with no money behind it is how you
 * end up with a rail of unsellable clothes.
 *
 * Two numbers carry the whole policy and both live here so a change is one
 * line: how much locks the item, and what happens to that money when the
 * seven days run out without the balance.
 */

/** Half the order total locks the item. */
export const DEPOSIT_RATE_BPS = 5000;

/** How long a paid deposit keeps the garment off sale. */
export const DEPOSIT_HOLD_DAYS = 7;

/**
 * Days after the deposit when the shopper is reminded the balance is due.
 * Day 4 gives them the weekend; day 6 is the last useful warning.
 */
export const DEPOSIT_REMINDER_DAYS = [4, 6] as const;

/**
 * When the seven days lapse the shopper gets 30% of the order total back and
 * the shop keeps 20% of it — the garment sat unsold for a week and the deposit
 * was what paid for that. Stated against the order total, not against the
 * deposit, because that is the number the shopper sees on the page.
 */
export const DEPOSIT_LAPSE_REFUND_RATE_BPS = 3000;

/**
 * A shopper cannot hold more than this many garments on deposit at once.
 * Seven days is long enough that an unlimited allowance would let one phone
 * empty a rail; the five-item cart reservation cap is a separate, shorter
 * leash and both apply.
 */
export const MAX_DEPOSIT_HOLDS_PER_PHONE = 3;

function bpsOf(amountKsh: number, rateBps: number, round: (value: number) => number): number {
  return round((amountKsh * rateBps) / 10000);
}

function assertPositiveTotal(totalKsh: number) {
  if (!Number.isInteger(totalKsh) || totalKsh <= 0) {
    throw new Error("Order total must be a positive whole KSh value.");
  }
}

/**
 * The deposit rounds up, so on an odd total the shopper's first payment is the
 * larger half. M-Pesa only moves whole shillings and the shop should never be
 * the one holding the rounding loss.
 */
export function depositAmountKsh(totalKsh: number): number {
  assertPositiveTotal(totalKsh);
  return bpsOf(totalKsh, DEPOSIT_RATE_BPS, Math.ceil);
}

/** What is still owed after the deposit. Always at least 1 KSh. */
export function balanceAmountKsh(totalKsh: number): number {
  return totalKsh - depositAmountKsh(totalKsh);
}

/**
 * A one-shilling order cannot be split into two M-Pesa payments, so it is
 * full payment only.
 */
export function orderQualifiesForDeposit(totalKsh: number): boolean {
  return Number.isInteger(totalKsh) && totalKsh >= 2;
}

export function depositBalanceDueAt(depositPaidAt: Date): Date {
  return new Date(depositPaidAt.getTime() + DEPOSIT_HOLD_DAYS * 24 * 60 * 60 * 1000);
}

export function depositReminderDueAt(depositPaidAt: Date, dayIndex: number): Date {
  return new Date(depositPaidAt.getTime() + dayIndex * 24 * 60 * 60 * 1000);
}

export function isDepositHoldExpired(balanceDueAt: Date, now = new Date()): boolean {
  return balanceDueAt.getTime() <= now.getTime();
}

export function depositHoldDaysLeft(balanceDueAt: Date, now = new Date()): number {
  return Math.max(0, Math.ceil((balanceDueAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

/**
 * What a shopper is owed back when their hold lapses, stated against the order
 * total. The shop keeps the rest of the deposit for the week the garment spent
 * off sale.
 */
export function lapsedDepositRefundKsh(totalKsh: number): number {
  assertPositiveTotal(totalKsh);
  return bpsOf(totalKsh, DEPOSIT_LAPSE_REFUND_RATE_BPS, Math.round);
}

export type LapsedDepositSettlement = {
  /** What goes back to the shopper's M-Pesa number. */
  refundKsh: number;
  /** What the shop keeps for holding the garment. */
  forfeitKsh: number;
};

/**
 * Splits a lapsed deposit. The refund is capped at what was actually collected
 * so a part-paid or manually adjusted deposit can never refund more than it
 * took in.
 */
export function lapsedDepositSettlement(totalKsh: number, depositPaidKsh: number): LapsedDepositSettlement {
  assertPositiveTotal(totalKsh);
  if (!Number.isInteger(depositPaidKsh) || depositPaidKsh < 0) {
    throw new Error("Deposit paid must be a non-negative whole KSh value.");
  }
  const refundKsh = Math.min(lapsedDepositRefundKsh(totalKsh), depositPaidKsh);
  return { refundKsh, forfeitKsh: depositPaidKsh - refundKsh };
}
