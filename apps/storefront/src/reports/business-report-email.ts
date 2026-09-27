import type { BusinessReport, Comparable } from "./business-report-service";
import type { ReportKind } from "./report-period";

/**
 * Turns a collected report into an email. Kept free of the database so the
 * layout can be tested and previewed without one.
 *
 * Email clients strip <style> blocks and ignore most modern CSS, so the HTML is
 * tables with inline styles only. Every section is readable on a phone.
 */

export type RenderedEmail = { subject: string; html: string; text: string };

const KIND_NAME: Record<ReportKind, string> = { daily: "日报", weekly: "周报", monthly: "月报" };
const PREVIOUS_NAME: Record<ReportKind, string> = { daily: "前一天", weekly: "上周", monthly: "上月" };

/** worseWhenUp marks rows where a rise is bad news (refunds, returns, cases). */
type Row = { label: string; value: string; change?: string; hint?: string; worseWhenUp?: boolean };
type Section = { title: string; rows: Row[]; table?: { headers: string[]; rows: string[][]; empty: string } };

export function renderBusinessReportEmail(report: BusinessReport): RenderedEmail {
  const { period } = report;
  const vs = PREVIOUS_NAME[period.kind];
  const subject = `Direct Loop ${KIND_NAME[period.kind]} · ${period.label} · 收款 ${ksh(report.sales.cashInKsh.current)}`;
  const sections = buildSections(report, vs);
  return { subject, html: renderHtml(report, subject, sections), text: renderText(report, subject, sections) };
}

