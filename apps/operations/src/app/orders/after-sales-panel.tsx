"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangleIcon, CheckCircle2Icon, RefreshCwIcon, RotateCcwIcon } from "lucide-react";
import { hasPermission, type OperationsSession } from "@/components/admin/operations-access";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type AfterSalesOrder = {
  id: string;
  status: string;
  fulfillment?: { status: string } | null;
  payments: Array<{ status: string }>;
  items: Array<{
    id: string;
    unitPriceKsh: number;
    quantity: number;
    snapshot?: { title: string; barcode?: string | null } | null;
    inventoryItem?: { barcode: string } | null;
  }>;
};
type ReturnRecord = {
  id: string;
  orderItemId: string;
  status: "REQUESTED" | "APPROVED" | "REJECTED" | "RECEIVED" | "REFUND_RECORDED";
  reason: string;
  requestNote: string;
  orderItem: { lineTotalKsh: number };
  requestedAt?: string;
  createdAt?: string;
  receivedBarcode?: string | null;
  receivedAt?: string | null;
  restockable?: boolean | null;
  restockedAt?: string | null;
  refunds: Array<{ id: string; amountKsh: number; externalReference: string; refundedAt: string }>;
  events: Array<{ id: string; action: string; reason: string; createdAt: string }>;
  commissionAdjustment?: { kind: string; amountKsh?: number } | null;
};
type Action = "request" | "approve" | "reject" | "receive" | "refund" | "restock";
type ActiveAction = { kind: Action; record?: ReturnRecord };
const REASONS = [
  ["WRONG_ITEM", "商品发错"],
  ["PHOTO_MISMATCH", "实物与照片不符"],
  ["UNDISCLOSED_DEFECT", "未披露的瑕疵"],
  ["MEASUREMENT_DIFFERENCE", "实测尺寸差异超过 3 cm"],
  ["DELIVERY_DAMAGE", "配送损坏"]
] as const;
const STATUS_LABELS: Record<ReturnRecord["status"], string> = {
  REQUESTED: "待审核", APPROVED: "待退回验收", REJECTED: "已拒绝",
  RECEIVED: "已验收，待登记退款", REFUND_RECORDED: "已登记退款"
};
const ACTION_LABELS: Record<Action, string> = {
  request: "新建售后申请", approve: "批准退货", reject: "拒绝申请", receive: "实物退回验收",
  refund: "登记已完成的外部退款", restock: "退回商品入库复审"
};
const EVENT_LABELS: Record<string, string> = {
  REQUEST: "申请退货", DECISION: "审核决定",
  RECEIVE: "实物验收", REFUND: "登记外部退款", RESTOCK: "入库复审"
};

async function afterSalesRequest<T>(orderId: string, token: string, suffix = "", body?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api-proxy/operations/orders/${encodeURIComponent(orderId)}/after-sales${suffix}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
    signal
  });
  const text = await response.text();
  let result: { message?: unknown } = {};
  try { result = text ? JSON.parse(text) : {}; } catch { result = { message: `售后服务返回异常 (${response.status})` }; }
  if (!response.ok) {
    const message = Array.isArray(result.message) ? result.message.join("；") : result.message;
    throw new Error(typeof message === "string" ? message : `售后操作失败 (${response.status})`);
  }
  return result as T;
}

