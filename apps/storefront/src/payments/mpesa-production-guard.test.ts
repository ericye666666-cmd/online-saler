import assert from "node:assert/strict";
import {
  MpesaProductionGuardError,
  mpesaPaymentAmountMatchesOrder,
  resolveMpesaCharge
} from "./mpesa-production-guard";

// Every shopper is charged the order total. Nothing in the environment can
// shrink the amount or restrict who may pay.
assert.deepEqual(resolveMpesaCharge({ orderAmountKsh: 1250 }), { amountKsh: 1250, orderAmountKsh: 1250 });

for (const invalid of [0, -5, 12.5, Number.NaN]) {
  assert.throws(() => resolveMpesaCharge({ orderAmountKsh: invalid }), MpesaProductionGuardError);
}

// A callback only settles an order when it paid the full total.
assert.equal(mpesaPaymentAmountMatchesOrder({ paymentAmountKsh: 1250, orderAmountKsh: 1250 }), true);
assert.equal(mpesaPaymentAmountMatchesOrder({ paymentAmountKsh: 1, orderAmountKsh: 1250 }), false);

console.log("M-Pesa production guard tests passed");