function buildSections(report: BusinessReport, vs: string): Section[] {
  const { sales, inventory, warehouse, affiliates, afterSales } = report;
  const averageOrder = sales.paidOrders.current ? Math.round(sales.revenueKsh.current / sales.paidOrders.current) : 0;
  const successRate = sales.paymentAttempts ? `${Math.round((sales.paymentSuccesses / sales.paymentAttempts) * 100)}%` : "—";

  return [
    {
      title: "销售和收款",
      rows: [
        { label: "M-Pesa 实收", value: ksh(sales.cashInKsh.current), change: change(sales.cashInKsh, vs), hint: "期间到账的所有钱，含定金" },
        { label: "成交订单", value: count(sales.paidOrders.current), change: change(sales.paidOrders, vs) },
        { label: "成交金额", value: ksh(sales.revenueKsh.current), change: change(sales.revenueKsh, vs), hint: "付清的订单总额，含配送费" },
        { label: "卖出件数", value: count(sales.itemsSold.current), change: change(sales.itemsSold, vs) },
        { label: "客单价", value: averageOrder ? ksh(averageOrder) : "—" },
        { label: "自提 / 配送", value: `${sales.pickupOrders} / ${sales.deliveryOrders}` },
        { label: "新增定金订单", value: count(sales.newDepositHolds), hint: "付了一半、货在保留中" },
        {
          label: "付款成功率",
          value: successRate,
          hint: `发起 ${sales.paymentAttempts} 次，成功 ${sales.paymentSuccesses}，失败/取消/超时 ${sales.paymentFailures}`
        },
        { label: "已退款", value: ksh(sales.refundsKsh.current), change: change(sales.refundsKsh, vs), worseWhenUp: true, hint: `${sales.refundCount} 笔` },
        ...(sales.paymentsInManualReview
          ? [{ label: "⚠ 待人工核对的付款", value: count(sales.paymentsInManualReview), hint: "作业台 → 订单 → 财务" }]
          : [])
      ]
    },
    {
      title: "库存和上架",
      rows: [
        { label: "新入库", value: count(inventory.stockedIn.current), change: change(inventory.stockedIn, vs) },
        { label: "新上架", value: count(inventory.published.current), change: change(inventory.published, vs) },
        { label: "当前在售", value: `${count(inventory.onSale)} 件`, hint: `标价合计 ${ksh(inventory.onSaleValueKsh)}` },
        { label: "购物车锁定中", value: count(inventory.heldInCarts) },
        { label: "定金保留中", value: count(inventory.heldByDeposit) },
        { label: "还在数字化流程里", value: count(inventory.inDigitisation), hint: "拍照、AI、校准、审核等，还没上架" }
      ],
      table: {
        headers: ["上架最久没卖掉", "价格", "已挂天数"],
        rows: inventory.slowestSellers.map((item) => [
          `${escapeHtml(item.title)} <span style="color:#888">${escapeHtml(item.productCode)}</span>`,
          item.priceKsh === null ? "—" : ksh(item.priceKsh),
          `${item.daysListed} 天`
        ]),
        empty: "没有在售商品"
      }
    },
    {
      title: "仓库作业",
      rows: [
        { label: "期间打包", value: count(warehouse.packed.current), change: change(warehouse.packed, vs) },
        { label: "期间交付完成", value: count(warehouse.completed.current), change: change(warehouse.completed, vs) },
        { label: "配送失败", value: count(warehouse.deliveryFailures) },
        { label: "现在待拣货", value: count(warehouse.queues.toPick) },
        { label: "现在待打包", value: count(warehouse.queues.toPack) },
        { label: "已打包未发出", value: count(warehouse.queues.packedNotSent) },
        { label: "等顾客自提", value: count(warehouse.queues.awaitingPickup) },
        { label: "配送途中", value: count(warehouse.queues.outForDelivery) },
        { label: warehouse.queues.exceptions ? "⚠ 异常订单" : "异常订单", value: count(warehouse.queues.exceptions) },
        {
          label: warehouse.overdue ? "⚠ 付款超过 48 小时还没交付" : "付款超过 48 小时还没交付",
          value: count(warehouse.overdue)
        }
      ],
      table: {
        headers: ["员工", "拣货", "打包"],
        rows: warehouse.byEmployee.map((row) => [escapeHtml(row.name), String(row.picked), String(row.packed)]),
        empty: "期间没有拣货或打包记录"
      }
    },
    {
      title: "分销",
      rows: [
        {
          label: "分销带来的订单",
          value: count(affiliates.affiliateOrders),
          hint: sales.paidOrders.current
            ? `占成交订单 ${Math.round((affiliates.affiliateOrders / sales.paidOrders.current) * 100)}%，金额 ${ksh(affiliates.affiliateRevenueKsh)}`
            : undefined
        },
        { label: "期间产生佣金", value: ksh(affiliates.commissionEarnedKsh), hint: "不含已驳回" },
        { label: "期间已付佣金", value: ksh(affiliates.commissionPaidKsh) }
      ],
      table: {
        headers: ["分销员", "订单", "佣金"],
        rows: affiliates.topAffiliates.map((row) => [escapeHtml(row.name), String(row.orders), ksh(row.commissionKsh)]),
        empty: "期间没有分销订单"
      }
    },
    {
      title: "退货和客服",
      rows: [
        { label: "新退货申请", value: count(afterSales.returnsRequested.current), change: change(afterSales.returnsRequested, vs), worseWhenUp: true },
        { label: "退货已收回", value: count(afterSales.returnsReceived) },
        { label: "新客服工单", value: count(afterSales.casesOpened.current), change: change(afterSales.casesOpened, vs), worseWhenUp: true },
        { label: "现在未关闭工单", value: count(afterSales.openCases) },
        { label: afterSales.overdueCases ? "⚠ 超时工单" : "超时工单", value: count(afterSales.overdueCases) },
        {
          label: afterSales.refundsAwaitingApproval ? "⚠ 等待批准的退款" : "等待批准的退款",
          value: count(afterSales.refundsAwaitingApproval),
          hint: afterSales.refundsAwaitingApproval ? `合计 ${ksh(afterSales.refundsAwaitingApprovalKsh)}` : undefined
        }
      ]
    }
  ];
}

