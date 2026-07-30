import assert from "node:assert/strict";
import { OrderStatus, PaymentStatus } from "@online-saler/database";
import { orderStatusLabel, paymentStatusLabel } from "./order-service";

assert.equal(orderStatusLabel(OrderStatus.PAID), "Paid");
assert.equal(orderStatusLabel(OrderStatus.PAYMENT_PROCESSING), "Waiting for M-Pesa");
assert.equal(orderStatusLabel(OrderStatus.EXPIRED), "Expired");
assert.equal(paymentStatusLabel(PaymentStatus.SUCCESS), "Paid");
assert.equal(paymentStatusLabel(PaymentStatus.MANUAL_REVIEW), "Checking");
assert.equal(paymentStatusLabel(null), "Not started");

console.log("Order status label tests passed");
