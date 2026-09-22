import { NotificationStatus, prisma } from "@online-saler/database";
import {
  MAX_NOTIFICATION_ATTEMPTS,
  nextNotificationAttemptAt
} from "@online-saler/business-rules";
import { SmsDeliveryError, smsProviderFromEnv, type SmsProvider } from "./sms-provider";

/**
 * Drains the notification outbox. Nothing here decides what to say — the state
 * change that earned a message already wrote the row — so a provider failure
 * only ever delays a message, never an order.
 */

export type DispatchResult = {
  claimed: number;
  sent: number;
  retrying: number;
  failed: number;
};

export async function dispatchPendingNotifications(
  provider: SmsProvider = smsProviderFromEnv(),
  now = new Date(),
  limit = 50
): Promise<DispatchResult> {
  const due = await prisma.notification.findMany({
    where: { status: NotificationStatus.PENDING, nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit
  });

  const result: DispatchResult = { claimed: 0, sent: 0, retrying: 0, failed: 0 };
  for (const notification of due) {
    // Claim the row first. Two overlapping cron runs must not both send it.
    const claimed = await prisma.notification.updateMany({
      where: { id: notification.id, status: NotificationStatus.PENDING, attempts: notification.attempts },
      data: { attempts: { increment: 1 }, nextAttemptAt: nextNotificationAttemptAt(notification.attempts + 1, now) }
    });
    if (claimed.count !== 1) continue;
    result.claimed += 1;

    try {
      const sent = await provider.send({ to: notification.recipientPhone, body: notification.body });
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          provider: sent.provider,
          providerMessageId: sent.providerMessageId,
          lastError: null
        }
      });
      result.sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown send failure.";
      const permanent = error instanceof SmsDeliveryError && !error.retryable;
      const exhausted = notification.attempts + 1 >= MAX_NOTIFICATION_ATTEMPTS;
      if (permanent || exhausted) {
        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: NotificationStatus.FAILED, lastError: message }
        });
        result.failed += 1;
      } else {
        await prisma.notification.update({ where: { id: notification.id }, data: { lastError: message } });
        result.retrying += 1;
      }
    }
  }
  return result;
}
