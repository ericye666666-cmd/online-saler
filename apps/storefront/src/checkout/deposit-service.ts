import {
  NotificationAudience,
  enqueueNotification,
  depositHoldsDueForLapse,
  lapseDepositHold,
  openDepositHolds,
  prisma
} from "@online-saler/database";
import {
  DEPOSIT_REMINDER_DAYS,
  SUPPORT_PHONE_LABEL,
  depositHoldDaysLeft,
  lapsedDepositRefundKsh,
  notificationBody,
  notificationDedupeKey
} from "@online-saler/business-rules";

/**
 * The seven-day clock on a deposit hold. Two sweeps, both safe to run as often
 * as you like: one nudges shoppers whose balance is coming due, the other takes
 * the garment back when it never arrived.
 *
 * Unlike the five-minute reservation sweep these are not run inline on every
 * page load — nothing a shopper does should depend on a week-old order being
 * expired first. They run from `/api/internal/*` on a schedule.
 */

export type DepositLapseResult = {
  lapsedOrders: number;
  releasedItems: number;
  refundKsh: number;
  forfeitKsh: number;
};

export type DepositReminderResult = {
  remindersQueued: number;
};

/** The deadline as a Kenyan shopper reads it in an SMS. */
function dueDateLabel(dueAt: Date): string {
  return dueAt.toLocaleDateString("en-KE", {
    weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Nairobi"
  });
}

/**
 * Releases every garment whose balance never came, and raises the refund the
 * shopper is owed. The garment goes back on sale in the same transaction that
 * ends the order, so there is no window where it is neither held nor sellable.
 */
export async function expireLapsedDepositHolds(now = new Date()): Promise<DepositLapseResult> {
  const due = await depositHoldsDueForLapse(prisma, now);
  const result: DepositLapseResult = { lapsedOrders: 0, releasedItems: 0, refundKsh: 0, forfeitKsh: 0 };

  for (const order of due) {
    const reason = `Deposit hold on order ${order.orderNumber} lapsed without the balance; item returned to sale.`;
    const lapsed = await prisma.$transaction(async (tx) => {
      // The policy figure. `lapseDepositHold` caps it under the lock at what
      // was actually collected, so a part-paid deposit cannot over-refund.
      const outcome = await lapseDepositHold(tx, {
        orderId: order.id,
        refundKsh: lapsedDepositRefundKsh(order.totalKsh),
        reason,
        now
      });
      if (!outcome.changed) return outcome;
      await enqueueNotification(tx, {
        topic: "CUSTOMER_DEPOSIT_EXPIRED",
        audience: NotificationAudience.CUSTOMER,
        dedupeKey: notificationDedupeKey("CUSTOMER_DEPOSIT_EXPIRED", order.id),
        recipientPhone: order.whatsappPhone || order.customer.phone,
        recipientLabel: order.customer.displayName,
        orderId: order.id,
        body: notificationBody("CUSTOMER_DEPOSIT_EXPIRED", {
          orderNumber: order.orderNumber,
          amountKsh: outcome.refundKsh,
          supportPhone: SUPPORT_PHONE_LABEL
        })
      });
      return outcome;
    });
    if (!lapsed.changed) continue;
    result.lapsedOrders += 1;
    result.releasedItems += lapsed.releasedItems;
    result.refundKsh += lapsed.refundKsh;
    result.forfeitKsh += lapsed.forfeitKsh;
  }

  return result;
}

/**
 * Nudges shoppers whose balance is coming due. Only the latest reminder a hold
 * has reached is queued: a sweep that starts running late should send "last
 * day", not catch up by sending every earlier warning at once.
 */
export async function sendDepositBalanceReminders(now = new Date()): Promise<DepositReminderResult> {
  const holds = await openDepositHolds(prisma, now);
  let remindersQueued = 0;

  for (const hold of holds) {
    const { balanceDueAt, depositPaidAt } = hold;
    if (!balanceDueAt || !depositPaidAt) continue;
    const daysHeld = (now.getTime() - depositPaidAt.getTime()) / (24 * 60 * 60 * 1000);
    const dueDay = [...DEPOSIT_REMINDER_DAYS].reverse().find((day) => daysHeld >= day);
    if (dueDay === undefined) continue;

    const queued = await prisma.$transaction((tx) => enqueueNotification(tx, {
      topic: "CUSTOMER_DEPOSIT_BALANCE_DUE",
      audience: NotificationAudience.CUSTOMER,
      // Keyed per reminder day, so day 6 still goes out after day 4 did.
      dedupeKey: notificationDedupeKey("CUSTOMER_DEPOSIT_BALANCE_DUE", `${hold.id}:d${dueDay}`),
      recipientPhone: hold.whatsappPhone || hold.customer.phone,
      recipientLabel: hold.customer.displayName,
      orderId: hold.id,
      body: notificationBody("CUSTOMER_DEPOSIT_BALANCE_DUE", {
        orderNumber: hold.orderNumber,
        balanceKsh: hold.balanceKsh,
        daysLeft: depositHoldDaysLeft(balanceDueAt, now),
        dueDateLabel: dueDateLabel(balanceDueAt),
        supportPhone: SUPPORT_PHONE_LABEL
      })
    }));
    if (queued) remindersQueued += 1;
  }

  return { remindersQueued };
}
