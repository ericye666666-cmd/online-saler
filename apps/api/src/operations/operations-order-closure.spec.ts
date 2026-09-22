import assert from "node:assert/strict";
import test from "node:test";
import { PaymentStatus } from "@online-saler/database";
import { orderRefundPosition } from "@online-saler/database";
import { deliverySubsidyKsh, isValidActualDeliveryCost, summariseDeliveryEconomics } from "@online-saler/business-rules";
import { describeHold } from "./operations-payment-review.service";

test("only successful payments count as money received", () => {
  const position = orderRefundPosition({
    payments: [
      { status: PaymentStatus.SUCCESS, amountKsh: 400 },
      { status: PaymentStatus.FAILED, amountKsh: 400 },
      { status: PaymentStatus.MANUAL_REVIEW, amountKsh: 400 }
    ],
    refunds: []
  });
  assert.deepEqual(position, { paidKsh: 400, refundedKsh: 0, outstandingKsh: 400, fullyRefunded: false });
});

test("a partly refunded order still owes the rest", () => {
  const position = orderRefundPosition({
    payments: [{ status: PaymentStatus.SUCCESS, amountKsh: 450 }],
    refunds: [{ amountKsh: 200 }]
  });
  assert.equal(position.outstandingKsh, 250);
  assert.equal(position.fullyRefunded, false);
});

test("an over-recorded refund never reports a negative balance", () => {
  const position = orderRefundPosition({
    payments: [{ status: PaymentStatus.SUCCESS, amountKsh: 400 }],
    refunds: [{ amountKsh: 400 }, { amountKsh: 50 }]
  });
  assert.equal(position.outstandingKsh, 0);
  assert.equal(position.fullyRefunded, true);
});

test("the delivery subsidy is what the KSh 50 did not cover", () => {
  assert.equal(deliverySubsidyKsh({ customerDeliveryFeeKsh: 50, actualDeliveryCostKsh: 230 }), 180);
  // A cheap ride can go the other way, and that is not an error.
  assert.equal(deliverySubsidyKsh({ customerDeliveryFeeKsh: 50, actualDeliveryCostKsh: 40 }), -10);
  // An unrecorded fare is unknown, not zero.
  assert.equal(deliverySubsidyKsh({ customerDeliveryFeeKsh: 50, actualDeliveryCostKsh: null }), null);
});

test("delivery totals separate recorded fares from the ones still missing", () => {
  const summary = summariseDeliveryEconomics([
    { customerDeliveryFeeKsh: 50, actualDeliveryCostKsh: 230 },
    { customerDeliveryFeeKsh: 50, actualDeliveryCostKsh: 150 },
    { customerDeliveryFeeKsh: 50, actualDeliveryCostKsh: null }
  ]);
  assert.equal(summary.deliveryRevenueKsh, 150);
  assert.equal(summary.actualDeliveryCostKsh, 380);
  assert.equal(summary.subsidyKsh, 230);
  assert.equal(summary.ordersWithRecordedCost, 2);
  assert.equal(summary.ordersMissingCost, 1);
  assert.equal(summary.averageCostPerOrderKsh, 190);
});

test("a fare has to be a plausible whole KSh amount", () => {
  assert.equal(isValidActualDeliveryCost(0), true);
  assert.equal(isValidActualDeliveryCost(230), true);
  assert.equal(isValidActualDeliveryCost(-1), false);
  assert.equal(isValidActualDeliveryCost(230.5), false);
  assert.equal(isValidActualDeliveryCost(50_000), false);
  assert.equal(isValidActualDeliveryCost("230"), false);
});

test("a held payment says in plain words why a human has to look at it", () => {
  const base = { amountKsh: 400, providerReceiptNumber: "SJ12ABC", providerResultCode: 0, expiresAt: null };
  assert.match(
    describeHold({ ...base, providerReceiptNumber: null, order: { totalKsh: 400, status: "PAID" as never } }),
    /receipt number/
  );
  assert.match(
    describeHold({ ...base, amountKsh: 300, order: { totalKsh: 400, status: "PAID" as never } }),
    /does not match/
  );
  assert.match(
    describeHold({ ...base, expiresAt: new Date(Date.now() - 60_000), order: { totalKsh: 400, status: "PAID" as never } }),
    /after the reservation window/
  );
});
