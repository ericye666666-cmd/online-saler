import {
  CheckoutDraftStatus,
  DepositSettlementError,
  InventoryItemStatus,
  MpesaCallbackProcessingStatus,
  NotificationAudience,
  OrderPaymentPlan,
  OrderStatus,
  PaymentKind,
  PaymentSettlementError,
  PaymentStatus,
  Prisma,
  enqueueNotification,
  prisma,
  releaseExpiredReservations,
  lockReservationOrder,
  lockOrderReservationInventory,
  releaseUnpaidOrderReservation,
  settleDepositPayment,
  settleSuccessfulPayment
} from "@online-saler/database";
import { randomUUID } from "node:crypto";
import {
  MpesaClient,
  MpesaConfigurationError,
  MpesaProviderError,
  mpesaConfigFromEnv,
  type MpesaStkPushResponse
} from "./mpesa-client";
import {
  MpesaProductionGuardError,
  mpesaPaymentAmountMatchesOrder,
  resolveMpesaCharge
} from "./mpesa-production-guard";
import {
  LAUNCH_AFFILIATE_COMMISSION_RATE_BPS,
  RESERVATION_MINUTES,
  SUPPORT_PHONE_LABEL,
  depositBalanceDueAt,
  depositHoldDaysLeft,
  notificationBody,
  notificationDedupeKey
} from "@online-saler/business-rules";

export class PaymentValidationError extends Error {}
export class PaymentConflictError extends Error {}

export type InitiatePaymentResult = {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  status: PaymentStatus;
  /** What this prompt asks for — the total, the deposit, or the balance. */
  amountKsh: number;
  kind: PaymentKind;
  phone: string;
  expiresAt: string | null;
  checkoutRequestId: string | null;
  merchantRequestId: string | null;
  customerMessage: string | null;
};

export type PaymentStatusResult = {
  paymentId: string | null;
  orderId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus | null;
  paymentKind: PaymentKind | null;
  amountKsh: number;
  phone: string | null;
  expiresAt: string | null;
  receiptNumber: string | null;
  resultDescription: string | null;
  paymentPlan: OrderPaymentPlan;
  totalKsh: number;
  depositKsh: number;
  /** Still owed on a deposit order. Zero once the balance has been paid. */
  balanceKsh: number;
  /** When the seven-day hold lapses, and how many whole days are left. */
  balanceDueAt: string | null;
  balanceDaysLeft: number | null;
};

type MpesaCallbackBody = {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode?: number;
      ResultDesc?: string;
      CallbackMetadata?: {
        Item?: Array<{
          Name?: string;
          Value?: string | number;
        }>;
      };
    };
  };
};
type MpesaCallbackItem = {
  Name?: string;
  Value?: string | number;
};

type ParsedCallback = {
  merchantRequestId: string | null;
  checkoutRequestId: string;
  resultCode: number;
  resultDescription: string | null;
  amountKsh: number | null;
  receiptNumber: string | null;
  phone: string | null;
  transactionDate: Date | null;
};

