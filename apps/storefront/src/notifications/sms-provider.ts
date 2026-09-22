/**
 * SMS delivery. Africa's Talking is the default because it is what reaches a
 * Safaricom handset in Kenya without a WhatsApp Business approval, but the
 * outbox does not care which provider is configured.
 *
 * With nothing configured the provider is "log": messages stay queued, are
 * visible in operations, and nothing is silently dropped. That is deliberate —
 * a missing credential should look like a backlog, not like success.
 */

export class SmsConfigurationError extends Error {}
export class SmsDeliveryError extends Error {
  constructor(message: string, readonly retryable = true) {
    super(message);
  }
}

export type SmsMessage = {
  to: string;
  body: string;
};

export type SmsSendResult = {
  provider: string;
  providerMessageId: string | null;
};

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<SmsSendResult>;
}

/** Queues stay put until a real provider is configured. */
export class LoggingSmsProvider implements SmsProvider {
  readonly name = "log";

  async send(message: SmsMessage): Promise<SmsSendResult> {
    throw new SmsDeliveryError(
      `No SMS provider is configured, so the message to ${message.to} stays queued. Set AFRICASTALKING_API_KEY and AFRICASTALKING_USERNAME to start sending.`
    );
  }
}

export type AfricasTalkingConfig = {
  username: string;
  apiKey: string;
  senderId?: string;
  baseUrl: string;
};

type AfricasTalkingResponse = {
  SMSMessageData?: {
    Recipients?: Array<{
      number?: string;
      status?: string;
      statusCode?: number;
      messageId?: string;
    }>;
    Message?: string;
  };
};

export class AfricasTalkingSmsProvider implements SmsProvider {
  readonly name = "africastalking";

  constructor(
    private readonly config: AfricasTalkingConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async send(message: SmsMessage): Promise<SmsSendResult> {
    const form = new URLSearchParams({
      username: this.config.username,
      to: `+${message.to.replace(/^\+/, "")}`,
      message: message.body
    });
    if (this.config.senderId) form.set("from", this.config.senderId);

    const response = await this.fetchImpl(`${this.config.baseUrl}/version1/messaging`, {
      method: "POST",
      headers: {
        apiKey: this.config.apiKey,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json"
      },
      body: form.toString(),
      cache: "no-store"
    });
    const body = (await response.json().catch(() => ({}))) as AfricasTalkingResponse;
    const recipient = body.SMSMessageData?.Recipients?.[0];

    if (!response.ok) {
      // 4xx other than rate limiting is a bad request; retrying will not help.
      throw new SmsDeliveryError(
        body.SMSMessageData?.Message || `SMS provider returned ${response.status}.`,
        response.status === 429 || response.status >= 500
      );
    }
    if (!recipient) {
      throw new SmsDeliveryError(body.SMSMessageData?.Message || "SMS provider accepted no recipients.", false);
    }
    // 100 Processed, 101 Sent, 102 Queued are all accepted.
    if (recipient.statusCode !== undefined && recipient.statusCode > 102) {
      throw new SmsDeliveryError(
        `${recipient.status ?? "Rejected"} (${recipient.statusCode}) for ${recipient.number ?? message.to}.`,
        recipient.statusCode >= 500
      );
    }
    return { provider: this.name, providerMessageId: recipient.messageId ?? null };
  }
}

export function smsProviderFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): SmsProvider {
  const username = env.AFRICASTALKING_USERNAME?.trim();
  const apiKey = env.AFRICASTALKING_API_KEY?.trim();
  if (!username || !apiKey) return new LoggingSmsProvider();
  return new AfricasTalkingSmsProvider(
    {
      username,
      apiKey,
      senderId: env.AFRICASTALKING_SENDER_ID?.trim() || undefined,
      baseUrl: env.AFRICASTALKING_BASE_URL?.trim()
        || (username === "sandbox" ? "https://api.sandbox.africastalking.com" : "https://api.africastalking.com")
    },
    fetchImpl
  );
}
