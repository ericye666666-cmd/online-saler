import {
  CheckoutDraftStatus,
  InventoryItemStatus,
  MpesaCallbackProcessingStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  prisma
} from "@online-saler/database";
import { RESERVATION_MINUTES } from "@online-saler/business-rules";
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
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId },
    include: {
      sourceDraft: true,
      payments: { orderBy: { createdAt: "desc" }, take: 3 }
    }
  });

  if (!order) throw new PaymentValidationError("Order was not found.");
  if (order.status !== OrderStatus.PENDING_PAYMENT && order.status !== OrderStatus.PAYMENT_PROCESSING) {
    throw new PaymentConflictError("This order is not waiting for payment.");
  }
  if (!order.sourceDraft || order.sourceDraft.status !== CheckoutDraftStatus.ACTIVE || !order.sourceDraft.expiresAt) {
    throw new PaymentConflictError("This payment reservation is no longer active.");
  }
  if (order.sourceDraft.expiresAt.getTime() <= Date.now()) {
    throw new PaymentConflictError("This payment reservation has expired.");
  }

  const pending = order.payments.find((payment) => payment.status === PaymentStatus.PENDING);
  if (pending) return paymentResultFromRecord(order, pending);

  const successful = order.payments.find((payment) => payment.status === PaymentStatus.SUCCESS);
  if (successful) return paymentResultFromRecord(order, successful);

  const phone = await phoneForOrder(prisma, order.id);
  const charge = resolveMpesaCharge({
    environment: client.config.environment,
    orderAmountKsh: order.totalKsh,
    phone
  });
  const idempotencyKey = `mpesa:${order.id}:${Date.now()}`;
  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        orderId: order.id,
        status: PaymentStatus.PENDING,
        amountKsh: charge.amountKsh,
        phone,
        idempotencyKey,
        expiresAt: order.sourceDraft!.expiresAt
      }
    });
    await tx.order.updateMany({
      where: { id: order.id, status: OrderStatus.PENDING_PAYMENT },
      data: { status: OrderStatus.PAYMENT_PROCESSING }
    });
    return created;
  });

  try {
    const providerResponse = await client.initiateStkPush({
      amountKsh: payment.amountKsh,
      phone,
      orderNumber: order.orderNumber
    });

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerMerchantRequestId: providerResponse.merchantRequestId,
        providerCheckoutRequestId: providerResponse.checkoutRequestId,
        providerResultCode: providerResponse.responseCode ? Number(providerResponse.responseCode) : null,
        providerResultDescription: providerResponse.responseDescription,
        providerResponseJson: jsonValue(providerResponse.raw)
      }
    });
    return paymentResultFromRecord(order, updated, providerResponse);
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          providerResultDescription: error instanceof Error ? error.message : "M-Pesa initiation failed.",
          completedAt: new Date()
        }
      });
      await tx.order.updateMany({
        where: { id: order.id, status: OrderStatus.PAYMENT_PROCESSING },
        data: { status: OrderStatus.PENDING_PAYMENT }
      });
    });
    throw error;
  }
}

export async function getPaymentStatus(orderId: string, customerId: string): Promise<PaymentStatusResult> {
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
  const duplicate = await prisma.mpesaCallback.findUnique({
    where: { providerCheckoutRequestId: callback.checkoutRequestId }
  });
  if (duplicate) return { ok: true, duplicate: true };

  const payment = await prisma.payment.findUnique({
    where: { providerCheckoutRequestId: callback.checkoutRequestId },
    include: {
      order: {
        include: {
          sourceDraft: true,
          items: true
        }
      }
    }
  });

  if (!payment) {
    await prisma.mpesaCallback.create({
      data: callbackData(callback, null, null, MpesaCallbackProcessingStatus.MANUAL_REVIEW, body)
    });
    return { ok: true, manualReview: true };
  }

  if (payment.status === PaymentStatus.SUCCESS) {
    await prisma.mpesaCallback.create({
      data: callbackData(callback, payment.id, payment.orderId, MpesaCallbackProcessingStatus.IGNORED, body)
    });
    return { ok: true, duplicate: true };
  }

  if (callback.resultCode !== 0) {
    const failedStatus = classifyMpesaFailure(callback.resultCode);
    await prisma.$transaction(async (tx) => {
      await tx.mpesaCallback.create({
        data: callbackData(callback, payment.id, payment.orderId, MpesaCallbackProcessingStatus.APPLIED, body)
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: failedStatus,
          providerMerchantRequestId: callback.merchantRequestId,
          providerResultCode: callback.resultCode,
          providerResultDescription: callback.resultDescription,
          completedAt: new Date()
        }
      });
      await tx.order.updateMany({
        where: { id: payment.orderId, status: OrderStatus.PAYMENT_PROCESSING },
        data: { status: OrderStatus.PENDING_PAYMENT }
      });
    });
    return { ok: true, status: failedStatus };
  }

  const order = payment.order;
  const activeDraft = order.sourceDraft?.status === CheckoutDraftStatus.ACTIVE
    && order.sourceDraft.expiresAt
    && order.sourceDraft.expiresAt.getTime() > Date.now();
  const amountMatches = callback.amountKsh === payment.amountKsh
    && mpesaPaymentAmountMatchesOrder({
      environment: mpesaConfigFromEnv().environment,
      paymentAmountKsh: payment.amountKsh,
      orderAmountKsh: order.totalKsh,
      phone: payment.phone
    });

  if (!activeDraft || !amountMatches || !callback.receiptNumber) {
    await prisma.$transaction(async (tx) => {
      await tx.mpesaCallback.create({
        data: callbackData(callback, payment.id, payment.orderId, MpesaCallbackProcessingStatus.MANUAL_REVIEW, body)
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.MANUAL_REVIEW,
          providerMerchantRequestId: callback.merchantRequestId,
          providerResultCode: callback.resultCode,
          providerResultDescription: callback.resultDescription,
          providerResponseJson: jsonValue(body),
          completedAt: new Date()
        }
      });
    });
    return { ok: true, manualReview: true };
  }

  await prisma.$transaction(async (tx) => {
    await tx.mpesaCallback.create({
      data: callbackData(callback, payment.id, payment.orderId, MpesaCallbackProcessingStatus.APPLIED, body)
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.SUCCESS,
        providerMerchantRequestId: callback.merchantRequestId,
        providerResultCode: callback.resultCode,
        providerResultDescription: callback.resultDescription,
        providerReceiptNumber: callback.receiptNumber,
        providerResponseJson: jsonValue(body),
        completedAt: new Date()
      }
    });
    await tx.order.update({
      where: { id: payment.orderId },
      data: { status: OrderStatus.PAID }
    });
    await createPendingCommissionForPaidOrder(tx, payment.orderId);
    await tx.checkoutDraft.updateMany({
      where: { convertedOrderId: payment.orderId, status: CheckoutDraftStatus.ACTIVE },
      data: { status: CheckoutDraftStatus.CONVERTED }
    });
    for (const item of order.items) {
      await tx.inventoryItem.updateMany({
        where: { productId: item.productId, status: InventoryItemStatus.RESERVED },
        data: { status: InventoryItemStatus.PAID }
      });
    }
  });

  return { ok: true, status: PaymentStatus.SUCCESS };
}

export function parseMpesaCallback(body: unknown): ParsedCallback {
  const callback = (body as MpesaCallbackBody).Body?.stkCallback;
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
    amountKsh: callback.amountKsh,
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
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
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
