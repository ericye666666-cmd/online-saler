import {
  CheckoutDraftStatus,
  NotificationAudience,
  OrderStatus,
  PaymentSettlementError,
  PaymentStatus,
  Prisma,
  enqueueNotification,
  lockReservationOrder,
  prisma,
  releaseUnpaidOrderReservation,
  settleSuccessfulPayment
} from "@online-saler/database";
import {
  LAUNCH_AFFILIATE_COMMISSION_RATE_BPS,
  SUPPORT_PHONE_LABEL,
  notificationBody,
  notificationDedupeKey
} from "@online-saler/business-rules";
import { MpesaClient, MpesaProviderError, mpesaConfigFromEnv } from "./mpesa-client";

/**
 * Callbacks get lost. When one does, the shopper has paid, the order is still
 * PENDING, and the reservation sweep quietly releases the garment to someone
 * else — with nothing anywhere saying money went missing. This job asks
 * Safaricom directly what happened to every STK request we are still waiting
 * on, and finishes or fails the payment on the provider's answer.
 */

/** Give the real callback a chance to land before spending a provider call. */
const MIN_AGE_SECONDS = 45;
/** Stop querying eventually; what is left goes to a human. */
const MAX_QUERIES_PER_PAYMENT = 8;

export type ReconciliationResult = {
  checked: number;
  settled: number;
  failed: number;
  stillPending: number;
  escalated: number;
  errors: number;
};

type ReconcilablePayment = {
  id: string;
  orderId: string;
  providerCheckoutRequestId: string;
};

export async function reconcilePendingPayments(
  client = new MpesaClient(mpesaConfigFromEnv()),
  now = new Date()
): Promise<ReconciliationResult> {
  const cutoff = new Date(now.getTime() - MIN_AGE_SECONDS * 1000);
  const candidates = await prisma.payment.findMany({
    where: {
      status: PaymentStatus.PENDING,
      providerCheckoutRequestId: { not: null },
      requestedAt: { lte: cutoff },
      providerQueryCount: { lt: MAX_QUERIES_PER_PAYMENT }
    },
    select: { id: true, orderId: true, providerCheckoutRequestId: true },
    orderBy: { requestedAt: "asc" },
    take: 50
  });

  const result: ReconciliationResult = { checked: 0, settled: 0, failed: 0, stillPending: 0, escalated: 0, errors: 0 };
  for (const candidate of candidates) {
    if (!candidate.providerCheckoutRequestId) continue;
    result.checked += 1;
    try {
      await reconcileOne(client, candidate as ReconcilablePayment, result);
    } catch (error) {
      result.errors += 1;
      // A provider outage must not stop the rest of the batch; the attempt is
      // still recorded so a payment cannot be queried forever.
      console.error("payment_reconciliation_failed", candidate.id, error instanceof Error ? error.message : error);
      await prisma.payment.updateMany({
        where: { id: candidate.id, status: PaymentStatus.PENDING },
        data: {
          providerQueryCount: { increment: 1 },
          providerQueryAt: new Date(),
          providerQueryDescription: error instanceof MpesaProviderError ? error.message : "Provider query failed."
        }
      });
    }
  }
  return result;
}

async function reconcileOne(client: MpesaClient, payment: ReconcilablePayment, result: ReconciliationResult) {
  const status = await client.queryStkPushStatus(payment.providerCheckoutRequestId);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await lockReservationOrder(tx, payment.orderId);
    const current = await tx.payment.findUnique({ where: { id: payment.id } });
    // The genuine callback may have landed while the query was in flight.
    if (!current || current.status !== PaymentStatus.PENDING) {
      result.stillPending += 0;
      return;
    }
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        providerQueryCount: { increment: 1 },
        providerQueryAt: now,
        providerQueryResultCode: status.resultCode,
        providerQueryDescription: status.resultDescription
      }
    });

    if (status.resultCode === null) {
      result.stillPending += 1;
      return;
    }

    if (status.resultCode === 0) {
      // Safaricom says the money moved but we never saw the receipt, so the
      // payment is settled and flagged for a finance check rather than closed
      // silently. The receipt is filled in by the reviewer.
      try {
        await settleSuccessfulPayment(tx, {
          paymentId: payment.id,
          commissionRateBps: LAUNCH_AFFILIATE_COMMISSION_RATE_BPS,
          requireActiveReservation: false,
          now
        });
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.SUCCESS,
            providerResultCode: status.resultCode,
            providerResultDescription: status.resultDescription ?? "Confirmed by M-Pesa status query.",
            completedAt: now
          }
        });
        await queueReconciledCustomerNotice(tx, payment.orderId);
        result.settled += 1;
      } catch (error) {
        if (!(error instanceof PaymentSettlementError)) throw error;
        // Paid, but the garment is gone. A human has to refund it.
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.MANUAL_REVIEW,
            providerResultCode: status.resultCode,
            providerResultDescription: `Paid, but the order could not be completed: ${error.message}`,
            completedAt: now
          }
        });
        await queueAdminPaymentAlert(tx, payment.orderId, error.message);
        result.escalated += 1;
      }
      return;
    }

    // Anything else is a definite failure: cancelled, timed out, no funds.
    const failed = status.resultCode === 1037 || status.resultCode === 1
      ? PaymentStatus.TIMEOUT
      : status.resultCode === 1032 ? PaymentStatus.CANCELLED : PaymentStatus.FAILED;
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: failed,
        providerResultCode: status.resultCode,
        providerResultDescription: status.resultDescription,
        completedAt: now
      }
    });
    await releaseUnpaidOrderReservation(
      tx,
      payment.orderId,
      failed === PaymentStatus.TIMEOUT ? CheckoutDraftStatus.EXPIRED : CheckoutDraftStatus.ABANDONED,
      failed === PaymentStatus.TIMEOUT ? OrderStatus.EXPIRED : OrderStatus.CANCELLED
    );
    result.failed += 1;
  });
}

async function queueReconciledCustomerNotice(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { customer: true, items: { select: { id: true } } }
  });
  if (!order) return;
  await enqueueNotification(tx, {
    topic: "CUSTOMER_PAYMENT_SUCCESS",
    audience: NotificationAudience.CUSTOMER,
    dedupeKey: notificationDedupeKey("CUSTOMER_PAYMENT_SUCCESS", orderId),
    recipientPhone: order.whatsappPhone || order.customer.phone,
    recipientLabel: order.customer.displayName,
    orderId,
    body: notificationBody("CUSTOMER_PAYMENT_SUCCESS", {
      orderNumber: order.orderNumber,
      amountKsh: order.totalKsh,
      itemCount: order.items.length,
      supportPhone: SUPPORT_PHONE_LABEL
    })
  });
}

async function queueAdminPaymentAlert(tx: Prisma.TransactionClient, orderId: string, reason: string) {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
  if (!order) return;
  const phones = (process.env.ADMIN_ALERT_PHONES ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  for (const phone of phones) {
    await enqueueNotification(tx, {
      topic: "ADMIN_PAYMENT_EXCEPTION",
      audience: NotificationAudience.ADMIN,
      dedupeKey: notificationDedupeKey("ADMIN_PAYMENT_EXCEPTION", `${orderId}:${phone}`),
      recipientPhone: phone,
      orderId,
      body: notificationBody("ADMIN_PAYMENT_EXCEPTION", { orderNumber: order.orderNumber, reason })
    });
  }
}
