"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { MessageCircleIcon, RefreshCwIcon, SendIcon } from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { t } from "@/i18n/runtime";

import {
  CASE_STATUS_LABELS,
  CASE_TYPE_LABELS,
  PRIORITY_LABELS,
  REFUND_STATUS_LABELS,
  money,
  serviceDeskRequest,
  slaLabel,
  when,
  type CaseStatus,
  type Order360
} from "../../service-desk-api";

/**
 * Everything about one order, on one screen.
 *
 * The point of this page is that an agent with a customer on the phone never
 * has to ring the warehouse, the store or the rider to say where the order is.
 * It is read-only by design: the only buttons here either send the customer
 * something (a new delivery code) or open a case for somebody who is allowed to
 * act. Price, stock, payment status and promoter attribution are shown and
 * cannot be touched.
 */
export function Order360Page({ orderId }: { orderId: string }) {
  const { session, hasPermission } = useOperationsSession();
  const accessToken = session?.accessToken ?? "";
  const [view, setView] = useState<Order360 | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [contact, setContact] = useState({ phone: "", deliveryAddress: "", reason: "" });

  const canResendCode = hasPermission("orders.resend-code");
  const canNote = hasPermission("action.customer-service.create");
  const canEditContact = hasPermission("customer-service.contact-update");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setBusy(true);
    setError("");
    try {
      setView(await serviceDeskRequest<Order360>(accessToken, `/operations/customer-service/orders/${orderId}/overview`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("无法读取订单详情。"));
    } finally {
      setBusy(false);
    }
  }, [accessToken, orderId]);

  useEffect(() => { void load(); }, [load]);

  async function act(path: string, body: unknown, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await serviceDeskRequest(accessToken, path, { method: "POST", body: JSON.stringify(body) });
      setMessage(success);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("操作失败。"));
    } finally {
      setBusy(false);
    }
  }

  async function saveContact() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await serviceDeskRequest(accessToken, "/operations/customer-service/contact", {
        method: "PATCH",
        body: JSON.stringify({
          customerId: view?.customer.id,
          orderId,
          ...(contact.phone.trim() ? { phone: contact.phone.trim() } : {}),
          ...(contact.deliveryAddress.trim() ? { deliveryAddress: contact.deliveryAddress.trim() } : {}),
          reason: contact.reason
        })
      });
      setContact({ phone: "", deliveryAddress: "", reason: "" });
      setMessage(t("联系信息已更新。"));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("更新联系信息失败。"));
    } finally {
      setBusy(false);
    }
  }

  if (!view) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-semibold text-2xl tracking-tight">{t("订单 360")}</h1>
        {error ? <StatusMessage tone="danger">{error}</StatusMessage> : <p className="text-muted-foreground text-sm">{t("正在读取…")}</p>}
      </div>
    );
  }

  const { customer, order, payment, fulfillment, promoter } = view;
  const outForDelivery = fulfillment?.status === "OUT_FOR_DELIVERY";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">{t("客户服务")}</p>
          <h1 className="font-mono font-semibold text-2xl tracking-tight">{order.orderNumber}</h1>
          <p className="text-muted-foreground text-sm">{t("这一页只读。改价格、改库存、改支付状态都不在客服权限内。")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {customer.whatsAppUrl ? (
            <Button variant="outline" asChild>
              <a href={customer.whatsAppUrl} target="_blank" rel="noreferrer noopener">
                <MessageCircleIcon data-icon="inline-start" />
                {t("WhatsApp 联系")}
              </a>
            </Button>
          ) : null}
          {canResendCode && outForDelivery ? (
            <Button
              disabled={busy}
              onClick={() => void act(`/operations/orders/${orderId}/resend-delivery-code`, {}, t("新的配送码已发送给顾客。"))}
            >
              <SendIcon data-icon="inline-start" />
              {t("重发配送码")}
            </Button>
          ) : null}
          <Button variant="outline" disabled={busy} onClick={() => void load()}>
            <RefreshCwIcon data-icon="inline-start" />
            {t("刷新")}
          </Button>
        </div>
      </div>

      {message ? <StatusMessage>{message}</StatusMessage> : null}
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      {canResendCode && outForDelivery ? (
        <p className="text-muted-foreground text-xs">
          {t("重发会生成一个新的配送码并短信给顾客，旧码立刻失效。客服界面永远看不到码本身。")}
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <DetailCard title={t("顾客")} description={t("只有电话和地址可以由客服更正。")}>
          <Row label={t("姓名")} value={customer.name || t("访客顾客")} />
          <Row label={t("电话")} value={customer.phone} mono />
          <Row label={t("WhatsApp")} value={customer.whatsappPhone} mono />
          <Row label={t("默认地址")} value={customer.defaultAddress} />
          <Row label={t("账号状态")} value={customer.status} />
        </DetailCard>

        <DetailCard title={t("订单")} description={when(order.createdAt)}>
          <Row label={t("订单号")} value={order.orderNumber} mono />
          <Row label={t("订单状态")} value={order.status} />
          <Row label={t("履约方式")} value={order.fulfillmentMethod === "PICKUP" ? t("仓库自提") : t("Kikuyu配送")} />
          <Row label={t("配送地址")} value={order.deliveryAddress} />
          <Row label={t("自提/配送门店")} value={order.node ? `${order.node.name} (${order.node.code})` : null} />
          <Row label={t("商品小计")} value={money(order.itemSubtotalKsh)} />
          <Row label={t("配送费")} value={money(order.deliveryFeeKsh)} />
          <Row label={t("订单总额")} value={money(order.totalKsh)} />
        </DetailCard>

        <DetailCard title={t("支付")} description={t("支付状态由 M-Pesa 决定，客服无法修改。")}>
          <Row label={t("支付状态")} value={payment.status} />
          <Row label={t("付款时间")} value={when(payment.paidAt)} />
          <Row label={t("交易参考号")} value={payment.transactionReference} mono />
          <Row label={t("付款金额")} value={money(payment.amountKsh)} />
          <Row label={t("付款手机号")} value={payment.phone} mono />
          <Row label={t("支付结果说明")} value={payment.resultDescription} />
        </DetailCard>

        <DetailCard title={t("履约")} description={fulfillment ? when(fulfillment.latestUpdateAt) : t("尚未进入履约")}>
          <Row label={t("当前状态")} value={fulfillment?.status} />
          <Row label={t("当前节点")} value={fulfillment?.node ? `${fulfillment.node.name} (${fulfillment.node.code})` : null} />
          <Row label={t("当前骑手")} value={fulfillment?.rider ? `${fulfillment.rider.name} · ${fulfillment.rider.phone ?? "-"}` : null} />
          <Row label={t("当前持有人")} value={fulfillment?.holder.label ?? fulfillment?.holder.type} />
          <Row label={t("配送尝试次数")} value={fulfillment ? String(fulfillment.deliveryAttemptCount) : null} />
          <Row label={t("异常原因")} value={fulfillment?.exceptionReason} />
          <Row label={t("配送码发送次数")} value={fulfillment ? String(fulfillment.deliveryCodeSentCount) : null} />
          <Row label={t("完成时间")} value={when(fulfillment?.completedAt)} />
        </DetailCard>

        <DetailCard title={t("推广者")} description={t("归因和佣金不允许客服修改。")}>
          {promoter ? (
            <>
              <Row label={t("推广者")} value={promoter.displayName || promoter.code} />
              <Row label={t("推广码")} value={promoter.code} mono />
              <Row label={t("推广者电话")} value={promoter.phone} mono />
              <Row label={t("来源")} value={promoter.source} />
              <Row label={t("活动")} value={promoter.campaign} />
            </>
          ) : (
            <p className="text-muted-foreground text-sm">{t("这个订单没有推广归因。")}</p>
          )}
        </DetailCard>

        <DetailCard title={t("商品")} description={t("每件都是唯一的一件。")}>
          <div className="flex flex-col gap-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex flex-col border-b pb-2 last:border-0 last:pb-0">
                <span className="text-sm">{item.title ?? t("未命名商品")}</span>
                <span className="font-mono text-muted-foreground text-xs">
                  {item.barcode ?? t("无Barcode")}{item.sizeLabel ? ` · ${item.sizeLabel}` : ""} · {money(item.lineTotalKsh)}
                </span>
              </div>
            ))}
          </div>
        </DetailCard>
      </section>

      {view.refundRequests.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("退款申请")}</CardTitle>
            <CardDescription>{t("客服只能发起，财务审批后才会打款。")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {view.refundRequests.map((request) => (
              <div key={request.id} className="flex flex-wrap items-center gap-2 border-b pb-2 text-sm last:border-0 last:pb-0">
                <Badge variant={request.status === "REFUNDED" ? "outline" : "secondary"}>
                  {t(REFUND_STATUS_LABELS[request.status] ?? request.status)}
                </Badge>
                <span>{money(request.amountKsh)}</span>
                <span className="text-muted-foreground">{request.reason}</span>
                {request.refundRecord ? (
                  <span className="font-mono text-muted-foreground text-xs">{request.refundRecord.externalReference}</span>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {view.cases.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("客服记录")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {view.cases.map((serviceCase) => (
              <div key={serviceCase.id} className="flex flex-wrap items-center gap-2 border-b pb-2 text-sm last:border-0 last:pb-0">
                <Badge variant={serviceCase.overdue ? "destructive" : "secondary"}>
                  {t(CASE_STATUS_LABELS[serviceCase.status as CaseStatus] ?? serviceCase.status)}
                </Badge>
                <Badge variant="outline">{t(CASE_TYPE_LABELS[serviceCase.caseType] ?? serviceCase.caseType)}</Badge>
                <Badge variant="outline">{t(PRIORITY_LABELS[serviceCase.priority] ?? serviceCase.priority)}</Badge>
                <Link href={`/customer-service/cases?search=${encodeURIComponent(serviceCase.title)}`} className="underline">
                  {serviceCase.title}
                </Link>
                <span className="text-muted-foreground text-xs">
                  {serviceCase.assignedAdminUser?.name ?? t("未分配")} · {slaLabel(serviceCase.slaDueAt, serviceCase.overdue)}
                </span>
                {serviceCase.escalated ? <Badge variant="destructive">{t("已升级")}</Badge> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("时间线")}</CardTitle>
          <CardDescription>{t("支付、履约和客服三条历史合成一条，从早到晚。")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {view.timeline.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("还没有任何事件。")}</p>
          ) : (
            view.timeline.map((entry, index) => (
              <div key={`${entry.at}-${index}`} className="flex flex-col gap-0.5 border-b pb-2 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-xs tabular-nums">{when(entry.at)}</span>
                  <Badge variant="outline">{channelLabel(entry.channel)}</Badge>
                  <span className="font-medium text-sm">{entry.action}</span>
                  {entry.actor ? <span className="text-muted-foreground text-xs">{entry.actor}</span> : null}
                </div>
                {entry.detail ? <p className="text-muted-foreground text-sm">{entry.detail}</p> : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        {canNote ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("内部备注")}</CardTitle>
              <CardDescription>{t("只有同事看得到，顾客看不到。")}</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel>{t("备注")}</FieldLabel>
                  <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
                </Field>
                <Button
                  type="button"
                  disabled={busy || !note.trim()}
                  onClick={() => void act("/operations/customer-service/notes", { orderId, customerId: customer.id, body: note }, t("备注已保存。")).then(() => setNote(""))}
                >
                  {t("保存备注")}
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>
        ) : null}

        {canEditContact ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("更正联系信息")}</CardTitle>
              <CardDescription>{t("只能改电话和配送地址，而且订单出库后地址就锁定了。")}</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel>{t("电话")}</FieldLabel>
                  <Input value={contact.phone} placeholder="0712345678" onChange={(event) => setContact({ ...contact, phone: event.target.value })} />
                </Field>
                <Field>
                  <FieldLabel>{t("配送地址")}</FieldLabel>
                  <Input value={contact.deliveryAddress} onChange={(event) => setContact({ ...contact, deliveryAddress: event.target.value })} />
                </Field>
                <Field>
                  <FieldLabel>{t("修改原因")}</FieldLabel>
                  <Input value={contact.reason} onChange={(event) => setContact({ ...contact, reason: event.target.value })} />
                </Field>
                <Button
                  type="button"
                  disabled={busy || !contact.reason.trim() || (!contact.phone.trim() && !contact.deliveryAddress.trim())}
                  onClick={() => void saveContact()}
                >
                  {t("保存")}
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </div>
  );
}

function DetailCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">{children}</CardContent>
    </Card>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right", mono && "font-mono text-xs")}>{value || "-"}</span>
    </div>
  );
}

function StatusMessage({ children, tone }: { children: ReactNode; tone?: "danger" }) {
  return (
    <div className={cn("rounded-lg border p-3 text-sm", tone === "danger" ? "border-destructive/30 bg-destructive/10 text-destructive" : "bg-muted")}>
      {children}
    </div>
  );
}

function channelLabel(channel: "PAYMENT" | "FULFILLMENT" | "CUSTOMER_SERVICE"): string {
  if (channel === "PAYMENT") return t("支付");
  if (channel === "FULFILLMENT") return t("履约");
  return t("客服");
}