export async function initiateMpesaPayment(
  orderId: string,
  customerId: string,
  client = new MpesaClient(mpesaConfigFromEnv())
): Promise<InitiatePaymentResult> {
  await releaseExpiredReservations();

  // Claim the attempt under the same order lock as callbacks and expiry. The
  // provider call is deliberately outside the transaction; retries reuse it.
  const attempt = await prisma.$transaction(async (tx) => {
    await lockReservationOrder(tx, orderId);
    const order = await tx.order.findFirst({
      where: { id: orderId, customerId },
      include: { sourceDraft: true, items: { select: { id: true } }, payments: { orderBy: { createdAt: "desc" } } }
    });
    if (!order) throw new PaymentValidationError("Order was not found.");
    const now = new Date();
    // Which leg is being paid. A deposit order is waiting for its balance the
    // moment the deposit clears, so a SUCCESS payment does not mean the order
    // is finished — only a successful FULL or BALANCE does.
    const balanceDue = order.status === OrderStatus.DEPOSIT_PAID;
    const settled = order.payments.find((payment) =>
      payment.status === PaymentStatus.SUCCESS
      && (payment.kind === PaymentKind.FULL || payment.kind === PaymentKind.BALANCE));
    if (settled) return { order, payment: settled, created: false };

    if (!balanceDue && order.status !== OrderStatus.PENDING_PAYMENT && order.status !== OrderStatus.PAYMENT_PROCESSING) {
      throw new PaymentConflictError("This order is not waiting for payment.");
    }
    // The deposit hold and the cart reservation are different clocks, and each
    // leg has to be inside its own before an STK goes out.
    if (balanceDue) {
      if (!order.balanceDueAt || order.balanceDueAt.getTime() <= now.getTime()) {
        throw new PaymentConflictError("This deposit hold has expired. The item has gone back on sale.");
      }
    } else if (order.sourceDraft?.status !== CheckoutDraftStatus.ACTIVE || !order.sourceDraft.expiresAt || order.sourceDraft.expiresAt.getTime() <= now.getTime()) {
      throw new PaymentConflictError("This payment reservation is no longer active.");
    }

    const existing = order.payments.find((payment) => payment.status === PaymentStatus.PENDING || payment.status === PaymentStatus.MANUAL_REVIEW);
    if (existing) return { order, payment: existing, created: false };

    const kind = balanceDue
      ? PaymentKind.BALANCE
      : order.paymentPlan === OrderPaymentPlan.DEPOSIT_50 ? PaymentKind.DEPOSIT : PaymentKind.FULL;
    const expectedInventoryStatus = balanceDue ? InventoryItemStatus.DEPOSIT_HELD : InventoryItemStatus.RESERVED;
    const inventory = await lockOrderReservationInventory(tx, order.id);
    if (inventory.length !== order.items.length || !inventory.length ||
        inventory.some((item) => !item.owned || item.status !== expectedInventoryStatus)) {
      throw new PaymentConflictError("This order no longer owns its reserved items.");
    }
    const phone = await phoneForOrder(tx, order.id);
    const charge = resolveMpesaCharge({ expectedAmountKsh: expectedLegAmountKsh(order, kind) });
    // The STK prompt always gets the short window. On a balance it is capped by
    // the hold itself, so a prompt can never outlive the garment it is for.
    const stkExpiresAt = balanceDue
      ? new Date(Math.min(now.getTime() + RESERVATION_MINUTES * 60_000, order.balanceDueAt!.getTime()))
      : order.sourceDraft!.expiresAt!;
    const payment = await tx.payment.create({
      data: {
        orderId: order.id, kind, status: PaymentStatus.PENDING, amountKsh: charge.amountKsh,
        phone, idempotencyKey: `mpesa:${order.id}:${randomUUID()}`, expiresAt: stkExpiresAt
      }
    });
    // A balance prompt leaves the order in DEPOSIT_PAID: the hold is what the
    // expiry sweep watches, and an unanswered prompt must not pause that clock.
    if (!balanceDue) {
      await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.PAYMENT_PROCESSING } });
    }
    return { order, payment, created: true };
  });
  const { order, payment } = attempt;
  if (!attempt.created) return paymentResultFromRecord(order, payment);

  let providerResponse: MpesaStkPushResponse;
  try {
    providerResponse = await client.initiateStkPush({ amountKsh: payment.amountKsh, phone: payment.phone, orderNumber: order.orderNumber });
    if (!providerResponse.checkoutRequestId) throw new Error("M-Pesa returned no checkout request ID; payment requires verification.");
  } catch (error) {
    // A transport failure can happen after Safaricom accepted the request. Do
    // not issue another STK or call it unpaid when the outcome is unknown.
    const raw = error instanceof MpesaProviderError && error.raw && typeof error.raw === "object"
      ? error.raw as { errorCode?: unknown; ResponseCode?: unknown } : null;
    const rejected = error instanceof MpesaConfigurationError || Boolean(raw?.errorCode || (raw?.ResponseCode && raw.ResponseCode !== "0"));
    await prisma.$transaction(async (tx) => {
      await lockReservationOrder(tx, order.id);
      const changed = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: {
          status: rejected ? PaymentStatus.FAILED : PaymentStatus.MANUAL_REVIEW,
          providerResultDescription: error instanceof Error ? error.message : "M-Pesa initiation requires verification.",
          completedAt: new Date()
        }
      });
      // Only the first leg's failure gives the garment back. A rejected balance
      // prompt leaves the hold exactly as it was — the deposit still stands and
      // the shopper still has until balanceDueAt to try again.
      if (changed.count && rejected && payment.kind !== PaymentKind.BALANCE) {
        await releaseUnpaidOrderReservation(tx, order.id, CheckoutDraftStatus.ABANDONED, OrderStatus.CANCELLED);
      }
    });
    throw error;
  }
  // If persisting an acknowledged response fails, leave the claimed attempt in
  // place. Treating that database error as provider rejection risks double pay.
  const updated = await prisma.$transaction(async (tx) => {
    await lockReservationOrder(tx, order.id);
    const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    return tx.payment.update({
      where: { id: payment.id },
      data: {
        providerMerchantRequestId: providerResponse.merchantRequestId,
        providerCheckoutRequestId: providerResponse.checkoutRequestId,
        ...(current.status === PaymentStatus.PENDING ? {
          providerResultCode: providerResponse.responseCode ? Number(providerResponse.responseCode) : null,
          providerResultDescription: providerResponse.responseDescription,
          providerResponseJson: jsonValue(providerResponse.raw)
        } : {})
      }
    });
  });
  return paymentResultFromRecord(order, updated, providerResponse);
}

