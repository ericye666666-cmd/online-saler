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

// A failed delivery must not look like the order went back to the warehouse.
for (const status of [FulfillmentStatus.DELIVERY_FAILED, FulfillmentStatus.RETURNING_TO_NODE]) {
  const steps = customerFulfillmentProgress({
    orderStatus: OrderStatus.FULFILLING,
    fulfillmentMethod: FulfillmentMethod.KIKUYU_LOCAL_DELIVERY,
    fulfillmentStatus: status
  });
  assert.equal(steps.find((step) => step.state === "current")?.key, "handoff");
}

// A deposit order sits between "not paid" and "paid", and the shopper must be
// able to tell which from the label alone: one still needs their money, the
// other has already lost them the piece.
assert.equal(orderStatusLabel(OrderStatus.DEPOSIT_PAID), "Deposit paid — balance due");
assert.equal(orderStatusLabel(OrderStatus.DEPOSIT_EXPIRED), "Deposit hold expired");

// Neither of them is a fulfilment state, so the picking tracker stays hidden.
for (const status of [OrderStatus.DEPOSIT_PAID, OrderStatus.DEPOSIT_EXPIRED]) {
  assert.deepEqual(customerFulfillmentProgress({
    orderStatus: status,
    fulfillmentMethod: FulfillmentMethod.PICKUP
  }), []);
}

console.log("Order status label tests passed");
