"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { RefreshCwIcon, SearchIcon } from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const API_PROXY_URL = "/api-proxy";

export type OrderQueueKey =
  | "all"
  | "pending-payment"
  | "payment-processing"
  | "paid"
  | "cancelled"
  | "expired"
  | "refunded"
  | "payment-exceptions";

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  fulfillmentMethod: string;
  deliveryAddress?: string | null;
  itemSubtotalKsh: number;
  deliveryFeeKsh: number;
  totalKsh: number;
  createdAt: string;
  customer: {
    displayName?: string | null;
    email: string;
    phone?: string | null;
  };
  items: Array<{
    id: string;
    snapshot?: {
      title: string;
      barcode?: string | null;
      imageUrl?: string | null;
      sizeLabel?: string | null;
      conditionGrade?: string | null;
    } | null;
  }>;
  payments: Array<{
    status: string;
    phone: string;
    amountKsh: number;
    providerReceiptNumber?: string | null;
    providerResultDescription?: string | null;
  }>;
  fulfillment?: {
    status: string;
  } | null;
};

type RequestOptions = RequestInit & {
  query?: Record<string, string | undefined>;
};

const QUEUE_META: Record<OrderQueueKey, { title: string; description: string; empty: string }> = {
  all: {
    title: "全部订单",
    description: "查看所有顾客订单和最近支付状态。",
    empty: "当前没有订单。"
  },
  "pending-payment": {
    title: "待付款",
    description: "订单已创建，但尚未进入支付确认。",
    empty: "当前没有待付款订单。"
  },
  "payment-processing": {
    title: "支付处理中",
    description: "已发起支付，等待 M-Pesa 回调或顾客确认。",
    empty: "当前没有支付处理中订单。"
  },
  paid: {
    title: "已付款",
    description: "可进入仓库履约的订单。",
    empty: "当前没有已付款订单。"
  },
  cancelled: {
    title: "已取消",
    description: "顾客取消或系统取消的订单。",
    empty: "当前没有已取消订单。"
  },
  expired: {
    title: "已过期",
    description: "库存锁定或支付窗口已过期的订单。",
    empty: "当前没有已过期订单。"
  },
  refunded: {
    title: "已退款",
    description: "已完成退款的订单。",
    empty: "当前没有已退款订单。"
  },
  "payment-exceptions": {
    title: "异常支付",
    description: "支付失败、取消、超时或需要人工复核的订单。",
    empty: "当前没有异常支付。"
  }
};

async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  const url = new URL(`${API_PROXY_URL}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(options?.query ?? {})) {
    if (value) url.searchParams.set(key, value);
  }
  const response = await fetch(url.toString(), {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) }
  });
  const text = await response.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text || `Request failed: ${response.status}` };
  }
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body ? String((body as { message?: unknown }).message) : `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export function OrderCenterPage({ queue }: { queue: OrderQueueKey }) {
  const { session } = useOperationsSession();
  const adminUserId = session?.adminUser?.id ?? "";
  const meta = QUEUE_META[queue];
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!adminUserId) return;
    setBusy(true);
    setError("");
    try {
      setOrders(await request<OrderRow[]>("/operations/fulfillment/orders", {
        query: { adminUserId, queue, search }
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取订单。");
    } finally {
      setBusy(false);
    }
  }, [adminUserId, queue, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => ({
    orders: orders.length,
    revenue: orders.reduce((sum, order) => sum + order.totalKsh, 0)
  }), [orders]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="订单中心"
        title={meta.title}
        description={meta.description}
        action={
          <Button variant="outline" disabled={busy} onClick={() => void load()}>
            <RefreshCwIcon data-icon="inline-start" />
            刷新
          </Button>
        }
      />
      <section className="grid gap-4 md:grid-cols-2">
        <Metric title="当前列表订单" value={String(totals.orders)} />
        <Metric title="列表金额" value={money(totals.revenue)} />
      </section>
      <Card>
        <CardContent className="pt-6">
          <FieldGroup>
            <Field>
              <FieldLabel>搜索订单、顾客、手机号或 Barcode</FieldLabel>
              <div className="flex gap-2">
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="订单号 / 手机号 / Barcode" />
                <Button type="button" variant="secondary" onClick={() => void load()}>
                  <SearchIcon data-icon="inline-start" />
                  搜索
                </Button>
              </div>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>订单</TableHead>
                <TableHead>顾客</TableHead>
                <TableHead>商品</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>支付</TableHead>
                <TableHead>履约</TableHead>
                <TableHead>时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                    {busy ? "正在读取..." : meta.empty}
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => {
                  const payment = order.payments[0];
                  return (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{order.orderNumber}</span>
                          <StatusBadge status={order.status} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-sm">
                          <span>{order.customer.displayName ?? order.customer.email}</span>
                          <span className="text-muted-foreground">{order.customer.phone ?? payment?.phone ?? "未留电话"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-64 flex-col gap-2">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex items-center gap-3">
                              <div className="size-10 overflow-hidden rounded-md border bg-muted">
                                {item.snapshot?.imageUrl ? <img src={item.snapshot.imageUrl} alt="" className="size-full object-cover" /> : null}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm">{item.snapshot?.title ?? "未命名商品"}</p>
                                <p className="text-muted-foreground text-xs">{item.snapshot?.barcode ?? "无Barcode"}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-sm">
                          <span>{money(order.totalKsh)}</span>
                          <span className="text-muted-foreground">配送 {money(order.deliveryFeeKsh)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <StatusBadge status={payment?.status ?? "NO_PAYMENT"} />
                          {payment?.providerReceiptNumber ? <span className="text-muted-foreground text-xs">{payment.providerReceiptNumber}</span> : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline">{methodLabel(order.fulfillmentMethod)}</Badge>
                          {order.fulfillment ? <StatusBadge status={order.fulfillment.status} /> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{new Date(order.createdAt).toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">{eyebrow}</p>
        <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
        <p className="max-w-3xl text-muted-foreground text-sm">{description}</p>
      </div>
      {action}
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "FAILED" || status === "MANUAL_REVIEW" || status === "EXCEPTION" ? "destructive" : status === "SUCCESS" || status === "PAID" || status === "COMPLETED" ? "secondary" : "outline";
  return <Badge variant={variant}>{statusLabel(status)}</Badge>;
}

function StatusMessage({ children, tone }: { children: ReactNode; tone?: "danger" }) {
  return (
    <div className={cn("rounded-lg border p-3 text-sm", tone === "danger" ? "border-destructive/30 bg-destructive/10 text-destructive" : "bg-muted")}>
      {children}
    </div>
  );
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: "草稿",
    PENDING_PAYMENT: "待付款",
    PAYMENT_PROCESSING: "支付处理中",
    PAID: "已付款",
    CANCELLED: "已取消",
    EXPIRED: "已过期",
    COMPLETED: "已完成",
    REFUNDED: "已退款",
    SUCCESS: "支付成功",
    FAILED: "支付失败",
    TIMEOUT: "支付超时",
    MANUAL_REVIEW: "人工复核",
    NO_PAYMENT: "无支付",
    PICKING: "拣货中",
    PACKED: "已打包",
    READY_FOR_PICKUP: "待自提",
    OUT_FOR_DELIVERY: "待配送",
    EXCEPTION: "异常"
  };
  return labels[status] ?? status;
}

function methodLabel(method: string): string {
  return method === "KIKUYU_LOCAL_DELIVERY" ? "Kikuyu配送" : "仓库自提";
}

function money(value: number): string {
  return `${value.toLocaleString("en-KE")} KSh`;
}
