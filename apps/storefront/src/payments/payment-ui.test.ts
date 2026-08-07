import assert from "node:assert/strict";
import { canRetryPayment, paymentBody, paymentFailed, paymentHeading, paymentSucceeded, paymentTone } from "./payment-ui";

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

assert.equal(paymentTone({ orderStatus: "PAID", paymentStatus: "PENDING", paymentLoading: false }), "success");
assert.equal(paymentTone({ paymentStatus: "PENDING", paymentLoading: true }), "pending");
assert.equal(paymentTone({ paymentStatus: "FAILED", paymentLoading: false }), "failed");
assert.equal(paymentTone({ paymentStatus: "EXPIRED", paymentLoading: false }), "expired");
assert.equal(paymentTone({ paymentStatus: "MANUAL_REVIEW", paymentLoading: false }), "review");

assert.equal(paymentHeading({ orderStatus: "PAID", paymentStatus: "SUCCESS", paymentLoading: false }), "Payment confirmed");
assert.equal(paymentHeading({ paymentStatus: "MANUAL_REVIEW", paymentLoading: false }), "Payment is being checked");
assert.equal(paymentHeading({ paymentStatus: "CANCELLED", paymentLoading: false }), "Payment was not completed");
assert.equal(paymentHeading({ paymentStatus: "PENDING", paymentLoading: true }), "Sending M-Pesa request...");

assert.equal(
  paymentBody({ orderStatus: "PAID", paymentStatus: "SUCCESS", receiptNumber: "TGU7R8XYZ1" }),
  "Receipt TGU7R8XYZ1"
);
assert.match(paymentBody({ paymentStatus: "MANUAL_REVIEW" }), /staff review/);
assert.match(paymentBody({ paymentStatus: "CANCELLED", resultDescription: "Request cancelled by user." }), /cancelled/);

console.log("Payment UI state tests passed");
