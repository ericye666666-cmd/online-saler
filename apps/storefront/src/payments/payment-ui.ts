export type CheckoutPaymentStatus = string | null | undefined;
export type CheckoutPaymentTone = "pending" | "success" | "failed" | "expired" | "review";

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

export function paymentTone(input: {
  orderStatus?: CheckoutPaymentStatus;
  paymentStatus?: CheckoutPaymentStatus;
  paymentLoading: boolean;
}): CheckoutPaymentTone {
  if (paymentSucceeded(input.orderStatus, input.paymentStatus)) return "success";
  if (input.paymentStatus === "MANUAL_REVIEW") return "review";
  if (input.paymentStatus === "EXPIRED") return "expired";
  if (paymentFailed(input.paymentStatus)) return "failed";
  return "pending";
}

export function paymentHeading(input: {
  orderStatus?: CheckoutPaymentStatus;
  paymentStatus?: CheckoutPaymentStatus;
  paymentLoading: boolean;
}): string {
  if (paymentSucceeded(input.orderStatus, input.paymentStatus)) return "Payment confirmed";
  if (input.paymentStatus === "MANUAL_REVIEW") return "Payment is being checked";
  if (input.paymentStatus === "EXPIRED") return "Reservation expired";
  if (paymentFailed(input.paymentStatus)) return "Payment was not completed";
  if (input.paymentLoading) return "Sending M-Pesa request...";
  return "Check your phone for the M-Pesa prompt";
}

export function paymentBody(input: {
  orderStatus?: CheckoutPaymentStatus;
  paymentStatus?: CheckoutPaymentStatus;
  receiptNumber?: string | null;
  paymentError?: string;
  customerMessage?: string | null;
  resultDescription?: string | null;
}): string {
  if (paymentSucceeded(input.orderStatus, input.paymentStatus)) {
    return input.receiptNumber ? `Receipt ${input.receiptNumber}` : "Payment received. Customer service will confirm pickup or delivery.";
  }
  if (input.paymentStatus === "MANUAL_REVIEW") {
    return "We received a payment result that needs staff review before the order can move forward.";
  }
  if (input.paymentStatus === "EXPIRED") {
    return "The 15 minute reservation ended before payment was confirmed.";
  }
  if (paymentFailed(input.paymentStatus)) {
    return input.resultDescription || "You can retry M-Pesa while the reservation is still active.";
  }
  return input.paymentError || input.customerMessage || input.resultDescription || "Enter your M-Pesa PIN to complete the order.";
}
