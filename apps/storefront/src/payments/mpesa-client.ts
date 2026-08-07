import { createHash } from "node:crypto";

export type MpesaConfig = {
  environment: "sandbox" | "production";
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackBaseUrl: string;
  callbackUrl?: string;
  transactionType: string;
  accountReferencePrefix: string;
  oauthUrl: string;
  stkPushUrl: string;
};

export type MpesaStkPushRequest = {
  amountKsh: number;
  phone: string;
  orderNumber: string;
};

export type MpesaStkPushResponse = {
  merchantRequestId: string | null;
  checkoutRequestId: string | null;
  responseCode: string | null;
  responseDescription: string | null;
  customerMessage: string | null;
  raw: unknown;
};

export class MpesaConfigurationError extends Error {}
export class MpesaProviderError extends Error {
  constructor(message: string, readonly raw?: unknown) {
    super(message);
  }
}

type OAuthResponse = {
  access_token?: string;
  expires_in?: string;
  errorCode?: string;
  errorMessage?: string;
};

type StkResponse = {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  CustomerMessage?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type FetchLike = typeof fetch;

export function mpesaConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MpesaConfig {
  const environment = mpesaEnvironmentFromEnv(env);
  const baseUrl = environment === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  const explicitCallbackUrl = env.MPESA_CALLBACK_URL?.trim() || undefined;
  const config: MpesaConfig = {
    environment,
    consumerKey: required(env.MPESA_CONSUMER_KEY, "MPESA_CONSUMER_KEY"),
    consumerSecret: required(env.MPESA_CONSUMER_SECRET, "MPESA_CONSUMER_SECRET"),
    shortcode: required(env.MPESA_SHORTCODE, "MPESA_SHORTCODE"),
    passkey: required(env.MPESA_PASSKEY, "MPESA_PASSKEY"),
    callbackBaseUrl: callbackBaseUrlFromEnv(env, explicitCallbackUrl),
    callbackUrl: explicitCallbackUrl,
    transactionType: env.MPESA_TRANSACTION_TYPE?.trim() || "CustomerPayBillOnline",
    accountReferencePrefix: env.MPESA_ACCOUNT_REFERENCE_PREFIX?.trim() || "DLOOP",
    oauthUrl: env.MPESA_OAUTH_URL?.trim() || `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    stkPushUrl: env.MPESA_STK_PUSH_URL?.trim() || `${baseUrl}/mpesa/stkpush/v1/processrequest`
  };
  assertMpesaProductionConfig(config);
  return config;
}

export class MpesaClient {
  constructor(
    readonly config: MpesaConfig,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async initiateStkPush(input: MpesaStkPushRequest): Promise<MpesaStkPushResponse> {
    const token = await this.fetchAccessToken();
    const timestamp = mpesaTimestamp();
    const password = Buffer.from(`${this.config.shortcode}${this.config.passkey}${timestamp}`).toString("base64");
    const accountReference = mpesaAccountReference(this.config.accountReferencePrefix, input.orderNumber);
    const callbackUrl = mpesaCallbackUrl(this.config);

    const payload = {
      BusinessShortCode: this.config.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: this.config.transactionType,
      Amount: input.amountKsh,
      PartyA: input.phone,
      PartyB: this.config.shortcode,
      PhoneNumber: input.phone,
      CallBackURL: callbackUrl,
      AccountReference: accountReference,
      TransactionDesc: `Direct Loop order ${input.orderNumber}`
    };

    const response = await this.fetchImpl(this.config.stkPushUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });
    const body = (await response.json().catch(() => ({}))) as StkResponse;
    if (!response.ok || body.errorCode || (body.ResponseCode && body.ResponseCode !== "0")) {
      throw new MpesaProviderError(body.errorMessage || body.ResponseDescription || "M-Pesa STK Push request failed.", body);
    }

    return {
      merchantRequestId: body.MerchantRequestID ?? null,
      checkoutRequestId: body.CheckoutRequestID ?? null,
      responseCode: body.ResponseCode ?? null,
      responseDescription: body.ResponseDescription ?? null,
      customerMessage: body.CustomerMessage ?? null,
      raw: body
    };
  }

  private async fetchAccessToken(): Promise<string> {
    const credentials = Buffer.from(`${this.config.consumerKey}:${this.config.consumerSecret}`).toString("base64");
    const response = await this.fetchImpl(this.config.oauthUrl, {
      headers: {
        authorization: `Basic ${credentials}`
      },
      cache: "no-store"
    });
    const body = (await response.json().catch(() => ({}))) as OAuthResponse;
    if (!response.ok || !body.access_token) {
      throw new MpesaProviderError(body.errorMessage || "M-Pesa OAuth token request failed.", body);
    }
    return body.access_token;
  }
}

function required(value: string | undefined, name: string): string {
  const next = value?.trim();
  if (!next) throw new MpesaConfigurationError(`${name} is required for M-Pesa payments.`);
  return next;
}

function mpesaEnvironmentFromEnv(env: NodeJS.ProcessEnv): "sandbox" | "production" {
  const value = env.MPESA_ENV?.trim() || env.MPESA_ENVIRONMENT?.trim() || "sandbox";
  if (value === "sandbox" || value === "production") return value;
  throw new MpesaConfigurationError("MPESA_ENV must be sandbox or production.");
}

function assertMpesaProductionConfig(config: MpesaConfig): void {
  if (config.environment !== "production") return;

  if (config.transactionType !== "CustomerBuyGoodsOnline") {
    throw new MpesaConfigurationError("Production M-Pesa Till payments must use CustomerBuyGoodsOnline.");
  }

  const callbackUrl = mpesaCallbackUrl(config);
  const parsedCallbackUrl = new URL(callbackUrl);
  if (parsedCallbackUrl.protocol !== "https:") {
    throw new MpesaConfigurationError("Production M-Pesa callback URL must use HTTPS.");
  }
}

function callbackBaseUrlFromEnv(env: NodeJS.ProcessEnv, explicitCallbackUrl: string | undefined): string {
  const configuredBase = env.MPESA_CALLBACK_BASE_URL?.trim() || env.STOREFRONT_PUBLIC_URL?.trim();
  if (configuredBase) return configuredBase;
  if (explicitCallbackUrl) return new URL(explicitCallbackUrl).origin;
  throw new MpesaConfigurationError("MPESA_CALLBACK_URL or MPESA_CALLBACK_BASE_URL is required for M-Pesa payments.");
}

export function mpesaCallbackUrl(config: Pick<MpesaConfig, "callbackBaseUrl" | "callbackUrl">): string {
  return config.callbackUrl?.trim() || new URL("/api/payments/mpesa/callback", withTrailingSlash(config.callbackBaseUrl)).toString();
}

export function mpesaTimestamp(now = new Date()): string {
  const kenyaTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return [
    kenyaTime.getUTCFullYear().toString().padStart(4, "0"),
    (kenyaTime.getUTCMonth() + 1).toString().padStart(2, "0"),
    kenyaTime.getUTCDate().toString().padStart(2, "0"),
    kenyaTime.getUTCHours().toString().padStart(2, "0"),
    kenyaTime.getUTCMinutes().toString().padStart(2, "0"),
    kenyaTime.getUTCSeconds().toString().padStart(2, "0")
  ].join("");
}

export function mpesaAccountReference(prefix: string, orderNumber: string): string {
  const clean = `${prefix}${orderNumber}`.replace(/[^A-Za-z0-9]/g, "");
  if (clean.length <= 12) return clean;
  const digest = createHash("sha1").update(clean).digest("hex").slice(0, 4).toUpperCase();
  return `${clean.slice(-8)}${digest}`.slice(0, 12);
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
