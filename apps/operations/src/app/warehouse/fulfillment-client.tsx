"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ClipboardCheckIcon,
  PackageCheckIcon,
  RefreshCwIcon,
  ScanBarcodeIcon,
  SearchIcon,
  TruckIcon
} from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const API_PROXY_URL = "/api-proxy";

export type FulfillmentQueueKey =
  | "awaiting-picking"
  | "picking"
  | "packing"
  | "packed"
  | "pickup"
  | "delivery"
  | "completed"
  | "exceptions";

type FulfillmentSummary = {
  awaitingPicking: number;
  picking: number;
  packing: number;
  packed: number;
  pickup: number;
  delivery: number;
  completed: number;
  exceptions: number;
};

type InventoryItem = {
  barcode: string;
  status: string;
  location?: {
    locationCode: string;
  } | null;
};

type OrderItem = {
  productId: string;
  snapshot?: {
    productCode: string;
    barcode?: string | null;
    title: string;
    imageUrl?: string | null;
    sizeLabel?: string | null;
    conditionGrade?: string | null;
  } | null;
  inventoryItem?: InventoryItem | null;
};

type FulfillmentTask = {
  orderId: string;
  status: string;
  pickedAt?: string | null;
  packedAt?: string | null;
  readyForPickupAt?: string | null;
  outForDeliveryAt?: string | null;
  completedAt?: string | null;
  exceptionReason?: string | null;
  exceptionNote?: string | null;
  packingStatus?: string | null;
  packingNote?: string | null;
  deliveryRiderName?: string | null;
  deliveryRiderPhone?: string | null;
  order: {
    orderNumber: string;
    fulfillmentMethod: string;
    deliveryAddress?: string | null;
    deliveryNote?: string | null;
    totalKsh: number;
    customer: {
      displayName?: string | null;
      email: string;
      phone?: string | null;
    };
    items: OrderItem[];
  };
  events: Array<{
    id: string;
    action: string;
    oldStatus?: string | null;
    newStatus: string;
    note?: string | null;
    scannedBarcode?: string | null;
    createdAt: string;
    actorEmployee?: {
      name: string;
    } | null;
  }>;
};

type InventorySearchRow = {
  id: string;
  barcode: string;
  status: string;
  checkedInAt?: string | null;
  location?: {
    locationCode: string;
  } | null;
  product: {
    productCode: string;
    title?: string | null;
    category?: string | null;
    color?: string | null;
    finalSizeLabel?: string | null;
    images: Array<{
      publicUrl?: string | null;
      originalUrl: string;
    }>;
  };
};

type RequestOptions = RequestInit & {
  query?: Record<string, string | undefined>;
};

