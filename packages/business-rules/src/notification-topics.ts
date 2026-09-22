/**
 * Outbound notification topics. Every topic is written to the notification
 * outbox exactly once per (topic, subject) pair, so a retried job or a repeated
 * status transition cannot message the same person twice.
 */

export const NOTIFICATION_TOPICS = [
  "CUSTOMER_PAYMENT_SUCCESS",
  "CUSTOMER_ORDER_READY_FOR_PICKUP",
  "CUSTOMER_ORDER_DISPATCHED",
  "CUSTOMER_ORDER_COMPLETED",
  "CUSTOMER_REFUND_RECORDED",
  "AFFILIATE_FIRST_SALE",
  "AFFILIATE_NEW_ORDER",
  "AFFILIATE_COMMISSION_AVAILABLE",
  "AFFILIATE_COMMISSION_PAID",
  "NODE_PACKAGE_IN_TRANSIT",
  "NODE_PACKAGE_AWAITING_DISPATCH",
  "WAREHOUSE_NEW_PAID_ORDER",
  "ADMIN_PAYMENT_EXCEPTION",
  "ADMIN_FULFILLMENT_EXCEPTION"
] as const;

export type NotificationTopicName = (typeof NOTIFICATION_TOPICS)[number];

export const MAX_NOTIFICATION_ATTEMPTS = 5;

/** Exponential backoff in minutes, indexed by the attempt already made. */
export function notificationRetryDelayMinutes(attempts: number): number {
  const schedule = [1, 5, 15, 60, 240];
  return schedule[Math.min(Math.max(attempts, 0), schedule.length - 1)];
}

export function nextNotificationAttemptAt(attempts: number, now = new Date()): Date {
  return new Date(now.getTime() + notificationRetryDelayMinutes(attempts) * 60 * 1000);
}

export function notificationDedupeKey(topic: NotificationTopicName, subjectId: string): string {
  return `${topic}:${subjectId}`;
}

/** Trims a message to a single SMS-safe body without cutting mid-word. */
export function clampNotificationBody(body: string, limit = 320): string {
  const clean = body.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** The number every customer-facing message points at for help. */
export const SUPPORT_PHONE_LABEL = "0717 834 529";
