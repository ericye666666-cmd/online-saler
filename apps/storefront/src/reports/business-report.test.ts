import assert from "node:assert/strict";
import { change, renderBusinessReportEmail } from "./business-report-email";
import type { BusinessReport } from "./business-report-service";
import { reportRecipients, sendReportEmail } from "./email-sender";
import { reportPeriod } from "./report-period";

// --- Periods -----------------------------------------------------------------

// 07:00 Nairobi on Monday 2026-09-28 is 04:00 UTC. The daily report is about
// Sunday, midnight to midnight in Nairobi, which is 21:00 UTC the day before.
const mondayMorning = new Date("2026-09-28T04:00:00Z");
const daily = reportPeriod("daily", mondayMorning);
assert.equal(daily.label, "2026-09-27");
assert.equal(daily.start.toISOString(), "2026-09-26T21:00:00.000Z");
assert.equal(daily.end.toISOString(), "2026-09-27T21:00:00.000Z");
assert.equal(daily.previousStart.toISOString(), "2026-09-25T21:00:00.000Z");
assert.equal(daily.previousEnd.toISOString(), daily.start.toISOString());

// Just after midnight in Nairobi it is still the previous evening in UTC. The
// report must follow the Nairobi calendar, not the server's.
assert.equal(reportPeriod("daily", new Date("2026-09-27T21:30:00Z")).label, "2026-09-27");
assert.equal(reportPeriod("daily", new Date("2026-09-27T20:30:00Z")).label, "2026-09-26");

// The Monday weekly report covers last Monday to Sunday, never the week that
// has only just started.
const weekly = reportPeriod("weekly", mondayMorning);
assert.equal(weekly.label, "2026-09-21 ~ 2026-09-27");
assert.equal(weekly.start.toISOString(), "2026-09-20T21:00:00.000Z");
assert.equal(weekly.end.toISOString(), "2026-09-27T21:00:00.000Z");
assert.equal(weekly.previousStart.toISOString(), "2026-09-13T21:00:00.000Z");

// Monthly on the 1st is about the month that just ended, and its comparison is
// the month before — lengths differ and that is fine.
const monthly = reportPeriod("monthly", new Date("2026-10-01T04:10:00Z"));
assert.equal(monthly.label, "2026-09");
assert.equal(monthly.firstDay, "2026-09-01");
assert.equal(monthly.lastDay, "2026-09-30");
assert.equal(monthly.start.toISOString(), "2026-08-31T21:00:00.000Z");
assert.equal(monthly.end.toISOString(), "2026-09-30T21:00:00.000Z");
assert.equal(monthly.previousStart.toISOString(), "2026-07-31T21:00:00.000Z");
assert.equal(reportPeriod("monthly", new Date("2027-01-01T04:10:00Z")).label, "2026-12");

// A hand-picked date reports on the period that holds it.
assert.equal(reportPeriod("weekly", mondayMorning, "2026-09-16").label, "2026-09-14 ~ 2026-09-20");
assert.equal(reportPeriod("monthly", mondayMorning, "2026-02-10").lastDay, "2026-02-28");
assert.equal(reportPeriod("daily", mondayMorning, "2026-09-01").start.toISOString(), "2026-08-31T21:00:00.000Z");
assert.throws(() => reportPeriod("daily", mondayMorning, "2026-02-30"), RangeError);
assert.throws(() => reportPeriod("daily", mondayMorning, "yesterday"), RangeError);

// --- Change against the previous period ----------------------------------------

assert.equal(change({ current: 150, previous: 100 }, "上周"), "比上周↑ 50%");
assert.equal(change({ current: 50, previous: 100 }, "上周"), "比上周↓ 50%");
assert.equal(change({ current: 3, previous: 3 }, "上周"), "和上周持平");
assert.equal(change({ current: 0, previous: 0 }, "上周"), "和上周持平");
assert.equal(change({ current: 4, previous: 0 }, "上周"), "上周为 0");

// --- Email ---------------------------------------------------------------------