export function AfterSalesPanel({ order, session, onOrderChanged }: {
  order: AfterSalesOrder;
  session: OperationsSession | null;
  onOrderChanged: () => Promise<void>;
}) {
  const accessToken = session?.accessToken ?? "";
  const canView = hasPermission(session, "orders.view");
  const canOperate = hasPermission(session, "orders.after-sale");
  const canApprove = canOperate && hasPermission(session, "action.customer-service.approve");
  const [records, setRecords] = useState<ReturnRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [action, setAction] = useState<ActiveAction | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!accessToken || !canView) return;
    setLoading(true);
    setError("");
    try {
      const result = await afterSalesRequest<{ returns: ReturnRecord[] }>(order.id, accessToken, "", undefined, signal);
      if (!signal?.aborted) { setRecords(result.returns); setLoaded(true); }
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof Error ? caught.message : "无法读取售后记录。");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [accessToken, canView, order.id]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (!canView) return null;
  const eligibleItems = order.items.filter((item) => item.quantity === 1 && !records.some((record) => record.orderItemId === item.id));
  const deliveredAndPaid = order.status === "COMPLETED" && order.fulfillment?.status === "COMPLETED" && order.payments.some((payment) => payment.status === "SUCCESS");
  const requestAvailable = loaded && !error && deliveredAndPaid && eligibleItems.length > 0;

  async function completed(kind: Action) {
    setAction(null);
    setSuccess(`${ACTION_LABELS[kind]}已保存。`);
    await Promise.all([load(), onOrderChanged()]);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle>退货与退款</CardTitle>
            <CardDescription>按商品申请、审核和验收，登记外部退款后处理入库复审。</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={loading} onClick={() => void load()} aria-label="刷新售后记录"><RefreshCwIcon data-icon="inline-start" />刷新</Button>
            {canOperate ? <Button size="sm" disabled={loading || !requestAvailable} onClick={() => { setSuccess(""); setAction({ kind: "request" }); }}><RotateCcwIcon data-icon="inline-start" />新建售后申请</Button> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert variant="destructive"><AlertTriangleIcon /><AlertTitle>售后记录读取失败</AlertTitle><AlertDescription>{error} 请刷新后再操作。</AlertDescription></Alert> : null}
        {success ? <p className="flex items-center gap-2 text-sm" role="status"><CheckCircle2Icon className="size-4 shrink-0" />{success}</p> : null}
        {loading && !loaded ? <p className="text-muted-foreground text-sm" role="status">正在读取售后记录…</p> : null}
        {loaded && records.length === 0 ? <p className="text-muted-foreground text-sm">暂无退货申请。已付款并完成交付的商品，可在交付后 24 小时内提交符合原因的申请。</p> : null}
        {records.map((record) => {
          const item = order.items.find((candidate) => candidate.id === record.orderItemId);
          const refunded = record.refunds.reduce((sum, refund) => sum + refund.amountKsh, 0);
          const remaining = record.orderItem.lineTotalKsh - refunded;
          const disabled = loading || Boolean(error);
          return (
            <section key={record.id} className="flex flex-col gap-3 rounded-lg border p-4" aria-label={`售后：${item?.snapshot?.title ?? record.orderItemId}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="break-words font-medium">{item?.snapshot?.title ?? "退回商品"}</p>
                  <p className="break-all text-muted-foreground text-sm">Barcode：{item?.snapshot?.barcode ?? item?.inventoryItem?.barcode ?? "未记录"}</p>
                </div>
                <Badge variant={record.status === "REJECTED" ? "outline" : "secondary"}>{STATUS_LABELS[record.status] ?? record.status}</Badge>
              </div>
              <p className="text-sm">{REASONS.find(([reason]) => reason === record.reason)?.[1] ?? record.reason} · {formatDate(record.requestedAt ?? record.createdAt)}</p>
              <p className="break-words text-muted-foreground text-sm">申请说明：{record.requestNote}</p>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p>已登记退款：{money(refunded)} / 商品金额 {money(record.orderItem.lineTotalKsh)}</p>
                {record.receivedBarcode ? <p className="break-all">验收条码：{record.receivedBarcode} · {record.restockable ? "可入库复审" : "不可重新售卖"}</p> : null}
                {record.restockedAt ? <p>已入库复审：{formatDate(record.restockedAt)}</p> : null}
                {record.commissionAdjustment?.kind === "RECOVERY_REQUIRED" ? <p>已付佣金待追回，请联系财务核对。</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {record.status === "REQUESTED" && canApprove ? <><Button size="sm" disabled={disabled} onClick={() => setAction({ kind: "approve", record })}>批准退货</Button><Button size="sm" variant="outline" disabled={disabled} onClick={() => setAction({ kind: "reject", record })}>拒绝申请</Button></> : null}
                {record.status === "APPROVED" && canOperate ? <Button size="sm" disabled={disabled} onClick={() => setAction({ kind: "receive", record })}>实物退回验收</Button> : null}
                {["RECEIVED", "REFUND_RECORDED"].includes(record.status) && remaining > 0 && canApprove ? <Button size="sm" disabled={disabled} onClick={() => setAction({ kind: "refund", record })}>登记已完成的外部退款</Button> : null}
                {record.status === "REFUND_RECORDED" && record.restockable && !record.restockedAt && canOperate ? <Button size="sm" variant="outline" disabled={disabled} onClick={() => setAction({ kind: "restock", record })}>退回商品入库复审</Button> : null}
              </div>
              {(record.refunds.length > 0 || record.events.length > 0) ? <details className="text-sm"><summary className="cursor-pointer font-medium">退款凭证与处理记录</summary><div className="mt-3 flex flex-col gap-3">
                {record.refunds.map((refund) => <div key={refund.id} className="break-words rounded-md bg-muted/50 p-3">外部退款 {money(refund.amountKsh)} · {formatDate(refund.refundedAt)}<p className="break-all text-muted-foreground">交易凭证：{refund.externalReference}</p></div>)}
                {record.events.map((event) => <div key={event.id}><p>{EVENT_LABELS[event.action] ?? event.action} · {formatDate(event.createdAt)}</p><p className="break-words text-muted-foreground">{event.reason}</p></div>)}
              </div></details> : null}
            </section>
          );
        })}
        {!canOperate ? <p className="text-muted-foreground text-sm">当前账号可查看记录，申请和实物验收需要售后操作权限。</p> : !canApprove ? <p className="text-muted-foreground text-sm">申请和实物验收由当前账号处理；审批和退款登记由具备客服审批权限的人员处理。</p> : null}
      </CardContent>
      {action ? <AfterSaleDialog key={`${action.kind}:${action.record?.id ?? "new"}`} action={action} order={order} eligibleItems={eligibleItems} token={accessToken} onClose={() => setAction(null)} onDone={completed} /> : null}
    </Card>
  );
}

function AfterSaleDialog({ action, order, eligibleItems, token, onClose, onDone }: {
  action: ActiveAction;
  order: AfterSalesOrder;
  eligibleItems: AfterSalesOrder["items"];
  token: string;
  onClose: () => void;
  onDone: (kind: Action) => Promise<void>;
}) {
  const [itemId, setItemId] = useState(eligibleItems[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [difference, setDifference] = useState("");
  const [barcode, setBarcode] = useState("");
  const [restockable, setRestockable] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [refundedAt, setRefundedAt] = useState("");
  const [evidence, setEvidence] = useState("");
  const [verified, setVerified] = useState(false);
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const retry = useRef<{ payload: string; key: string } | null>(null);
  const remaining = action.record ? action.record.orderItem.lineTotalKsh - action.record.refunds.reduce((sum, refund) => sum + refund.amountKsh, 0) : 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    if (!note.trim()) { setError("请填写操作说明。"); return; }
    const body: Record<string, unknown> = { note: note.trim() };
    let suffix = action.record ? `/${encodeURIComponent(action.record.id)}` : "";
    if (action.kind === "request") {
      if (!itemId || !reason) { setError("请选择商品和售后原因。"); return; }
      Object.assign(body, { orderItemId: itemId, reason });
      if (reason === "MEASUREMENT_DIFFERENCE") {
        const measured = Number(difference);
        if (!Number.isFinite(measured) || measured <= 3) { setError("尺寸差异必须超过 3 cm。"); return; }
        body.measurementDifferenceCm = measured;
      }
    }
    if (action.kind === "approve" || action.kind === "reject") { suffix += "/decision"; body.approved = action.kind === "approve"; }
    if (action.kind === "receive") {
      if (!barcode.trim() || !restockable) { setError("请扫码并选择实物验收结果。"); return; }
      suffix += "/receive";
      Object.assign(body, { receivedBarcode: barcode.trim(), restockable: restockable === "yes" });
    }
    if (action.kind === "refund") {
      const amountKsh = Number(amount);
      const time = new Date(refundedAt);
      if (!Number.isSafeInteger(amountKsh) || amountKsh <= 0 || amountKsh > remaining) { setError("退款金额必须是正整数，且不能超过商品剩余可登记金额。"); return; }
      if (!reference.trim() || !evidence.trim() || !verified) { setError("请填写退款交易凭证，并确认已核对实际退款。"); return; }
      if (!refundedAt || !Number.isFinite(time.getTime()) || time.getTime() > Date.now()) { setError("请填写已经发生的实际退款时间。"); return; }
      if (action.record?.receivedAt && time.getTime() < new Date(action.record.receivedAt).getTime()) { setError("退款时间不能早于实物退回验收时间。"); return; }
      suffix += "/refunds";
      Object.assign(body, { amountKsh, externalReference: reference.trim(), evidenceNote: evidence.trim(), refundedAt: time.toISOString() });
    }
    if (action.kind === "restock") {
      if (!location.trim()) { setError("请填写实际放置的货架位。"); return; }
      suffix += "/restock";
      body.locationCode = location.trim();
    }
    const payload = JSON.stringify({ suffix, body });
    if (retry.current?.payload !== payload) retry.current = { payload, key: crypto.randomUUID() };
    body.idempotencyKey = retry.current.key;
    submitting.current = true;
    setBusy(true);
    try {
      await afterSalesRequest(order.id, token, suffix, body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "售后操作失败。");
      return;
    } finally { submitting.current = false; setBusy(false); }
    await onDone(action.kind);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !submitting.current) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" showCloseButton={!busy}>
        <DialogHeader><DialogTitle>{ACTION_LABELS[action.kind]}</DialogTitle><DialogDescription>
          {action.kind === "refund" ? "请先在原收款渠道完成并核验退款，再登记这笔实际交易。本页面不会向顾客转账。" : action.kind === "restock" ? "填写实际货架位。商品将进入待复审，重新审核并发布后才能售卖。" : action.kind === "receive" ? "收到实物后逐件扫码并检查身份、瑕疵和可售状态；验收不会自动上架。" : "所有操作都会保留当前账号、时间和说明。"}
        </DialogDescription></DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <FieldGroup>
            {action.kind === "request" ? <>
              <Choice id="after-sale-item" label="退货商品" value={itemId} onChange={setItemId} options={eligibleItems.map((candidate) => [candidate.id, `${candidate.snapshot?.title ?? candidate.id} · ${money(candidate.unitPriceKsh * candidate.quantity)}`])} disabled={busy} />
              <Choice id="after-sale-reason" label="售后原因" value={reason} onChange={setReason} options={REASONS} disabled={busy} />
              {reason === "MEASUREMENT_DIFFERENCE" ? <Field><FieldLabel htmlFor="after-sale-difference">实际差异（cm，需超过 3）</FieldLabel><Input id="after-sale-difference" type="number" min="3.01" step="0.01" required value={difference} onChange={(event) => setDifference(event.target.value)} disabled={busy} /></Field> : null}
              <p className="text-muted-foreground text-sm">申请需在完成交付后 24 小时内提交；系统按实际交付时间核验。</p>
            </> : null}
            {action.kind === "receive" ? <>
              <Field><FieldLabel htmlFor="after-sale-barcode">扫描实际退回商品条码</FieldLabel><Input id="after-sale-barcode" required autoComplete="off" value={barcode} onChange={(event) => setBarcode(event.target.value)} disabled={busy} /></Field>
              <Choice id="after-sale-inspection" label="实物验收结果" value={restockable} onChange={setRestockable} options={[["yes", "实物一致，可进入入库复审"], ["no", "不可重新售卖，保留处理记录"]]} disabled={busy} />
            </> : null}
            {action.kind === "refund" ? <>
              <p className="text-sm">商品剩余可登记金额：{money(remaining)}。运费不自动计入退款。</p>
              <Field><FieldLabel htmlFor="after-sale-amount">实际已退款金额（KSh）</FieldLabel><Input id="after-sale-amount" type="number" min="1" max={remaining} step="1" required value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy} /></Field>
              <Field><FieldLabel htmlFor="after-sale-reference">外部退款交易号／凭证编号</FieldLabel><Input id="after-sale-reference" required value={reference} onChange={(event) => setReference(event.target.value)} disabled={busy} /></Field>
              <Field><FieldLabel htmlFor="after-sale-refunded-at">实际退款时间（本设备时区，需晚于验收时间）</FieldLabel><Input id="after-sale-refunded-at" type="datetime-local" step="1" required value={refundedAt} onChange={(event) => setRefundedAt(event.target.value)} disabled={busy} /></Field>
              <Field><FieldLabel htmlFor="after-sale-evidence">退款凭证核验说明</FieldLabel><Textarea id="after-sale-evidence" required value={evidence} onChange={(event) => setEvidence(event.target.value)} disabled={busy} /></Field>
              <Field orientation="horizontal"><Checkbox id="after-sale-verified" checked={verified} onCheckedChange={(checked) => setVerified(checked === true)} disabled={busy} /><FieldLabel htmlFor="after-sale-verified">我已核对外部凭证，退款已实际完成。</FieldLabel></Field>
            </> : null}
            {action.kind === "restock" ? <Field><FieldLabel htmlFor="after-sale-location">实际入库货架位</FieldLabel><Input id="after-sale-location" required value={location} onChange={(event) => setLocation(event.target.value)} disabled={busy} /></Field> : null}
            <Field><FieldLabel htmlFor="after-sale-note">{action.kind === "reject" ? "拒绝原因" : "操作说明"}</FieldLabel><Textarea id="after-sale-note" required value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} /></Field>
          </FieldGroup>
          {error ? <Alert variant="destructive"><AlertTriangleIcon /><AlertTitle>未能保存</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
          <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" disabled={busy || (action.kind === "refund" && !verified)}>{busy ? "正在保存…" : ACTION_LABELS[action.kind]}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Choice({ id, label, value, onChange, options, disabled }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>; disabled: boolean;
}) {
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger id={id} className="w-full"><SelectValue placeholder="请选择" /></SelectTrigger><SelectContent>{options.map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectContent></Select></Field>;
}

function formatDate(value?: string | null) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "时间未记录"; }
function money(value: number) { return `${value.toLocaleString("en-KE")} KSh`; }