export async function getPaymentStatus(orderId: string, customerId: string): Promise<PaymentStatusResult> {
  await releaseExpiredReservations();

  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId },
    include: {
      sourceDraft: true,
      payments: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });
  if (!order) throw new PaymentValidationError("Order was not found.");
  const payment = order.payments[0] ?? null;
  const balanceOutstanding = order.status === OrderStatus.DEPOSIT_PAID;
  return {
    paymentId: payment?.id ?? null,
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderStatus: order.status,
    paymentStatus: payment?.status ?? null,
    paymentKind: payment?.kind ?? null,
    amountKsh: payment?.amountKsh ?? order.totalKsh,
    phone: payment?.phone ?? null,
    expiresAt: payment?.expiresAt?.toISOString() ?? order.sourceDraft?.expiresAt?.toISOString() ?? null,
    receiptNumber: payment?.providerReceiptNumber ?? null,
    resultDescription: payment?.providerResultDescription ?? null,
    paymentPlan: order.paymentPlan,
    totalKsh: order.totalKsh,
    depositKsh: order.depositKsh,
    balanceKsh: balanceOutstanding ? order.balanceKsh : 0,
    balanceDueAt: balanceOutstanding ? order.balanceDueAt?.toISOString() ?? null : null,
    balanceDaysLeft: balanceOutstanding && order.balanceDueAt ? depositHoldDaysLeft(order.balanceDueAt) : null
  };
}

