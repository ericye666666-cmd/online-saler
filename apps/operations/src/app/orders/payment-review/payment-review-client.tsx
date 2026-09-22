"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangleIcon, CheckCircle2Icon, RefreshCwIcon, XCircleIcon } from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatKsh, formatMoment, operationsRequester } from "@/lib/operations-request";
import { t } from "@/i18n/runtime";

/**
 * The queue of payments M-Pesa left ambiguous, and what to do about each one.
 * A late callback, a mismatched amount or a duplicate receipt used to park the
 * shopper's money here with no way forward; now every row ends in a decision.
 */

type ReviewOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalKsh: number;
  fulfillmentMethod: string;
  nodeName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  affiliateName: string | null;
  itemTitles: string[];
  refundedKsh: number;
};

type ReviewPayment = {
  id: string;
  status: string;
  amountKsh: number;
  phone: string;
  requestedAt: string;
  completedAt: string | null;
  providerReceiptNumber: string | null;
  providerCheckoutRequestId: string | null;
  providerResultCode: number | null;
  providerResultDescription: string | null;
  providerQueryAt: string | null;
  providerQueryResultCode: number | null;
  providerQueryDescription: string | null;
  reviewDecision: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  reviewedBy: string | null;
  callbackCount: number;
  order: ReviewOrder;
  holdReason: string;
};

type OrphanCallback = {
  id: string;
  createdAt: string;
  resultCode: number;
  resultDescription: string | null;
  amountKsh: number | null;
  mpesaReceiptNumber: string | null;
  phone: string | null;
  transactionDate: string | null;
  providerCheckoutRequestId: string;
  linkedOrderId: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
};

type Queue = { payments: ReviewPayment[]; callbacks: OrphanCallback[] };

