import assert from "node:assert/strict";
import { MpesaClient, mpesaAccountReference, mpesaTimestamp, type MpesaConfig } from "./mpesa-client";

assert.equal(mpesaTimestamp(new Date("2026-07-30T09:08:07.000Z")), "20260730120807");
assert.equal(mpesaAccountReference("DLOOP", "DL-20260730-ABCDEF12").length, 12);

const calls: Array<{ url: string; init?: RequestInit }> = [];
const fetchMock = (async (url: string | URL | Request, init?: RequestInit) => {
  calls.push({ url: String(url), init });
  if (calls.length === 1) {
    assert.equal(String(url), "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials");
    assert.equal((init?.headers as Record<string, string>).authorization.startsWith("Basic "), true);
    return Response.json({ access_token: "token" });
  }

  const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
  assert.equal(String(url), "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest");
  assert.equal((init?.headers as Record<string, string>).authorization, "Bearer token");
  assert.equal(body.BusinessShortCode, "174379");
  assert.equal(body.TransactionType, "CustomerPayBillOnline");
  assert.equal(body.Amount, 1200);
  assert.equal(body.PartyA, "254712345678");
  assert.equal(body.PhoneNumber, "254712345678");
  assert.equal(body.CallBackURL, "https://storefront.example.com/api/payments/mpesa/callback");

  return Response.json({
    MerchantRequestID: "merchant-1",
    CheckoutRequestID: "checkout-1",
    ResponseCode: "0",
    ResponseDescription: "Success. Request accepted for processing",
    CustomerMessage: "Success. Request accepted for processing"
  });
}) as typeof fetch;

const config: MpesaConfig = {
  environment: "sandbox",
  consumerKey: "key",
  consumerSecret: "secret",
  shortcode: "174379",
  passkey: "passkey",
  callbackBaseUrl: "https://storefront.example.com",
  transactionType: "CustomerPayBillOnline",
  accountReferencePrefix: "DLOOP",
  oauthUrl: "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
  stkPushUrl: "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
};

async function main() {
  const result = await new MpesaClient(config, fetchMock).initiateStkPush({
    amountKsh: 1200,
    phone: "254712345678",
    orderNumber: "DL-20260730-ABCDEF12"
  });

  assert.equal(result.checkoutRequestId, "checkout-1");
  assert.equal(result.merchantRequestId, "merchant-1");
  assert.equal(calls.length, 2);

  console.log("M-Pesa client tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
