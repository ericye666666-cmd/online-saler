/**
 * Sends the business reports by email through Resend (https://resend.com).
 *
 * Resend was picked because it is one HTTPS call with an API key — no SMTP
 * server, no SDK — and its free tier is far more than three reports a month
 * need. Until a domain is verified in Resend, the sender must stay the default
 * onboarding@resend.dev address and mail only reaches the Resend account's own
 * inbox, which is exactly who the reports are for.
 *
 * Configuration (none of it lives in this public repository):
 * - RESEND_API_KEY            from Secret Manager (PRODUCTION_RESEND_API_KEY)
 * - BUSINESS_REPORT_EMAIL_TO  comma-separated recipients
 * - BUSINESS_REPORT_EMAIL_FROM optional, defaults to the Resend test sender
 */

export class EmailConfigurationError extends Error {}

export type OutgoingEmail = {
  subject: string;
  html: string;
  text: string;
  /**
   * Cloud Scheduler retries a job whose call timed out, and a retry must not
   * produce a second copy of the same report. Resend drops a repeat send with
   * the same key for 24 hours.
   */
  idempotencyKey: string;
};

type ReportEnv = Record<string, string | undefined>;

const DEFAULT_FROM = "Direct Loop Reports <onboarding@resend.dev>";

export function reportRecipients(env: ReportEnv = process.env): string[] {
  return (env.BUSINESS_REPORT_EMAIL_TO ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

export async function sendReportEmail(
  email: OutgoingEmail,
  env: ReportEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<{ id: string | null; to: string[] }> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const to = reportRecipients(env);
  if (!apiKey) throw new EmailConfigurationError("RESEND_API_KEY is not set, so the report was built but not sent.");
  if (!to.length) throw new EmailConfigurationError("BUSINESS_REPORT_EMAIL_TO is not set, so there is nobody to send the report to.");

  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "idempotency-key": email.idempotencyKey
    },
    body: JSON.stringify({
      from: env.BUSINESS_REPORT_EMAIL_FROM?.trim() || DEFAULT_FROM,
      to,
      subject: email.subject,
      html: email.html,
      text: email.text
    })
  });

  const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!response.ok) {
    throw new Error(`Resend refused the report (HTTP ${response.status}): ${payload.message ?? "no reason given"}`);
  }
  return { id: payload.id ?? null, to };
}
