import assert from "node:assert/strict";
import { FulfillmentMethod, FulfillmentStatus, OrderStatus, PaymentStatus } from "@online-saler/database";
import {
  customerFulfillmentProgress,
  customerOrderStatusLabel,
  orderStatusLabel,
  paymentStatusLabel
} from "./order-service";

assert.equal(orderStatusLabel(OrderStatus.PAID), "Paid");
assert.equal(orderStatusLabel(OrderStatus.PAYMENT_PROCESSING), "Waiting for M-Pesa");
assert.equal(orderStatusLabel(OrderStatus.EXPIRED), "Expired");
assert.equal(paymentStatusLabel(PaymentStatus.SUCCESS), "Paid");
assert.equal(paymentStatusLabel(PaymentStatus.MANUAL_REVIEW), "Checking");
assert.equal(paymentStatusLabel(null), "Not started");

const preparing = customerFulfillmentProgress({
  orderStatus: OrderStatus.FULFILLING,
  fulfillmentMethod: FulfillmentMethod.PICKUP,
  fulfillmentStatus: FulfillmentStatus.READY_TO_PACK
});
assert.deepEqual(preparing.map((step) => [step.label, step.state]), [
  ["Paid", "complete"],
  ["Preparing", "current"],
  ["Ready for pickup", "upcoming"],
  ["Completed", "upcoming"]
]);
assert.equal(customerOrderStatusLabel({
  orderStatus: OrderStatus.FULFILLING,
  fulfillmentMethod: FulfillmentMethod.PICKUP,
  fulfillmentStatus: FulfillmentStatus.READY_FOR_PICKUP
}), "Ready for pickup");
assert.equal(customerOrderStatusLabel({
  orderStatus: OrderStatus.COMPLETED,
  fulfillmentMethod: FulfillmentMethod.PICKUP,
  fulfillmentStatus: FulfillmentStatus.COMPLETED
}), "Completed");
assert.deepEqual(customerFulfillmentProgress({
  orderStatus: OrderStatus.FULFILLING,
  fulfillmentMethod: FulfillmentMethod.KIKUYU_LOCAL_DELIVERY,
  fulfillmentStatus: FulfillmentStatus.OUT_FOR_DELIVERY
}).map((step) => step.label), ["Paid", "Preparing", "Out for delivery", "Completed"]);

console.log("Order status label tests passed");
