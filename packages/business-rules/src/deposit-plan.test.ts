import assert from "node:assert/strict";
import test from "node:test";
import {
  DEPOSIT_HOLD_DAYS,
  DEPOSIT_RATE_BPS,
  DEPOSIT_LAPSE_REFUND_RATE_BPS,
  balanceAmountKsh,
  depositAmountKsh,
  depositBalanceDueAt,
  depositHoldDaysLeft,
  isDepositHoldExpired,
  lapsedDepositRefundKsh,
  lapsedDepositSettlement,
  orderQualifiesForDeposit
} from "./deposit-plan";

test("the policy is half now, the rest inside a week", () => {
  assert.equal(DEPOSIT_RATE_BPS, 5000);
  assert.equal(DEPOSIT_HOLD_DAYS, 7);
});

test("the two legs always add back up to the order total", () => {
  for (const total of [2, 3, 99, 100, 101, 1250, 1251, 49_999]) {
    assert.equal(depositAmountKsh(total) + balanceAmountKsh(total), total);
  }
});

test("an odd total rounds the deposit up, never the balance", () => {
  // M-Pesa moves whole shillings only, and the shop should not be the one
  // carrying the rounding loss on the money it collects first.
  assert.equal(depositAmountKsh(1001), 501);
  assert.equal(balanceAmountKsh(1001), 500);
});

test("both legs stay payable, so no order can owe zero shillings", () => {
  for (const total of [2, 3, 7, 1001]) {
    assert.ok(depositAmountKsh(total) >= 1);
    assert.ok(balanceAmountKsh(total) >= 1);
  }
});

test("a one-shilling order cannot be split and is full payment only", () => {
  assert.equal(orderQualifiesForDeposit(1), false);
  assert.equal(orderQualifiesForDeposit(2), true);
  assert.equal(orderQualifiesForDeposit(1250), true);
});

test("a nonsense total is refused rather than silently charged", () => {
  for (const invalid of [0, -1, 12.5, Number.NaN]) {
    assert.throws(() => depositAmountKsh(invalid));
    assert.throws(() => lapsedDepositRefundKsh(invalid));
  }
});

test("the hold runs exactly seven days from the deposit", () => {
  const paidAt = new Date("2026-09-23T09:00:00.000Z");
  const dueAt = depositBalanceDueAt(paidAt);
  assert.equal(dueAt.toISOString(), "2026-09-30T09:00:00.000Z");
  assert.equal(isDepositHoldExpired(dueAt, new Date("2026-09-30T08:59:59.000Z")), false);
  assert.equal(isDepositHoldExpired(dueAt, dueAt), true);
  assert.equal(depositHoldDaysLeft(dueAt, paidAt), 7);
  assert.equal(depositHoldDaysLeft(dueAt, new Date("2026-09-29T10:00:00.000Z")), 1);
  assert.equal(depositHoldDaysLeft(dueAt, new Date("2026-10-02T09:00:00.000Z")), 0);
});

test("a lapsed hold refunds 30% of the order total and keeps 20%", () => {
  assert.equal(DEPOSIT_LAPSE_REFUND_RATE_BPS, 3000);
  // The worked example the policy was agreed on: KSh 1000 order, KSh 500
  // deposit, KSh 300 back to the shopper and KSh 200 kept by the shop.
  const settlement = lapsedDepositSettlement(1000, depositAmountKsh(1000));
  assert.deepEqual(settlement, { refundKsh: 300, forfeitKsh: 200 });
});

test("the refund never exceeds what was actually collected", () => {
  // A deposit that was adjusted or only part-collected must not turn the
  // refund policy into a payout larger than the money that came in.
  assert.deepEqual(lapsedDepositSettlement(1000, 100), { refundKsh: 100, forfeitKsh: 0 });
  assert.deepEqual(lapsedDepositSettlement(1000, 0), { refundKsh: 0, forfeitKsh: 0 });
});

test("a negative or fractional deposit is refused", () => {
  assert.throws(() => lapsedDepositSettlement(1000, -1));
  assert.throws(() => lapsedDepositSettlement(1000, 10.5));
});
