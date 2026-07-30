import assert from "node:assert/strict";
import { parseMpesaCallback, PaymentValidationError } from "./payment-service";

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

console.log("Payment callback parsing tests passed");
