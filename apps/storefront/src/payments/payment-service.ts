import {
  CheckoutDraftStatus,
  InventoryItemStatus,
  MpesaCallbackProcessingStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  prisma,
  releaseExpiredReservations,
  lockReservationOrder,
  lockOrderReservationInventory,
  releaseUnpaidOrderReservation
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
import { createPendingCommissionForPaidOrder } from "../affiliate/affiliate-service";
import { buildPaidOrderPickingTask } from "./payment-fulfillment";

export class PaymentValidationError extends Error {}
export class PaymentConflictError extends Error {}

export type InitiatePaymentResult = {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  status: PaymentStatus;
  amountKsh: number;
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
  amountKsh: number;
  phone: string | null;
  expiresAt: string | null;
  receiptNumber: string | null;
  resultDescription: string | null;
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
    const successful = order.payments.find((payment) => payment.status === PaymentStatus.SUCCESS);
    if (successful) return { order, payment: successful, created: false };
    if (order.status !== OrderStatus.PENDING_PAYMENT && order.status !== OrderStatus.PAYMENT_PROCESSING) {
      throw new PaymentConflictError("This order is not waiting for payment.");
    }
    if (order.sourceDraft?.status !== CheckoutDraftStatus.ACTIVE || !order.sourceDraft.expiresAt || order.sourceDraft.expiresAt.getTime() <= Date.now()) {
      throw new PaymentConflictError("This payment reservation is no longer active.");
    }
    const existing = order.payments.find((payment) => payment.status === PaymentStatus.PENDING || payment.status === PaymentStatus.MANUAL_REVIEW);
    if (existing) return { order, payment: existing, created: false };
    const inventory = await lockOrderReservationInventory(tx, order.id);
    if (inventory.length !== order.items.length || !inventory.length ||
        inventory.some((item) => !item.owned || item.status !== InventoryItemStatus.RESERVED)) {
      throw new PaymentConflictError("This order no longer owns its reserved items.");
    }
    const phone = await phoneForOrder(tx, order.id);
    const charge = resolveMpesaCharge({ environment: client.config.environment, orderAmountKsh: order.totalKsh, phone });
    const payment = await tx.payment.create({
      data: {
        orderId: order.id, status: PaymentStatus.PENDING, amountKsh: charge.amountKsh,
        phone, idempotencyKey: `mpesa:${order.id}:${randomUUID()}`, expiresAt: order.sourceDraft.expiresAt
      }
    });
    await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.PAYMENT_PROCESSING } });
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
      if (changed.count && rejected) {
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
  return {
    paymentId: payment?.id ?? null,
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderStatus: order.status,
    paymentStatus: payment?.status ?? null,
    amountKsh: payment?.amountKsh ?? order.totalKsh,
    phone: payment?.phone ?? null,
    expiresAt: payment?.expiresAt?.toISOString() ?? order.sourceDraft?.expiresAt?.toISOString() ?? null,
    receiptNumber: payment?.providerReceiptNumber ?? null,
    resultDescription: payment?.providerResultDescription ?? null
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
      await releaseUnpaidOrderReservation(tx, payment.orderId,
        failedStatus === PaymentStatus.TIMEOUT ? CheckoutDraftStatus.EXPIRED : CheckoutDraftStatus.ABANDONED,
        failedStatus === PaymentStatus.TIMEOUT ? OrderStatus.EXPIRED : OrderStatus.CANCELLED);
      return { ok: true, status: failedStatus };
    }
    const activeDraft = order.sourceDraft?.status === CheckoutDraftStatus.ACTIVE &&
      order.sourceDraft.expiresAt && order.sourceDraft.expiresAt > now &&
      (order.status === OrderStatus.PENDING_PAYMENT || order.status === OrderStatus.PAYMENT_PROCESSING) &&
      payment.status === PaymentStatus.PENDING;
    const amountMatches = callback.amountKsh === payment.amountKsh && mpesaPaymentAmountMatchesOrder({
      environment: mpesaConfigFromEnv().environment, paymentAmountKsh: payment.amountKsh, orderAmountKsh: order.totalKsh, phone: payment.phone
    });
    const receiptOwner = callback.receiptNumber ? await tx.payment.findUnique({ where: { providerReceiptNumber: callback.receiptNumber }, select: { id: true } }) : null;
    const metadataMatches = (!callback.phone || callback.phone === payment.phone) &&
      (!callback.merchantRequestId || !payment.providerMerchantRequestId || callback.merchantRequestId === payment.providerMerchantRequestId);
    const inventory = activeDraft ? await lockOrderReservationInventory(tx, payment.orderId) : [];
    const inventoryOwned = inventory.length === order.items.length && inventory.length > 0 &&
      inventory.every((item) => item.owned && item.status === InventoryItemStatus.RESERVED);
    if (!activeDraft || !order.sourceDraft?.expiresAt || order.sourceDraft.expiresAt.getTime() <= Date.now() || !amountMatches || !callback.receiptNumber || receiptOwner || !metadataMatches || !inventoryOwned) {
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
    await tx.order.update({ where: { id: payment.orderId }, data: { status: OrderStatus.PAID } });
    const existingPickingTask = await tx.orderFulfillment.findUnique({ where: { orderId: payment.orderId } });
    if (!existingPickingTask) {
      const pickingTask = buildPaidOrderPickingTask(payment.orderId, order.items);
      const fulfillment = await tx.orderFulfillment.create({ data: pickingTask.fulfillment });
      if (pickingTask.items.length > 0) {
        await tx.fulfillmentItem.createMany({ data: pickingTask.items.map((item) => ({ ...item, fulfillmentId: fulfillment.id })), skipDuplicates: true });
      }
      await tx.fulfillmentEvent.create({ data: { ...pickingTask.event, fulfillmentId: fulfillment.id } });
    }
    await createPendingCommissionForPaidOrder(tx, payment.orderId);
    await tx.checkoutDraft.update({ where: { id: order.sourceDraft!.id }, data: { status: CheckoutDraftStatus.CONVERTED } });
    for (const item of inventory) {
      const updated = await tx.inventoryItem.updateMany({ where: { id: item.id, status: InventoryItemStatus.RESERVED }, data: { status: InventoryItemStatus.PAID } });
      if (updated.count !== 1) throw new PaymentConflictError("Reserved inventory changed during payment confirmation.");
    }
    return { ok: true, status: PaymentStatus.SUCCESS };
  });
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

function paymentResultFromRecord(
  order: { id: string; orderNumber: string },
  payment: {
    id: string;
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
