import assert from "node:assert/strict";
import { balanceAmountKsh, depositAmountKsh } from "@online-saler/business-rules";
import {
  MpesaProductionGuardError,
  mpesaPaymentAmountMatchesOrder,
  resolveMpesaCharge
} from "./mpesa-production-guard";

// Every shopper is charged what their payment leg is worth. Nothing in the
// environment can shrink the amount or restrict who may pay.
assert.deepEqual(resolveMpesaCharge({ expectedAmountKsh: 1250 }), { amountKsh: 1250, expectedAmountKsh: 1250 });

for (const invalid of [0, -5, 12.5, Number.NaN]) {
  assert.throws(() => resolveMpesaCharge({ expectedAmountKsh: invalid }), MpesaProductionGuardError);
}

// A callback only settles a payment when it paid that leg in full.
assert.equal(mpesaPaymentAmountMatchesOrder({ paymentAmountKsh: 1250, expectedAmountKsh: 1250 }), true);
assert.equal(mpesaPaymentAmountMatchesOrder({ paymentAmountKsh: 1, expectedAmountKsh: 1250 }), false);

// The deposit and the balance are separate legs, and paying one does not
// satisfy the other — the halves of an order are never interchangeable.
const total = 1250;
const deposit = depositAmountKsh(total);
const balance = balanceAmountKsh(total);
assert.equal(deposit + balance, total);
assert.equal(resolveMpesaCharge({ expectedAmountKsh: deposit }).amountKsh, deposit);
assert.equal(mpesaPaymentAmountMatchesOrder({ paymentAmountKsh: deposit, expectedAmountKsh: balance }), deposit === balance);
assert.equal(mpesaPaymentAmountMatchesOrder({ paymentAmountKsh: deposit, expectedAmountKsh: total }), false);

console.log("M-Pesa production guard tests passed");