const QUEUE_META: Record<FulfillmentQueueKey, { title: string; description: string; empty: string }> = {
  "awaiting-picking": {
    title: "待拣货",
    description: "只显示已付款且尚未开始拣货的订单。",
    empty: "当前没有待拣货订单。"
  },
  picking: {
    title: "拣货中",
    description: "仓库员工已经接单，但还没有完成条码核对。",
    empty: "当前没有拣货中订单。"
  },
  packing: {
    title: "待打包",
    description: "条码已核对，等待包装。",
    empty: "当前没有待打包订单。"
  },
  packed: {
    title: "已打包",
    description: "等待转入自提或配送。",
    empty: "当前没有已打包待交接订单。"
  },
  pickup: {
    title: "待自提",
    description: "顾客到店后，用订单号或手机号核对。",
    empty: "当前没有待自提订单。"
  },
  delivery: {
    title: "待配送",
    description: "已交给配送员，等待签收。",
    empty: "当前没有待配送订单。"
  },
  completed: {
    title: "已完成",
    description: "已自提或已签收的订单。",
    empty: "当前没有完成记录。"
  },
  exceptions: {
    title: "异常订单",
    description: "找不到商品、条码不匹配、损坏、取消或配送失败。",
    empty: "当前没有异常订单。"
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

export function WarehouseWorkbenchPage() {
  const ids = useOperationIds();
  const [summary, setSummary] = useState<FulfillmentSummary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    setBusy(true);
    setError("");
    try {
      setSummary(await request<FulfillmentSummary>("/operations/fulfillment/summary", { query: { adminUserId: ids.adminUserId } }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取履约工作台。");
    } finally {
      setBusy(false);
    }
  }, [ids.adminUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = [
    { label: "待拣货", value: summary?.awaitingPicking ?? 0, tone: "default" },
    { label: "拣货中", value: summary?.picking ?? 0, tone: "default" },
    { label: "待打包", value: summary?.packing ?? 0, tone: "default" },
    { label: "待自提", value: summary?.pickup ?? 0, tone: "default" },
    { label: "待配送", value: summary?.delivery ?? 0, tone: "default" },
    { label: "异常订单", value: summary?.exceptions ?? 0, tone: "danger" }
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="仓库履约"
        title="履约工作台"
        description="已付款订单从这里进入拣货、打包、自提和配送。"
        action={
          <Button variant="outline" disabled={busy} onClick={() => void load()}>
            <RefreshCwIcon data-icon="inline-start" />
            刷新
          </Button>
        }
      />
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric) => (
          <Metric key={metric.label} title={metric.label} value={metric.value} tone={metric.tone} />
        ))}
      </section>
      <Card>
        <CardHeader>
          <CardTitle>仓库员工流程</CardTitle>
          <CardDescription>系统只允许已付款订单进入履约；每次状态变化都会写入履约日志。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {["接单拣货", "扫码核对", "确认打包", "自提/配送完成"].map((step) => (
            <div key={step} className="rounded-lg border p-4">
              <p className="font-medium text-sm">{step}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function FulfillmentQueuePage({ queue }: { queue: FulfillmentQueueKey }) {
  const ids = useOperationIds();
  const meta = QUEUE_META[queue];
  const [tasks, setTasks] = useState<FulfillmentTask[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    setBusy("load");
    setError("");
    try {
      setTasks(await request<FulfillmentTask[]>("/operations/fulfillment/tasks", {
        query: { adminUserId: ids.adminUserId, queue, search }
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取履约任务。");
    } finally {
      setBusy("");
    }
  }, [ids.adminUserId, queue, search]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(task: FulfillmentTask, action: FulfillmentAction) {
    if (!ids.adminUserId) return;
    const body = actionBody(task, action, ids.employeeId);
    if (!body) return;
    setBusy(`${action}:${task.orderId}`);
    setError("");
    try {
      await request(`/operations/fulfillment/orders/${task.orderId}/${action}`, {
        method: "POST",
        body: JSON.stringify({ ...body, adminUserId: ids.adminUserId })
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "履约操作失败。");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="仓库履约"
        title={meta.title}
        description={meta.description}
        action={
          <Button variant="outline" disabled={busy === "load"} onClick={() => void load()}>
            <RefreshCwIcon data-icon="inline-start" />
            刷新
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-6">
          <FieldGroup>
            <Field>
              <FieldLabel>搜索订单、顾客、Barcode 或商品名</FieldLabel>
              <div className="flex gap-2">
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="输入订单号、手机号、Barcode" />
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
                <TableHead>商品</TableHead>
                <TableHead>Barcode / 仓位</TableHead>
                <TableHead>顾客</TableHead>
                <TableHead>方式</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="min-w-72">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                    {busy === "load" ? "正在读取..." : meta.empty}
                  </TableCell>
                </TableRow>
              ) : (
                tasks.map((task) => (
                  <TableRow key={task.orderId}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{task.order.orderNumber}</span>
                        <span className="text-muted-foreground text-xs">{money(task.order.totalKsh)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-64 flex-col gap-3">
                        {task.order.items.map((item) => (
                          <div key={item.productId} className="flex items-center gap-3">
                            <ProductImage item={item} />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-sm">{item.snapshot?.title ?? "未命名商品"}</p>
                              <p className="text-muted-foreground text-xs">{item.snapshot?.sizeLabel ?? "无尺码"} · {item.snapshot?.conditionGrade ?? "无成色"}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        {task.order.items.map((item) => (
                          <span key={item.productId}>
                            {item.snapshot?.barcode ?? item.inventoryItem?.barcode ?? "无Barcode"} / {item.inventoryItem?.location?.locationCode ?? "未入库"}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        <span>{task.order.customer.displayName ?? task.order.customer.email}</span>
                        <span className="text-muted-foreground">{task.order.customer.phone ?? "未留电话"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-48 flex-col gap-1 text-sm">
                        <Badge variant="outline">{methodLabel(task.order.fulfillmentMethod)}</Badge>
                        {task.order.deliveryAddress ? <span className="text-muted-foreground">{task.order.deliveryAddress}</span> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={task.status} />
                    </TableCell>
                    <TableCell>
                      <TaskActions task={task} busy={busy} onAction={(action) => void runAction(task, action)} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function InventoryQueryPage() {
  const ids = useOperationIds();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<InventorySearchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    setBusy(true);
    setError("");
    try {
      setItems(await request<InventorySearchRow[]>("/operations/fulfillment/inventory", {
        query: { adminUserId: ids.adminUserId, search }
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法查询库存。");
    } finally {
      setBusy(false);
    }
  }, [ids.adminUserId, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="仓库履约" title="库存查询" description="按 Barcode、商品名、商品编码或仓位查询库存。" />
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Barcode / 商品名 / 仓位" />
            <Button type="button" disabled={busy} onClick={() => void load()}>
              <SearchIcon data-icon="inline-start" />
              查询
            </Button>
          </div>
        </CardContent>
      </Card>
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>商品</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>仓位</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="size-12 overflow-hidden rounded-md border bg-muted">
                        {item.product.images[0] ? (
                          <img src={item.product.images[0].publicUrl ?? item.product.images[0].originalUrl} alt="" className="size-full object-cover" />
                        ) : null}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{item.product.title ?? item.product.productCode}</p>
                        <p className="text-muted-foreground text-xs">{item.product.category ?? "无分类"} · {item.product.finalSizeLabel ?? "无尺码"}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{item.barcode}</TableCell>
                  <TableCell>{item.location?.locationCode ?? "未分配"}</TableCell>
                  <TableCell><StatusBadge status={item.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

type FulfillmentAction =
  | "start-picking"
  | "confirm-picked"
  | "pack"
  | "ready-for-pickup"
  | "confirm-pickup"
  | "assign-delivery"
  | "complete-delivery"
  | "exception";

function TaskActions({ task, busy, onAction }: { task: FulfillmentTask; busy: string; onAction: (action: FulfillmentAction) => void }) {
  const disabled = Boolean(busy);
  const common = "shrink-0";
  const method = task.order.fulfillmentMethod;

  return (
    <div className="flex flex-wrap gap-2">
      {task.status === "PAID" ? (
        <Button size="sm" className={common} disabled={disabled} onClick={() => onAction("start-picking")}>
          <ClipboardCheckIcon data-icon="inline-start" />
          开始拣货
        </Button>
      ) : null}
      {task.status === "PICKING" && !task.pickedAt ? (
        <Button size="sm" className={common} disabled={disabled} onClick={() => onAction("confirm-picked")}>
          <ScanBarcodeIcon data-icon="inline-start" />
          扫码确认
        </Button>
      ) : null}
      {task.status === "PICKING" && task.pickedAt ? (
        <Button size="sm" className={common} disabled={disabled} onClick={() => onAction("pack")}>
          <PackageCheckIcon data-icon="inline-start" />
          确认打包
        </Button>
      ) : null}
      {task.status === "PACKED" && method === "PICKUP" ? (
        <Button size="sm" className={common} disabled={disabled} onClick={() => onAction("ready-for-pickup")}>
          <CheckCircle2Icon data-icon="inline-start" />
          Ready for pickup
        </Button>
      ) : null}
      {task.status === "READY_FOR_PICKUP" ? (
        <Button size="sm" className={common} disabled={disabled} onClick={() => onAction("confirm-pickup")}>
          <CheckCircle2Icon data-icon="inline-start" />
          确认取货
        </Button>
      ) : null}
      {task.status === "PACKED" && method === "KIKUYU_LOCAL_DELIVERY" ? (
        <Button size="sm" className={common} disabled={disabled} onClick={() => onAction("assign-delivery")}>
          <TruckIcon data-icon="inline-start" />
          分配配送
        </Button>
      ) : null}
      {task.status === "OUT_FOR_DELIVERY" ? (
        <Button size="sm" className={common} disabled={disabled} onClick={() => onAction("complete-delivery")}>
          <CheckCircle2Icon data-icon="inline-start" />
          签收完成
        </Button>
      ) : null}
      {task.status !== "COMPLETED" && task.status !== "EXCEPTION" ? (
        <Button size="sm" variant="outline" className={common} disabled={disabled} onClick={() => onAction("exception")}>
          <AlertTriangleIcon data-icon="inline-start" />
          异常
        </Button>
      ) : null}
    </div>
  );
}

function actionBody(task: FulfillmentTask, action: FulfillmentAction, employeeId: string): Record<string, unknown> | null {
  if (action === "confirm-picked") {
    const expected = task.order.items.map((item) => item.snapshot?.barcode ?? item.inventoryItem?.barcode).filter(Boolean).join(", ");
    const value = window.prompt("扫描或输入本订单全部 Barcode，多个用逗号分隔。", "");
    if (!value) return null;
    return { employeeId, barcode: value, note: expected ? `Expected: ${expected}` : undefined };
  }
  if (action === "pack") {
    const note = window.prompt("包装备注，可留空。", "");
    return { employeeId, packingStatus: "PACKED", note: note ?? undefined };
  }
  if (action === "confirm-pickup") {
    const verification = window.prompt("输入顾客订单号或手机号进行核对。", "");
    if (!verification) return null;
    return { employeeId, verification };
  }
  if (action === "assign-delivery") {
    const riderName = window.prompt("配送员姓名。", "");
    if (!riderName) return null;
    const riderPhone = window.prompt("配送员电话，可留空。", "") ?? "";
    return { employeeId, riderName, riderPhone };
  }
  if (action === "exception") {
    const reason = window.prompt("异常原因：ITEM_NOT_FOUND / BARCODE_MISMATCH / ITEM_DAMAGED / CUSTOMER_CANCELLED / DELIVERY_FAILED / OTHER", "OTHER");
    if (!reason) return null;
    const note = window.prompt("异常备注。", "") ?? "";
    return { employeeId, reason, note };
  }
  return { employeeId };
}

function useOperationIds() {
  const { session } = useOperationsSession();
  return useMemo(() => ({
    adminUserId: session?.adminUser?.id ?? "",
    employeeId: session?.adminUser?.linkedEmployeeId ?? session?.adminUser?.linkedEmployee?.id ?? ""
  }), [session]);
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

function Metric({ title, value, tone }: { title: string; value: number; tone?: string }) {
  return (
    <Card className={cn(tone === "danger" && "border-destructive/40")}>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function ProductImage({ item }: { item: OrderItem }) {
  const imageUrl = item.snapshot?.imageUrl;
  return (
    <div className="size-14 shrink-0 overflow-hidden rounded-md border bg-muted">
      {imageUrl ? <img src={imageUrl} alt="" className="size-full object-cover" /> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "EXCEPTION" ? "destructive" : status === "COMPLETED" ? "secondary" : "outline";
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
    PAID: "已付款",
    PICKING: "拣货中",
    PACKED: "已打包",
    READY_FOR_PICKUP: "待自提",
    OUT_FOR_DELIVERY: "待配送",
    COMPLETED: "已完成",
    EXCEPTION: "异常",
    AVAILABLE: "可售",
    RESERVED: "已锁定",
    PICKED: "已拣货",
    DELIVERED: "已交付"
  };
  return labels[status] ?? status;
}

function methodLabel(method: string): string {
  return method === "KIKUYU_LOCAL_DELIVERY" ? "Kikuyu配送" : "仓库自提";
}

function money(value: number): string {
  return `${value.toLocaleString("en-KE")} KSh`;
}
