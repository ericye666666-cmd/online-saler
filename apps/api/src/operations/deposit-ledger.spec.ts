import assert from "node:assert/strict";
import test from "node:test";
import { summariseHeldDeposits, summariseLapsedDeposits } from "./deposit-ledger";

function lapsed(collectedKsh: number, requests: Array<{ amountKsh: number; status?: string; completedAt?: Date | null }> = []) {
  return {
    totalKsh: 1000,
    payments: collectedKsh ? [{ amountKsh: collectedKsh }] : [],
    refundRequests: requests.map((request) => ({
      amountKsh: request.amountKsh,
      status: request.status ?? "PENDING_APPROVAL",
      completedAt: request.completedAt ?? null
    }))
  };
}

test("a normal lapse keeps the shop's 20% and owes the shopper 30%", () => {
  // The worked example: KSh 1,000 order, KSh 500 deposit, KSh 300 raised back.
  const ledger = summariseLapsedDeposits([lapsed(500, [{ amountKsh: 300 }])]);
  assert.deepEqual(ledger, { lapsedOrders: 1, forfeitKsh: 200, refundOwedKsh: 300, refundPaidKsh: 0 });
});

test("an executed refund stops being a debt but does not become income", () => {
  const ledger = summariseLapsedDeposits([lapsed(500, [{ amountKsh: 300, completedAt: new Date() }])]);
  assert.equal(ledger.refundOwedKsh, 0);
  assert.equal(ledger.refundPaidKsh, 300);
  assert.equal(ledger.forfeitKsh, 200);
});

test("a cancelled or rejected request is not owed, and its money is kept", () => {
  // Finance decided no refund was due. The whole deposit is then income —
  // counting it as owed forever would understate revenue and never clear.
  for (const status of ["CANCELLED", "REJECTED"]) {
    const ledger = summariseLapsedDeposits([lapsed(500, [{ amountKsh: 300, status }])]);
    assert.equal(ledger.refundOwedKsh, 0);
    assert.equal(ledger.forfeitKsh, 500);
  }
});

test("a lapse with no deposit collected books nothing as income", () => {
  // The sweep raises no request when nothing was collected. Falling back to the
  // policy rate here would invent KSh 300 of forfeit out of an empty order.
  const ledger = summariseLapsedDeposits([lapsed(0)]);
  assert.deepEqual(ledger, { lapsedOrders: 1, forfeitKsh: 0, refundOwedKsh: 0, refundPaidKsh: 0 });
});

test("a refund larger than the deposit never produces negative income", () => {
  const ledger = summariseLapsedDeposits([lapsed(200, [{ amountKsh: 300 }])]);
  assert.equal(ledger.forfeitKsh, 0);
});

test("lapses add up across orders", () => {
  const ledger = summariseLapsedDeposits([
    lapsed(500, [{ amountKsh: 300 }]),
    lapsed(500, [{ amountKsh: 300, completedAt: new Date() }])
  ]);
  assert.equal(ledger.lapsedOrders, 2);
  assert.equal(ledger.forfeitKsh, 400);
  assert.equal(ledger.refundOwedKsh, 300);
  assert.equal(ledger.refundPaidKsh, 300);
});

test("held deposits report the cash in and the cash still to come", () => {
  const summary = summariseHeldDeposits([
    { balanceKsh: 500, payments: [{ amountKsh: 500 }] },
    { balanceKsh: 250, payments: [{ amountKsh: 251 }] }
  ]);
  assert.deepEqual(summary, { heldOrders: 2, depositHeldKsh: 751, balanceOutstandingKsh: 750 });
});

test("nothing held reports zeroes rather than nulls", () => {
  assert.deepEqual(summariseHeldDeposits([]), { heldOrders: 0, depositHeldKsh: 0, balanceOutstandingKsh: 0 });
  assert.deepEqual(summariseLapsedDeposits([]), { lapsedOrders: 0, forfeitKsh: 0, refundOwedKsh: 0, refundPaidKsh: 0 });
});
