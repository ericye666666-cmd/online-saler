export type CheckoutPaymentStatus = string | null | undefined;

/**
 * Where the shopper is in paying, as one value the page renders from. The
 * "notSent" stage is the reason this exists: when the STK push itself is
 * refused there is no payment record, and the old heading/body helpers fell
 * through to "Check your phone for the M-Pesa prompt" while printing the
 * refusal underneath - so shoppers waited on a prompt that was never sent.
 */
export type PaymentStage = "sending" | "waiting" | "notSent" | "failed" | "review" | "expired" | "success";

const retryableStatuses = new Set(["FAILED", "CANCELLED", "TIMEOUT"]);
const failedStatuses = new Set(["FAILED", "CANCELLED", "TIMEOUT", "EXPIRED", "MANUAL_REVIEW"]);

export function paymentSucceeded(orderStatus: CheckoutPaymentStatus, paymentStatus: CheckoutPaymentStatus): boolean {
  return orderStatus === "PAID" || paymentStatus === "SUCCESS";
}

export function paymentFailed(paymentStatus: CheckoutPaymentStatus): boolean {
  return failedStatuses.has(paymentStatus ?? "");
}

export function canRetryPayment(paymentStatus: CheckoutPaymentStatus, secondsRemaining: number): boolean {
  return secondsRemaining > 0 && retryableStatuses.has(paymentStatus ?? "");
}

export function paymentStage(input: {
  orderStatus?: CheckoutPaymentStatus;
  paymentStatus?: CheckoutPaymentStatus;
  paymentLoading: boolean;
  paymentError?: string;
  secondsRemaining: number;
}): PaymentStage {
  // A confirmed payment outranks everything, including a hold that has run out.
  if (paymentSucceeded(input.orderStatus, input.paymentStatus)) return "success";
  if (input.paymentStatus === "MANUAL_REVIEW") return "review";
  if (input.paymentStatus === "EXPIRED" || input.secondsRemaining <= 0) return "expired";
  if (input.paymentLoading) return "sending";
  if (retryableStatuses.has(input.paymentStatus ?? "")) return "failed";
  if (input.paymentStatus === "PENDING") return "waiting";
  // No payment record and an error: M-Pesa never received the request.
  if (input.paymentError) return "notSent";
  return "sending";
}

/**
 * Safaricom's result descriptions, in the shopper's words. Unknown text falls
 * back to a neutral sentence; the raw description still reaches customer
 * service through the WhatsApp message.
 */
export function friendlyFailureReason(description: string | null | undefined): string {
  const text = (description ?? "").toLowerCase();
  if (/cancel/.test(text)) return "The M-Pesa prompt was cancelled.";
  if (/insufficient|balance/.test(text)) return "Your M-Pesa balance wasn't enough for this payment.";
  if (/initiator information is invalid|\bpin\b/.test(text)) return "The M-Pesa PIN wasn't accepted.";
  if (/timeout|timed out|cannot be reached|unreachable|expired/.test(text)) return "The prompt closed before a PIN was entered.";
  return "M-Pesa didn't complete the payment.";
}