export async function handleMpesaCallback(body: unknown) {
  const callback = parseMpesaCallback(body);
  return prisma.$transaction(async (tx) => {
    // The unique callback row alone cannot serialize read-then-create. Lock its
    // provider key first, including orphan callbacks that have no order yet.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`mpesa-callback:${callback.checkoutRequestId}`}))::text`;
    const duplicate = await tx.mpesaCallback.findUnique({ where: { providerCheckoutRequestId: callback.checkoutRequestId } });
    if (duplicate) return { ok: true, duplicate: true };
    if (callback.receiptNumber) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`mpesa-receipt:${callback.receiptNumber}`}))::text`;
    }
    const reference = await tx.payment.findUnique({ where: { providerCheckoutRequestId: callback.checkoutRequestId }, select: { orderId: true } });
    if (!reference) {
      await tx.mpesaCallback.create({ data: callbackData(callback, null, null, MpesaCallbackProcessingStatus.MANUAL_REVIEW, body) });
      return { ok: true, manualReview: true };
    }
    await lockReservationOrder(tx, reference.orderId);
    const payment = await tx.payment.findUniqueOrThrow({
      where: { providerCheckoutRequestId: callback.checkoutRequestId },
      include: { order: { include: { sourceDraft: true, items: { include: { snapshot: true } } } } }
    });
    if (payment.status === PaymentStatus.SUCCESS) {
      await tx.mpesaCallback.create({ data: callbackData(callback, payment.id, payment.orderId, MpesaCallbackProcessingStatus.IGNORED, body) });
      return { ok: true, duplicate: true };
    }
    const order = payment.order;
    const now = new Date();
    if (callback.resultCode !== 0) {
      const failedStatus = classifyMpesaFailure(callback.resultCode);
      const applies = payment.status === PaymentStatus.PENDING;
      await tx.mpesaCallback.create({ data: callbackData(callback, payment.id, payment.orderId, applies ? MpesaCallbackProcessingStatus.APPLIED : MpesaCallbackProcessingStatus.IGNORED, body) });
      if (!applies) return { ok: true, duplicate: true };
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: failedStatus, providerMerchantRequestId: callback.merchantRequestId, providerResultCode: callback.resultCode, providerResultDescription: callback.resultDescription, completedAt: now }
      });
      // A declined balance leaves the deposit hold standing; the shopper keeps
      // the rest of their seven days to try again.
      if (payment.kind !== PaymentKind.BALANCE) {
        await releaseUnpaidOrderReservation(tx, payment.orderId,
          failedStatus === PaymentStatus.TIMEOUT ? CheckoutDraftStatus.EXPIRED : CheckoutDraftStatus.ABANDONED,
          failedStatus === PaymentStatus.TIMEOUT ? OrderStatus.EXPIRED : OrderStatus.CANCELLED);
      }
      return { ok: true, status: failedStatus };
    }
    // Each leg is checked against its own clock and its own inventory state: a
    // deposit or a full payment against the five-minute cart reservation, a
    // balance against the seven-day hold the deposit bought.
    const balanceLeg = payment.kind === PaymentKind.BALANCE;
    const windowOpen = payment.status === PaymentStatus.PENDING && (balanceLeg
      ? order.status === OrderStatus.DEPOSIT_PAID && Boolean(order.balanceDueAt) && order.balanceDueAt! > now
      : order.sourceDraft?.status === CheckoutDraftStatus.ACTIVE &&
        Boolean(order.sourceDraft.expiresAt) && order.sourceDraft.expiresAt! > now &&
        (order.status === OrderStatus.PENDING_PAYMENT || order.status === OrderStatus.PAYMENT_PROCESSING));
    const amountMatches = callback.amountKsh === payment.amountKsh && mpesaPaymentAmountMatchesOrder({
      paymentAmountKsh: payment.amountKsh, expectedAmountKsh: expectedLegAmountKsh(order, payment.kind)
    });
    const receiptOwner = callback.receiptNumber ? await tx.payment.findUnique({ where: { providerReceiptNumber: callback.receiptNumber }, select: { id: true } }) : null;
    const metadataMatches = (!callback.phone || callback.phone === payment.phone) &&
      (!callback.merchantRequestId || !payment.providerMerchantRequestId || callback.merchantRequestId === payment.providerMerchantRequestId);
    const inventory = windowOpen ? await lockOrderReservationInventory(tx, payment.orderId) : [];
    const expectedInventoryStatus = balanceLeg ? InventoryItemStatus.DEPOSIT_HELD : InventoryItemStatus.RESERVED;
    const inventoryOwned = inventory.length === order.items.length && inventory.length > 0 &&
      inventory.every((item) => item.owned && item.status === expectedInventoryStatus);
    if (!windowOpen || !amountMatches || !callback.receiptNumber || receiptOwner || !metadataMatches || !inventoryOwned) {
      await tx.mpesaCallback.create({ data: callbackData(callback, payment.id, payment.orderId, MpesaCallbackProcessingStatus.MANUAL_REVIEW, body) });
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.MANUAL_REVIEW, providerMerchantRequestId: callback.merchantRequestId, providerResultCode: callback.resultCode, providerResultDescription: callback.resultDescription, providerResponseJson: jsonValue(body), completedAt: now }
      });
      return { ok: true, manualReview: true };
    }
    await tx.mpesaCallback.create({ data: callbackData(callback, payment.id, payment.orderId, MpesaCallbackProcessingStatus.APPLIED, body) });
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.SUCCESS, providerMerchantRequestId: callback.merchantRequestId, providerResultCode: callback.resultCode, providerResultDescription: callback.resultDescription, providerReceiptNumber: callback.receiptNumber, providerResponseJson: jsonValue(body), completedAt: now }
    });
    // A deposit stops here: the garment is held, nothing is picked and nobody
    // earns a commission until the balance lands. Everything else is a
    // completed sale and takes the single settlement path.
    if (payment.kind === PaymentKind.DEPOSIT) {
      try {
        await settleDepositPayment(tx, {
          paymentId: payment.id,
          balanceDueAt: depositBalanceDueAt(now),
          now
        });
      } catch (error) {
        if (error instanceof DepositSettlementError) throw new PaymentConflictError(error.message);
        throw error;
      }
      await queueDepositReceivedNotification(tx, payment.orderId);
      return { ok: true, status: PaymentStatus.SUCCESS, depositHeld: true };
    }
    try {
      await settleSuccessfulPayment(tx, {
        paymentId: payment.id,
        commissionRateBps: LAUNCH_AFFILIATE_COMMISSION_RATE_BPS,
        requireActiveReservation: true,
        now
      });
    } catch (error) {
      if (error instanceof PaymentSettlementError) throw new PaymentConflictError(error.message);
      throw error;
    }
    await queuePaidOrderNotifications(tx, payment.orderId);
    return { ok: true, status: PaymentStatus.SUCCESS };
  });
}

/**
 * Tells the shopper the hold is real and when it ends. This is the only message
 * that carries the deadline before the reminders start, so it names both the
 * balance and the date rather than pointing at the order page.
 */
async function queueDepositReceivedNotification(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { customer: true, items: { select: { id: true } } }
  });
  if (!order?.balanceDueAt) return;
  await enqueueNotification(tx, {
    topic: "CUSTOMER_DEPOSIT_RECEIVED",
    audience: NotificationAudience.CUSTOMER,
    dedupeKey: notificationDedupeKey("CUSTOMER_DEPOSIT_RECEIVED", orderId),
    recipientPhone: order.whatsappPhone || order.customer.phone,
    recipientLabel: order.customer.displayName,
    orderId,
    body: notificationBody("CUSTOMER_DEPOSIT_RECEIVED", {
      orderNumber: order.orderNumber,
      itemCount: order.items.length,
      balanceKsh: order.balanceKsh,
      dueDateLabel: dueDateLabel(order.balanceDueAt),
      supportPhone: SUPPORT_PHONE_LABEL
    })
  });
}

/**
 * Queues the "we have your money" message and, when the sale came through an
 * affiliate link, tells the affiliate they earned. Both go to the outbox inside
 * the payment transaction so a provider outage cannot undo a confirmed payment.
 */
async function queuePaidOrderNotifications(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { customer: true, affiliate: true, commission: true, items: { select: { id: true } } }
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
  // Affiliates are not texted. The DIRECTLOOP sender id is registered with
  // Safaricom as Transactional, and that registration carries a KES 25,000 fine
  // if promotional traffic is ever found on it. "Your first sale is in, keep
  // posting" is encouragement, not a transaction, so it does not belong on this
  // sender id at any wording. Affiliates see their sales in the Affiliate Centre
  // instead. Reinstating these needs a second, promotional sender id.
}

export function parseMpesaCallback(body: unknown): ParsedCallback {
  const callback = (body as MpesaCallbackBody | null)?.Body?.stkCallback;
  if (!callback?.CheckoutRequestID || typeof callback.ResultCode !== "number") {
    throw new PaymentValidationError("Invalid M-Pesa callback payload.");
  }
  const metadata = callback.CallbackMetadata?.Item ?? [];
  return {
    merchantRequestId: callback.MerchantRequestID ?? null,
    checkoutRequestId: callback.CheckoutRequestID,
    resultCode: callback.ResultCode,
    resultDescription: callback.ResultDesc ?? null,
    amountKsh: numberMetadata(metadata, "Amount"),
    receiptNumber: stringMetadata(metadata, "MpesaReceiptNumber"),
    phone: stringMetadata(metadata, "PhoneNumber"),
    transactionDate: transactionDateMetadata(metadata, "TransactionDate")
  };
}

/**
 * What a single M-Pesa prompt is supposed to collect. A deposit order is
 * charged in two prompts and neither of them equals the order total, so every
 * amount check has to ask for the leg rather than the order.
 */
export function expectedLegAmountKsh(
  order: { totalKsh: number; depositKsh: number; balanceKsh: number },
  kind: PaymentKind
): number {
  if (kind === PaymentKind.DEPOSIT) return order.depositKsh;
  if (kind === PaymentKind.BALANCE) return order.balanceKsh;
  return order.totalKsh;
}

/** The deadline as a Kenyan shopper reads it in an SMS. */
function dueDateLabel(dueAt: Date): string {
  return dueAt.toLocaleDateString("en-KE", {
    weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Nairobi"
  });
}

function paymentResultFromRecord(
  order: { id: string; orderNumber: string },
  payment: {
    id: string;
    kind: PaymentKind;
    status: PaymentStatus;
    amountKsh: number;
    phone: string;
    expiresAt: Date | null;
    providerCheckoutRequestId: string | null;
    providerMerchantRequestId: string | null;
  },
  providerResponse?: MpesaStkPushResponse
): InitiatePaymentResult {
  return {
    paymentId: payment.id,
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: payment.status,
    kind: payment.kind,
    amountKsh: payment.amountKsh,
    phone: payment.phone,
    expiresAt: payment.expiresAt?.toISOString() ?? null,
    checkoutRequestId: payment.providerCheckoutRequestId,
    merchantRequestId: payment.providerMerchantRequestId,
    customerMessage: providerResponse?.customerMessage ?? null
  };
}

async function phoneForOrder(tx: Pick<Prisma.TransactionClient, "checkoutDraft">, orderId: string): Promise<string> {
  const draft = await tx.checkoutDraft.findUnique({
    where: { convertedOrderId: orderId },
    include: { customer: true }
  });
  if (!draft?.customer.phone) throw new PaymentValidationError("M-Pesa phone is missing for this order.");
  return draft.customer.phone;
}


function callbackData(
  callback: ParsedCallback,
  paymentId: string | null,
  orderId: string | null,
  processingStatus: MpesaCallbackProcessingStatus,
  raw: unknown
) {
  return {
    paymentId,
    orderId,
    providerMerchantRequestId: callback.merchantRequestId,
    providerCheckoutRequestId: callback.checkoutRequestId,
    resultCode: callback.resultCode,
    resultDescription: callback.resultDescription,
    amountKsh: callback.amountKsh !== null && Number.isInteger(callback.amountKsh) ? callback.amountKsh : null,
    mpesaReceiptNumber: callback.receiptNumber,
    phone: callback.phone,
    transactionDate: callback.transactionDate,
    processingStatus,
    rawJson: jsonValue(raw)
  };
}

function classifyMpesaFailure(resultCode: number): PaymentStatus {
  if (resultCode === 1032) return PaymentStatus.CANCELLED;
  if (resultCode === 1037 || resultCode === 1) return PaymentStatus.TIMEOUT;
  return PaymentStatus.FAILED;
}

function numberMetadata(items: MpesaCallbackItem[] | undefined, name: string): number | null {
  const value = items?.find((item) => item.Name === name)?.Value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringMetadata(items: MpesaCallbackItem[] | undefined, name: string): string | null {
  const value = items?.find((item) => item.Name === name)?.Value;
  return value === undefined || value === null ? null : String(value);
}

function transactionDateMetadata(items: MpesaCallbackItem[] | undefined, name: string): Date | null {
  const value = stringMetadata(items, name);
  if (!value || !/^\d{14}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));
  return new Date(Date.UTC(year, month - 1, day, hour - 3, minute, second));
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function paymentConfigurationErrorMessage(error: unknown): string {
  if (error instanceof MpesaConfigurationError) return "M-Pesa is not configured yet.";
  if (error instanceof MpesaProductionGuardError) return error.message;
  if (error instanceof MpesaProviderError) return error.message;
  if (error instanceof PaymentValidationError || error instanceof PaymentConflictError) return error.message;
  return "M-Pesa payment could not be started. Please try again.";
}
