import {
  NotificationAudience,
  NotificationChannel,
  NotificationStatus,
  Prisma
} from "@prisma/client";

/**
 * Transactional outbox for outbound messages. Nothing is sent inline: the state
 * change that earns a message writes a PENDING row in the same transaction, and
 * a separate drain job talks to the SMS provider. A failed send can therefore
 * never roll back an order transition, and a retried transition can never send
 * the same message twice — `dedupeKey` is unique.
 */

export type EnqueueNotificationInput = {
  topic: string;
  audience: NotificationAudience;
  dedupeKey: string;
  recipientPhone: string | null | undefined;
  body: string;
  recipientLabel?: string | null;
  channel?: NotificationChannel;
  orderId?: string | null;
  affiliateId?: string | null;
  fulfillmentNodeId?: string | null;
};

/** Normalizes to the 2547xxxxxxxx / 2541xxxxxxxx form M-Pesa and SMS both use. */
export function normalizeNotificationPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  return null;
}

/**
 * Writes one outbox row. Returns null when there is no reachable phone number
 * or when this exact message was already queued — both are normal, not errors.
 */
export async function enqueueNotification(
  tx: Prisma.TransactionClient,
  input: EnqueueNotificationInput
) {
  const recipientPhone = normalizeNotificationPhone(input.recipientPhone);
  if (!recipientPhone) return null;
  const body = input.body.trim();
  if (!body) return null;

  try {
    return await tx.notification.create({
      data: {
        topic: input.topic,
        audience: input.audience,
        channel: input.channel ?? NotificationChannel.SMS,
        status: NotificationStatus.PENDING,
        dedupeKey: input.dedupeKey,
        recipientPhone,
        recipientLabel: input.recipientLabel ?? null,
        body,
        orderId: input.orderId ?? null,
        affiliateId: input.affiliateId ?? null,
        fulfillmentNodeId: input.fulfillmentNodeId ?? null
      }
    });
  } catch (error) {
    // A duplicate dedupe key means the message is already queued or sent.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }
}

/** Queues the same message for several recipients under one topic. */
export async function enqueueNotifications(
  tx: Prisma.TransactionClient,
  inputs: readonly EnqueueNotificationInput[]
) {
  const created = [];
  for (const input of inputs) {
    const row = await enqueueNotification(tx, input);
    if (row) created.push(row);
  }
  return created;
}
