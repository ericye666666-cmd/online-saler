import assert from "node:assert/strict";
import { PaymentKind } from "@online-saler/database";
import { expectedLegAmountKsh, parseMpesaCallback, PaymentValidationError } from "./payment-service";

const parsed = parseMpesaCallback({
  Body: {
    stkCallback: {
      MerchantRequestID: "29115-34620561-1",
      CheckoutRequestID: "ws_CO_30072026120100123456789",
      ResultCode: 0,
      ResultDesc: "The service request is processed successfully.",
      CallbackMetadata: {
        Item: [
          { Name: "Amount", Value: 1150 },
          { Name: "MpesaReceiptNumber", Value: "TGU7R8XYZ1" },
          { Name: "TransactionDate", Value: 20260730120100 },
          { Name: "PhoneNumber", Value: 254712345678 }
        ]
      }
    }
  }
});

assert.equal(parsed.merchantRequestId, "29115-34620561-1");
assert.equal(parsed.checkoutRequestId, "ws_CO_30072026120100123456789");
assert.equal(parsed.resultCode, 0);
assert.equal(parsed.amountKsh, 1150);
assert.equal(parsed.receiptNumber, "TGU7R8XYZ1");
assert.equal(parsed.phone, "254712345678");
assert.equal(parsed.transactionDate?.toISOString(), "2026-07-30T09:01:00.000Z");

assert.throws(
  () => parseMpesaCallback({ Body: { stkCallback: { ResultCode: 0 } } }),
  PaymentValidationError
);

assert.throws(() => parseMpesaCallback(null), PaymentValidationError);

// A deposit order is charged in two prompts and neither equals the order
// total, so the amount guard has to ask for the leg. Getting this wrong is how
// a half payment settles a whole order.
const depositOrder = { totalKsh: 1000, depositKsh: 500, balanceKsh: 500 };
assert.equal(expectedLegAmountKsh(depositOrder, PaymentKind.DEPOSIT), 500);
assert.equal(expectedLegAmountKsh(depositOrder, PaymentKind.BALANCE), 500);
assert.equal(expectedLegAmountKsh(depositOrder, PaymentKind.FULL), 1000);

// A pay-in-full order carries zeroes in both plan columns, so FULL is the only
// leg that can ever be charged on it.
const fullOrder = { totalKsh: 1000, depositKsh: 0, balanceKsh: 0 };
assert.equal(expectedLegAmountKsh(fullOrder, PaymentKind.FULL), 1000);
assert.equal(expectedLegAmountKsh(fullOrder, PaymentKind.DEPOSIT), 0);

// An odd total splits unevenly, and each leg must still be charged its own
// figure rather than a rounded half of the order.
const oddOrder = { totalKsh: 1001, depositKsh: 501, balanceKsh: 500 };
assert.equal(expectedLegAmountKsh(oddOrder, PaymentKind.DEPOSIT), 501);
assert.equal(expectedLegAmountKsh(oddOrder, PaymentKind.BALANCE), 500);
assert.notEqual(
  expectedLegAmountKsh(oddOrder, PaymentKind.DEPOSIT),
  expectedLegAmountKsh(oddOrder, PaymentKind.BALANCE)
);

console.log("Payment callback parsing tests passed");
