import { NextResponse } from "next/server";
import { collectBusinessReport } from "../../../../reports/business-report-service";
import { renderBusinessReportEmail } from "../../../../reports/business-report-email";
import { EmailConfigurationError, sendReportEmail } from "../../../../reports/email-sender";
import { isReportKind, reportPeriod } from "../../../../reports/report-period";
import { requireInternalCron } from "../internal-cron-auth";

/**
 * Builds and emails one business report. Cloud Scheduler calls it three times:
 *
 *   ?period=daily    every day at 07:00 Nairobi, about yesterday
 *   ?period=weekly   Mondays at 07:05, about last Monday to Sunday
 *   ?period=monthly  on the 1st at 07:10, about last month
 *
 * By hand, with the same bearer secret:
 *   &date=2026-09-20  report on the period holding that day instead
 *   &preview=1        return the email as a web page and send nothing
 *
 * Read only: it never changes an order, payment, garment or commission.
 */
export async function POST(request: Request) {
  const denied = requireInternalCron(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const kind = url.searchParams.get("period");
  if (!isReportKind(kind)) {
    return NextResponse.json({ error: "period must be daily, weekly or monthly" }, { status: 400 });
  }

  let period;
  try {
    period = reportPeriod(kind, new Date(), url.searchParams.get("date") ?? undefined);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  try {
    const email = renderBusinessReportEmail(await collectBusinessReport(period));
    if (url.searchParams.get("preview") === "1") {
      return new NextResponse(email.html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    const sent = await sendReportEmail({
      ...email,
      idempotencyKey: `business-report/${period.kind}/${period.firstDay}`
    });
    return NextResponse.json({ period: period.kind, label: period.label, sent: true, recipients: sent.to.length, id: sent.id });
  } catch (error) {
    if (error instanceof EmailConfigurationError) {
      // Not worth a scheduler retry: nothing changes until someone sets it up.
      console.warn("business_report_not_configured", error.message);
      return NextResponse.json({ period: period.kind, label: period.label, sent: false, reason: error.message });
    }
    console.error("business_report_failed", error);
    return NextResponse.json({ error: "The business report could not be sent." }, { status: 500 });
  }
}
