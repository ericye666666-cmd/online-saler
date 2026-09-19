import assert from "node:assert/strict";
import { canRetryPayment, friendlyFailureReason, paymentFailed, paymentStage, paymentSucceeded } from "./payment-ui";

assert.equal(paymentSucceeded("PAID", "PENDING"), true);
assert.equal(paymentSucceeded("PAYMENT_PROCESSING", "SUCCESS"), true);
assert.equal(paymentSucceeded("PAYMENT_PROCESSING", "PENDING"), false);

assert.equal(paymentFailed("FAILED"), true);
assert.equal(paymentFailed("CANCELLED"), true);
assert.equal(paymentFailed("TIMEOUT"), true);
assert.equal(paymentFailed("EXPIRED"), true);
assert.equal(paymentFailed("MANUAL_REVIEW"), true);
assert.equal(paymentFailed("PENDING"), false);

assert.equal(canRetryPayment("FAILED", 120), true);
assert.equal(canRetryPayment("CANCELLED", 120), true);
assert.equal(canRetryPayment("TIMEOUT", 120), true);
assert.equal(canRetryPayment("MANUAL_REVIEW", 120), false);
assert.equal(canRetryPayment("FAILED", 0), false);

const live = { paymentLoading: false, secondsRemaining: 600 };

// The 2026-09-19 case: the STK push was refused, so there is no payment record,
// only an error. That must read as "not sent", never as "check your phone".
assert.equal(paymentStage({ ...live, paymentError: "M-Pesa production test mode only allows whitelisted phone numbers." }), "notSent");

assert.equal(paymentStage({ ...live, paymentLoading: true }), "sending");
assert.equal(paymentStage({ ...live }), "sending");
assert.equal(paymentStage({ ...live, paymentStatus: "PENDING" }), "waiting");
// A failed status refresh while the prompt is out does not abandon the wait.
assert.equal(paymentStage({ ...live, paymentStatus: "PENDING", paymentError: "Payment status could not be refreshed." }), "waiting");
assert.equal(paymentStage({ ...live, paymentStatus: "CANCELLED" }), "failed");
assert.equal(paymentStage({ ...live, paymentStatus: "TIMEOUT" }), "failed");
assert.equal(paymentStage({ ...live, paymentStatus: "MANUAL_REVIEW" }), "review");
assert.equal(paymentStage({ ...live, paymentStatus: "EXPIRED" }), "expired");
assert.equal(paymentStage({ paymentLoading: false, secondsRemaining: 0, paymentStatus: "PENDING" }), "expired");
// Money that arrived just after the hold ended still counts as paid.
assert.equal(paymentStage({ paymentLoading: false, secondsRemaining: 0, orderStatus: "PAID" }), "success");
assert.equal(paymentStage({ ...live, paymentStatus: "SUCCESS" }), "success");

assert.equal(friendlyFailureReason("Request cancelled by user"), "The M-Pesa prompt was cancelled.");
assert.equal(friendlyFailureReason("The balance is insufficient for the transaction."), "Your M-Pesa balance wasn't enough for this payment.");
assert.equal(friendlyFailureReason("The initiator information is invalid."), "The M-Pesa PIN wasn't accepted.");
assert.equal(friendlyFailureReason("DS timeout user cannot be reached"), "The prompt closed before a PIN was entered.");
assert.equal(friendlyFailureReason("Something new from Safaricom"), "M-Pesa didn't complete the payment.");
assert.equal(friendlyFailureReason(null), "M-Pesa didn't complete the payment.");

console.log("Payment UI state tests passed");
