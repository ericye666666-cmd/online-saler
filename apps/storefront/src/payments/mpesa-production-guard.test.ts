import assert from "node:assert/strict";
import {
  MpesaProductionGuardError,
  mpesaPaymentAmountMatchesOrder,
  resolveMpesaCharge
} from "./mpesa-production-guard";

const whitelistEnv = {
  NODE_ENV: "test" as const,
  MPESA_PRODUCTION_LAUNCH_MODE: "one_ksh",
  MPESA_TEST_AMOUNT_KSH: "1",
  MPESA_TEST_PHONE_WHITELIST: "0712345678,+254722222222"
};

const oneKshCharge = resolveMpesaCharge({
  environment: "production",
  orderAmountKsh: 1250,
  phone: "254712345678",
  env: whitelistEnv
});
assert.deepEqual(oneKshCharge, {
  amountKsh: 1,
  launchMode: "one_ksh",
  orderAmountKsh: 1250
});

assert.throws(
  () => resolveMpesaCharge({
    environment: "production",
    orderAmountKsh: 1250,
    phone: "254733333333",
    env: whitelistEnv
  }),
  MpesaProductionGuardError
);

assert.equal(
  mpesaPaymentAmountMatchesOrder({
    environment: "production",
    paymentAmountKsh: 1,
    orderAmountKsh: 1250,
    phone: "0712345678",
    env: whitelistEnv
  }),
  true
);

assert.equal(
  mpesaPaymentAmountMatchesOrder({
    environment: "production",
    paymentAmountKsh: 1,
    orderAmountKsh: 1250,
    phone: "0733333333",
    env: whitelistEnv
  }),
  false
);

assert.equal(
  resolveMpesaCharge({
    environment: "production",
    orderAmountKsh: 1250,
    phone: "254733333333",
    env: { NODE_ENV: "test" as const, MPESA_PRODUCTION_LAUNCH_MODE: "live", MPESA_TEST_PHONE_WHITELIST: "" }
  }).amountKsh,
  1250
);

assert.equal(
  resolveMpesaCharge({
    environment: "sandbox",
    orderAmountKsh: 1250,
    phone: "254733333333",
    env: { NODE_ENV: "test" as const }
  }).amountKsh,
  1250
);

console.log("M-Pesa production guard tests passed");