function renderHtml(report: BusinessReport, subject: string, sections: Section[]): string {
  const cell = "padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;vertical-align:top;";
  const body = sections
    .map((section) => {
      const rows = section.rows
        .map(
          (row) => `<tr>
  <td style="${cell}color:#444;">${escapeHtml(row.label)}${row.hint ? `<div style="font-size:12px;color:#999;margin-top:2px;">${escapeHtml(row.hint)}</div>` : ""}</td>
  <td style="${cell}text-align:right;font-weight:600;color:#111;white-space:nowrap;">${escapeHtml(row.value)}${row.change ? `<div style="font-size:12px;font-weight:400;color:${changeColor(row.change, row.worseWhenUp)};margin-top:2px;">${escapeHtml(row.change)}</div>` : ""}</td>
</tr>`
        )
        .join("\n");
      const table = section.table
        ? section.table.rows.length
          ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:12px;">
<tr>${section.table.headers.map((h, i) => `<th style="${cell}background:#fafafa;color:#666;font-weight:600;text-align:${i ? "right" : "left"};">${escapeHtml(h)}</th>`).join("")}</tr>
${section.table.rows.map((r) => `<tr>${r.map((c, i) => `<td style="${cell}text-align:${i ? "right" : "left"};">${c}</td>`).join("")}</tr>`).join("\n")}
</table>`
          : `<p style="font-size:13px;color:#999;margin:12px 0 0;">${escapeHtml(section.table.empty)}</p>`
        : "";
      return `<tr><td style="padding:20px 20px 4px;">
<h2 style="font-size:16px;margin:0 0 8px;color:#111;">${escapeHtml(section.title)}</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
${table}
</td></tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:16px 0;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;">
<tr><td style="padding:20px 20px 0;">
<div style="font-size:12px;color:#888;">Direct Loop · ${escapeHtml(KIND_NAME[report.period.kind])}</div>
<h1 style="font-size:20px;margin:4px 0 0;color:#111;">${escapeHtml(report.period.label)}</h1>
<div style="font-size:12px;color:#999;margin-top:4px;">按内罗毕时间统计。标"现在"的数字是生成报表那一刻的状态（${escapeHtml(nairobiTime(report.generatedAt))}）。</div>
</td></tr>
${body}
<tr><td style="padding:16px 20px 20px;font-size:12px;color:#aaa;">这封邮件由系统自动发送，只读取数据，不会改动任何订单或库存。</td></tr>
</table></td></tr></table>
</body></html>`;
}

function renderText(report: BusinessReport, subject: string, sections: Section[]): string {
  const lines = [subject, `生成时间 ${nairobiTime(report.generatedAt)}（内罗毕时间）`, ""];
  for (const section of sections) {
    lines.push(`【${section.title}】`);
    for (const row of section.rows) {
      lines.push(`- ${row.label}：${row.value}${row.change ? `（${row.change}）` : ""}${row.hint ? ` — ${row.hint}` : ""}`);
    }
    if (section.table) {
      lines.push(`  ${section.table.headers.join(" | ")}`);
      if (!section.table.rows.length) lines.push(`  ${section.table.empty}`);
      for (const row of section.table.rows) lines.push(`  ${row.map(stripTags).join(" | ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function change(value: Comparable, vs: string): string {
  const delta = value.current - value.previous;
  if (value.previous === 0) return value.current === 0 ? `和${vs}持平` : `${vs}为 0`;
  if (delta === 0) return `和${vs}持平`;
  const percent = Math.round((Math.abs(delta) / value.previous) * 100);
  return `比${vs}${delta > 0 ? "↑" : "↓"} ${percent}%`;
}

function changeColor(text: string, worseWhenUp = false) {
  const good = "#15803d";
  const bad = "#b91c1c";
  if (text.includes("↑")) return worseWhenUp ? bad : good;
  if (text.includes("↓")) return worseWhenUp ? good : bad;
  return "#999";
}

export function ksh(amount: number) {
  return `KSh ${Math.round(amount).toLocaleString("en-US")}`;
}

function count(value: number) {
  return value.toLocaleString("en-US");
}

function nairobiTime(instant: Date) {
  return new Date(instant.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