export function PaymentReviewPage() {
  const { session, hasPermission } = useOperationsSession();
  const accessToken = session?.accessToken ?? "";
  const canReview = hasPermission("orders.payment-review");
  const [queue, setQueue] = useState<Queue>({ payments: [], callbacks: [] });
  const [includeResolved, setIncludeResolved] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [receipts, setReceipts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      const request = operationsRequester(accessToken);
      setQueue(await request<Queue>("/operations/payment-review", {
        query: includeResolved ? { includeResolved: "true" } : {}
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("无法读取支付复核队列。"));
    } finally {
      setLoading(false);
    }
  }, [accessToken, includeResolved]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(path: string, id: string, body: Record<string, string>, success: string) {
    setBusyId(id);
    setError("");
    setMessage("");
    try {
      await operationsRequester(accessToken)(path, { method: "POST", body: JSON.stringify(body) });
      setMessage(success);
      setNotes((current) => ({ ...current, [id]: "" }));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("操作失败。"));
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t("支付人工复核")}</CardTitle>
            <CardDescription>
              {t("回调迟到、金额不符、收据重复或找不到对应订单的支付都会停在这里。确认收到款项后放行，订单会像正常付款一样进入拣货；确认没收到则释放库存。")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setIncludeResolved((value) => !value)}>
              {includeResolved ? t("只看待处理") : t("包含已处理")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCwIcon className={loading ? "animate-spin" : ""} /> {t("刷新")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
          {!canReview ? <p className="text-sm text-muted-foreground">{t("你没有支付复核权限，只能查看。")}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangleIcon size={18} /> {t("待复核支付")} ({queue.payments.length})
          </CardTitle>
          <CardDescription>{t("每一行都是一位顾客的钱。先在 M-Pesa 商户账单里核对，再做决定。")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {queue.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("没有等待复核的支付。")}</p>
          ) : null}
          {queue.payments.map((payment) => (
            <div key={payment.id} className="rounded-lg border p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link className="font-semibold underline" href={`/orders/${payment.order.id}`}>
                    {payment.order.orderNumber}
                  </Link>
                  <Badge variant="outline">{payment.order.status}</Badge>
                  <Badge variant={payment.status === "MANUAL_REVIEW" ? "destructive" : "secondary"}>{payment.status}</Badge>
                  {payment.reviewDecision ? <Badge variant="secondary">{payment.reviewDecision}</Badge> : null}
                </div>
                <div className="text-sm text-muted-foreground">{formatMoment(payment.requestedAt)}</div>
              </div>

              <p className="text-sm">{payment.holdReason}</p>

              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <Fact label={t("支付金额")} value={formatKsh(payment.amountKsh)} />
                <Fact label={t("订单金额")} value={formatKsh(payment.order.totalKsh)} />
                <Fact label={t("付款手机号")} value={payment.phone} />
                <Fact label={t("M-Pesa 收据")} value={payment.providerReceiptNumber ?? t("无")} />
                <Fact label={t("CheckoutRequestID")} value={payment.providerCheckoutRequestId ?? "—"} />
                <Fact label={t("回调次数")} value={String(payment.callbackCount)} />
                <Fact label={t("顾客")} value={`${payment.order.customerName ?? t("访客")} · ${payment.order.customerPhone ?? "—"}`} />
                <Fact label={t("履约")} value={`${payment.order.fulfillmentMethod}${payment.order.nodeName ? ` · ${payment.order.nodeName}` : ""}`} />
                <Fact label={t("推广者")} value={payment.order.affiliateName ?? t("无")} />
                {payment.providerQueryAt ? (
                  <Fact
                    label={t("Safaricom 查询")}
                    value={`${payment.providerQueryResultCode ?? "—"} · ${payment.providerQueryDescription ?? "—"}`}
                  />
                ) : null}
                <Fact label={t("商品")} value={payment.order.itemTitles.join("、") || "—"} />
                {payment.order.refundedKsh ? <Fact label={t("已退款")} value={formatKsh(payment.order.refundedKsh)} /> : null}
              </dl>

              {payment.reviewedAt ? (
                <p className="text-sm text-muted-foreground">
                  {t("已由")} {payment.reviewedBy ?? "—"} {t("于")} {formatMoment(payment.reviewedAt)} {t("处理")}：{payment.reviewNote}
                </p>
              ) : null}

              {canReview && payment.status === "MANUAL_REVIEW" ? (
                <div className="flex flex-col gap-2">
                  <Input
                    placeholder={t("在商户账单里核对到的 M-Pesa 收据号（放行时填写）")}
                    value={receipts[payment.id] ?? ""}
                    onChange={(event) => setReceipts((current) => ({ ...current, [payment.id]: event.target.value }))}
                  />
                  <Textarea
                    placeholder={t("写明你是怎么核对的，例如：商户账单 2026-09-23 14:02 收到 KSh 400，收据 SJ12ABC。")}
                    value={notes[payment.id] ?? ""}
                    onChange={(event) => setNotes((current) => ({ ...current, [payment.id]: event.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={busyId === payment.id || !(notes[payment.id] ?? "").trim()}
                      onClick={() => void act(`/operations/payment-review/payments/${payment.id}/settle`, payment.id, {
                        note: notes[payment.id] ?? "",
                        receiptNumber: receipts[payment.id] ?? ""
                      }, t("已确认收款，订单进入拣货队列。"))}
                    >
                      <CheckCircle2Icon /> {t("确认收到款项，放行订单")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busyId === payment.id || !(notes[payment.id] ?? "").trim()}
                      onClick={() => void act(`/operations/payment-review/payments/${payment.id}/reject`, payment.id, {
                        note: notes[payment.id] ?? ""
                      }, t("已标记未收到款项，库存已释放。"))}
                    >
                      <XCircleIcon /> {t("确认没有收到款项")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("无主回调")} ({queue.callbacks.length})</CardTitle>
          <CardDescription>
            {t("找不到对应支付请求的 M-Pesa 回调，通常是顾客直接给 Till 付款。核对后写明处理结果并关闭。")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {queue.callbacks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("没有待处理的无主回调。")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("时间")}</TableHead>
                  <TableHead>{t("金额")}</TableHead>
                  <TableHead>{t("收据")}</TableHead>
                  <TableHead>{t("手机号")}</TableHead>
                  <TableHead>{t("结果")}</TableHead>
                  <TableHead>{t("处理")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.callbacks.map((callback) => (
                  <TableRow key={callback.id}>
                    <TableCell>{formatMoment(callback.createdAt)}</TableCell>
                    <TableCell>{formatKsh(callback.amountKsh)}</TableCell>
                    <TableCell className="font-mono text-xs">{callback.mpesaReceiptNumber ?? "—"}</TableCell>
                    <TableCell>{callback.phone ?? "—"}</TableCell>
                    <TableCell>{callback.resultCode} · {callback.resultDescription ?? "—"}</TableCell>
                    <TableCell>
                      {callback.resolvedAt ? (
                        <span className="text-sm text-muted-foreground">
                          {callback.resolvedBy ?? "—"}：{callback.resolutionNote}
                        </span>
                      ) : canReview ? (
                        <div className="flex flex-col gap-2">
                          <Textarea
                            className="min-h-16"
                            placeholder={t("例如：顾客直接给 Till 付款，已人工建单 DL-20260923-XXXX。")}
                            value={notes[callback.id] ?? ""}
                            onChange={(event) => setNotes((current) => ({ ...current, [callback.id]: event.target.value }))}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === callback.id || !(notes[callback.id] ?? "").trim()}
                            onClick={() => void act(`/operations/payment-review/callbacks/${callback.id}/resolve`, callback.id, {
                              note: notes[callback.id] ?? ""
                            }, t("回调已关闭。"))}
                          >
                            {t("记录处理结果")}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">{t("无权限")}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium break-words">{value}</dd>
    </div>
  );
}