function sampleReport(): BusinessReport {
  const same = (current: number, previous = current) => ({ current, previous });
  return {
    period: daily,
    generatedAt: mondayMorning,
    sales: {
      paidOrders: same(4, 2),
      revenueKsh: same(3200, 1600),
      itemsSold: same(5, 2),
      cashInKsh: same(3500, 1600),
      newDepositHolds: 1,
      paymentAttempts: 8,
      paymentSuccesses: 6,
      paymentFailures: 2,
      refundsKsh: same(400, 200),
      refundCount: 1,
      pickupOrders: 3,
      deliveryOrders: 1,
      paymentsInManualReview: 1
    },
    inventory: {
      stockedIn: same(20, 10),
      published: same(18),
      onSale: 640,
      onSaleValueKsh: 512000,
      heldInCarts: 2,
      heldByDeposit: 1,
      inDigitisation: 37,
      slowestSellers: [{ productCode: "P-0001", title: "Denim <jacket> & co", priceKsh: 900, daysListed: 41 }]
    },
    warehouse: {
      queues: { toPick: 1, toPack: 2, packedNotSent: 0, awaitingPickup: 3, outForDelivery: 1, exceptions: 0 },
      overdue: 2,
      packed: same(4),
      completed: same(3),
      deliveryFailures: 0,
      byEmployee: [{ name: "Wanjiku", picked: 3, packed: 4 }]
    },
    affiliates: {
      affiliateOrders: 2,
      affiliateRevenueKsh: 1500,
      commissionEarnedKsh: 150,
      commissionPaidKsh: 0,
      topAffiliates: []
    },
    afterSales: {
      returnsRequested: same(1, 0),
      returnsReceived: 0,
      casesOpened: same(2, 4),
      openCases: 3,
      overdueCases: 0,
      refundsAwaitingApproval: 0,
      refundsAwaitingApprovalKsh: 0
    }
  };
}

const email = renderBusinessReportEmail(sampleReport());
assert.equal(email.subject, "Direct Loop 日报 · 2026-09-27 · 收款 KSh 3,500");
for (const heading of ["销售和收款", "库存和上架", "仓库作业", "分销", "退货和客服"]) {
  assert.ok(email.html.includes(heading), `html has ${heading}`);
  assert.ok(email.text.includes(`【${heading}】`), `text has ${heading}`);
}
assert.ok(email.html.includes("比前一天↑ 100%"), "revenue doubled against the day before");
assert.ok(email.html.includes("⚠ 待人工核对的付款"), "a payment waiting for review is flagged");
assert.ok(email.html.includes("⚠ 付款超过 48 小时还没交付"), "late orders are flagged");
assert.ok(!email.html.includes("⚠ 异常订单"), "no exceptions, no warning");
assert.ok(email.html.includes("期间没有分销订单"), "an empty table says so instead of vanishing");

// Product titles come from staff input and must not become markup.
assert.ok(email.html.includes("Denim &lt;jacket&gt; &amp; co"));
assert.ok(!email.html.includes("<jacket>"));
assert.ok(email.text.includes("Denim <jacket> & co P-0001"), "plain text reads naturally");

// More refunds is bad news and must not be painted green.
const refundRow = email.html.slice(email.html.indexOf("已退款"), email.html.indexOf("已退款") + 600);
assert.ok(refundRow.includes("#b91c1c"), "a rise in refunds is red");

// --- Sending -------------------------------------------------------------------

assert.deepEqual(reportRecipients({ BUSINESS_REPORT_EMAIL_TO: " a@example.com, ,b@example.com " }), [
  "a@example.com",
  "b@example.com"
]);

const calls: Array<{ url: string; init: RequestInit }> = [];
const fakeFetch = (async (url: string, init: RequestInit) => {
  calls.push({ url, init });
  return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
}) as unknown as typeof fetch;

(async () => {
  const outgoing = { ...email, idempotencyKey: "business-report/daily/2026-09-27" };

  await assert.rejects(sendReportEmail(outgoing, { BUSINESS_REPORT_EMAIL_TO: "a@example.com" }, fakeFetch), /RESEND_API_KEY/);
  await assert.rejects(sendReportEmail(outgoing, { RESEND_API_KEY: "re_test" }, fakeFetch), /BUSINESS_REPORT_EMAIL_TO/);
  assert.equal(calls.length, 0, "nothing is sent while unconfigured");

  const sent = await sendReportEmail(outgoing, { RESEND_API_KEY: "re_test", BUSINESS_REPORT_EMAIL_TO: "a@example.com" }, fakeFetch);
  assert.deepEqual(sent, { id: "email_123", to: ["a@example.com"] });
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(headers["idempotency-key"], "business-report/daily/2026-09-27", "a scheduler retry cannot send twice");
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.from, "Direct Loop Reports <onboarding@resend.dev>");
  assert.deepEqual(body.to, ["a@example.com"]);

  const refusing = (async () => new Response(JSON.stringify({ message: "invalid key" }), { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(
    sendReportEmail(outgoing, { RESEND_API_KEY: "re_bad", BUSINESS_REPORT_EMAIL_TO: "a@example.com" }, refusing),
    /HTTP 401\): invalid key/
  );

  console.log("business report tests ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
