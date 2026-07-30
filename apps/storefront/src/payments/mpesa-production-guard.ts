export type MpesaLaunchMode = "sandbox" | "one_ksh" | "live";

export type MpesaChargeDecision = {
  amountKsh: number;
  launchMode: MpesaLaunchMode;
  orderAmountKsh: number;
};

export class MpesaProductionGuardError extends Error {}

type ResolveChargeInput = {
  environment: "sandbox" | "production";
  orderAmountKsh: number;
  phone: string;
  env?: NodeJS.ProcessEnv;
};

type VerifyAmountInput = {
  environment: "sandbox" | "production";
  paymentAmountKsh: number;
  orderAmountKsh: number;
  phone: string;
  env?: NodeJS.ProcessEnv;
};

export function resolveMpesaCharge(input: ResolveChargeInput): MpesaChargeDecision {
  const env = input.env ?? process.env;
  if (!Number.isInteger(input.orderAmountKsh) || input.orderAmountKsh <= 0) {
    throw new MpesaProductionGuardError("M-Pesa amount must be a positive whole KSh value.");
  }

  if (input.environment !== "production") {
    return {
      amountKsh: input.orderAmountKsh,
      launchMode: "sandbox",
      orderAmountKsh: input.orderAmountKsh
    };
  }

  const launchMode = productionLaunchMode(env);
  if (launchMode === "one_ksh") {
    ensureWhitelistedPhone(input.phone, env);
    return {
      amountKsh: productionTestAmount(env),
      launchMode,
      orderAmountKsh: input.orderAmountKsh
    };
  }

  return {
    amountKsh: input.orderAmountKsh,
    launchMode,
    orderAmountKsh: input.orderAmountKsh
  };
}

export function mpesaPaymentAmountMatchesOrder(input: VerifyAmountInput): boolean {
  if (input.paymentAmountKsh === input.orderAmountKsh) return true;
  if (input.environment !== "production") return false;
  const env = input.env ?? process.env;
  if (productionLaunchMode(env) !== "one_ksh") return false;
  if (input.paymentAmountKsh !== productionTestAmount(env)) return false;
  return phoneIsWhitelisted(input.phone, env);
}

export function productionLaunchMode(env: NodeJS.ProcessEnv = process.env): "one_ksh" | "live" {
  const configured = env.MPESA_PRODUCTION_LAUNCH_MODE?.trim().toLowerCase();
  if (!configured || configured === "one_ksh") return "one_ksh";
  if (configured === "live") return "live";
  throw new MpesaProductionGuardError("MPESA_PRODUCTION_LAUNCH_MODE must be one_ksh or live.");
}

export function productionTestAmount(env: NodeJS.ProcessEnv = process.env): number {
  const value = env.MPESA_TEST_AMOUNT_KSH?.trim() || "1";
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new MpesaProductionGuardError("MPESA_TEST_AMOUNT_KSH must be a positive whole KSh value.");
  }
  return amount;
}

function ensureWhitelistedPhone(phone: string, env: NodeJS.ProcessEnv): void {
  if (!phoneIsWhitelisted(phone, env)) {
    throw new MpesaProductionGuardError("M-Pesa production test mode only allows whitelisted phone numbers.");
  }
}

function phoneIsWhitelisted(phone: string, env: NodeJS.ProcessEnv): boolean {
  const whitelist = parsePhoneWhitelist(env.MPESA_TEST_PHONE_WHITELIST);
  return whitelist.has(normalizePhoneForWhitelist(phone));
}

function parsePhoneWhitelist(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map(normalizePhoneForWhitelist)
  );
}

function normalizePhoneForWhitelist(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  return digits;
}
