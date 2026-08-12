"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangleIcon,
  BoxIcon,
  CheckCircle2Icon,
  ClipboardCheckIcon,
  PackageCheckIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  ScanBarcodeIcon,
  SearchIcon,
  TruckIcon,
  UserRoundCheckIcon
} from "lucide-react";

import { hasPermission, type OperationsSession } from "@/components/admin/operations-access";
import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ORDER_STATUS_TABS, type OrderStatusTab } from "./order-center-routes";

const API_PROXY_URL = "/api-proxy";

type Employee = { id: string; employeeCode: string; name: string; phone?: string | null };
type FulfillmentEmployee = { id: string; employeeCode: string; name: string };
type FulfillmentItem = {
  orderItemId: string;
  expectedBarcode?: string | null;
  status: "PENDING" | "VERIFIED";
  scannedBarcode?: string | null;
  verifiedAt?: string | null;
  verifiedBy?: FulfillmentEmployee | null;
};
type DeliveryRider = {
  id: string;
  type: "INTERNAL" | "EXTERNAL";
  name: string;
  phone?: string | null;
  company?: string | null;
  vehicle?: string | null;
};
type FulfillmentEvent = {
  id: string;
  action: string;
  oldStatus?: string | null;
  newStatus: string;
  note?: string | null;
  expectedBarcode?: string | null;
  scannedBarcode?: string | null;
  createdAt: string;
  actorAdminUser?: { name: string } | null;
  actorEmployee?: FulfillmentEmployee | null;
  relatedEmployee?: FulfillmentEmployee | null;
  deliveryRider?: DeliveryRider | null;
  orderItem?: { snapshot?: { title?: string | null } | null } | null;
};
type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  centerTab: OrderStatusTab;
  fulfillmentMethod: "PICKUP" | "KIKUYU_LOCAL_DELIVERY";
  pickupCode?: string | null;
  totalKsh: number;
  deliveryFeeKsh: number;
  createdAt: string;
  customer: { displayName?: string | null; email: string; phone?: string | null };
  affiliate?: { affiliateCode: string; displayName: string } | null;
  payments: Array<{ status: string; phone: string; providerReceiptNumber?: string | null }>;
  items: Array<{
    id: string;
    unitPriceKsh: number;
    quantity: number;
    displayImageUrl?: string | null;
    snapshot?: { title: string; barcode?: string | null; imageUrl?: string | null } | null;
    inventoryItem?: { id: string; barcode: string; status: string; location?: { id: string; locationCode: string } | null } | null;
  }>;
  fulfillment?: {
    id: string;
    status: string;
    assignedPickerEmployeeId?: string | null;
    packingStartedByEmployeeId?: string | null;
    packingStartedAt?: string | null;
    packedByEmployeeId?: string | null;
    dispatchedByEmployeeId?: string | null;
    afterSaleOwnerEmployeeId?: string | null;
    packagingMethod?: string | null;
    packageCount?: number | null;
    deliveryRiderId?: string | null;
    assignedPicker?: FulfillmentEmployee | null;
    packingStartedBy?: FulfillmentEmployee | null;
    packedBy?: FulfillmentEmployee | null;
    dispatchedBy?: FulfillmentEmployee | null;
    pickupConfirmedBy?: FulfillmentEmployee | null;
    afterSaleOwner?: FulfillmentEmployee | null;
    deliveryRider?: DeliveryRider | null;
    exceptionReason?: string | null;
    exceptionNote?: string | null;
    items: FulfillmentItem[];
    events: FulfillmentEvent[];
  } | null;
  customerServiceCases: Array<{
    id: string;
    issueType: string;
    status: string;
    title: string;
    afterSaleReason?: string | null;
    customerRequest?: string | null;
    requiresReturn: boolean;
    requiresRefund: boolean;
    affectsAffiliateCommission: boolean;
    assignedEmployee?: FulfillmentEmployee | null;
  }>;
};

type Filters = {
  dateFrom: string;
  dateTo: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  barcode: string;
  fulfillmentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  pickerEmployeeId: string;
  packerEmployeeId: string;
  rider: string;
  affiliate: string;
};

type Scope = "workbench" | "all" | "after-sales" | "exceptions";
type DialogKind = "assign-picker" | "scan" | "start-packing" | "complete-packing" | "assign-rider" | "confirm-pickup" | "exception" | "assign-after-sale" | "cancel";
type DialogState = { kind: DialogKind; order: OrderRow; item?: OrderRow["items"][number] } | null;
type RequestOptions = RequestInit & { query?: Record<string, string | undefined> };

class ApiRequestError extends Error {
  constructor(message: string, readonly details?: Record<string, unknown>) {
    super(message);
  }
}

const EMPTY_FILTERS: Filters = {
  dateFrom: "",
  dateTo: "",
  orderNumber: "",
  customerName: "",
  customerPhone: "",
  productName: "",
  barcode: "",
  fulfillmentMethod: "",
  paymentStatus: "",
  orderStatus: "",
  pickerEmployeeId: "",
  packerEmployeeId: "",
  rider: "",
  affiliate: ""
};

const PAGE_META: Record<Scope, { title: string; description: string }> = {
  workbench: { title: "订单工作台", description: "从支付确认到拣货、打包、自提、配送、售后和异常的统一控制台。" },
  all: { title: "全部订单", description: "按状态、顾客、商品、员工、配送员或 Affiliate 查找完整订单。" },
  "after-sales": { title: "售后订单", description: "客服负责退款和退货判断；仓库员工只记录已发生的事实。" },
  exceptions: { title: "异常订单", description: "集中处理找不到商品、Barcode 不匹配、损坏、配送失败和顾客取消。" }
};

async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  const url = new URL(`${API_PROXY_URL}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(options?.query ?? {})) if (value) url.searchParams.set(key, value);
  const response = await fetch(url.toString(), {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) }
  });
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text || `Request failed: ${response.status}` }; }
  if (!response.ok) {
    const details = body && typeof body === "object" ? body as Record<string, unknown> : undefined;
    throw new ApiRequestError(details?.message ? String(details.message) : `Request failed: ${response.status}`, details);
  }
  return body as T;
}

export function OrderCenterPage({ scope }: { scope: Scope }) {
  const { session } = useOperationsSession();
  const accessToken = session?.accessToken ?? "";
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [counts, setCounts] = useState<Record<OrderStatusTab, number>>({} as Record<OrderStatusTab, number>);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [tab, setTab] = useState<OrderStatusTab>(scope === "after-sales" ? "after-sale" : "all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const meta = PAGE_META[scope];

  useEffect(() => {
    if (scope !== "workbench" && scope !== "all") return;
    const initial = new URLSearchParams(window.location.search).get("status") as OrderStatusTab | null;
    if (initial && ORDER_STATUS_TABS.some(([value]) => value === initial)) setTab(initial);
  }, [scope]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setBusy(true);
    setError("");
    const query = queryFromFilters(scope, tab, appliedFilters);
    const headers = authorizationHeaders(accessToken);
    try {
      const [nextOrders, nextCounts, nextEmployees] = await Promise.all([
        request<OrderRow[]>("/operations/orders", { query, headers }),
        request<Record<OrderStatusTab, number>>("/operations/orders/summary", { query: { ...query, tab: "all" }, headers }),
        request<Employee[]>("/operations/orders/employees", { headers })
      ]);
      setOrders(nextOrders);
      setCounts(nextCounts);
      setEmployees(nextEmployees);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取订单中心。 ");
    } finally {
      setBusy(false);
    }
  }, [accessToken, appliedFilters, scope, tab]);

  useEffect(() => { void load(); }, [load]);

  async function directAction(order: OrderRow, action: string, body?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await request(`/operations/orders/${order.id}/${action}`, {
        method: "POST",
        headers: authorizationHeaders(accessToken),
        body: JSON.stringify(body ?? {})
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "订单操作失败。");
    } finally {
      setBusy(false);
    }
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setTab(scope === "after-sales" ? "after-sale" : "all");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={meta.title} description={meta.description}>
        <Button variant="outline" disabled={busy} onClick={() => void load()}>
          <RefreshCwIcon data-icon="inline-start" />刷新
        </Button>
      </PageHeader>

      {scope === "workbench" || scope === "all" ? (
        <Tabs value={tab} onValueChange={(value) => setTab(value as OrderStatusTab)}>
          <TabsList className="h-auto w-full justify-start overflow-x-auto p-1">
            {ORDER_STATUS_TABS.map(([value, label]) => (
              <TabsTrigger key={value} value={value} className="shrink-0">
                {label}<Badge variant="secondary">{counts[value] ?? 0}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}

      <OrderFilters
        filters={filters}
        employees={employees}
        onChange={setFilters}
        onApply={() => setAppliedFilters(filters)}
        onReset={resetFilters}
        busy={busy}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>订单中心操作失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-4">
        {orders.length ? orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            session={session}
            busy={busy}
            onDialog={setDialog}
            onDirect={directAction}
          />
        )) : (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ClipboardCheckIcon /></EmptyMedia>
              <EmptyTitle>{busy ? "正在读取订单" : "当前筛选下没有订单"}</EmptyTitle>
              <EmptyDescription>{busy ? "订单、员工和状态数量正在同步。" : "可以重置筛选，或切换其他状态查看。"}</EmptyDescription>
            </EmptyHeader>
            {!busy ? <EmptyContent><Button variant="outline" onClick={resetFilters}><RotateCcwIcon data-icon="inline-start" />重置筛选</Button></EmptyContent> : null}
          </Empty>
        )}
      </div>

      <OrderActionDialog
        state={dialog}
        employees={employees}
        session={session}
        onClose={() => setDialog(null)}
        onDone={async () => { setDialog(null); await load(); }}
      />
    </div>
  );
}

export function OrderDetailPage({ orderId }: { orderId: string }) {
  const { session } = useOperationsSession();
  const accessToken = session?.accessToken ?? "";
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setBusy(true);
    setError("");
    try {
      const [detail, people] = await Promise.all([
        request<OrderRow>(`/operations/orders/${orderId}`, { headers: authorizationHeaders(accessToken) }),
        request<Employee[]>("/operations/orders/employees", { headers: authorizationHeaders(accessToken) })
      ]);
      setOrder(detail);
      setEmployees(people);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取订单详情。");
    } finally { setBusy(false); }
  }, [accessToken, orderId]);

  useEffect(() => { void load(); }, [load]);

  async function directAction(current: OrderRow, action: string, body?: Record<string, unknown>) {
    setBusy(true);
    try {
      await request(`/operations/orders/${current.id}/${action}`, {
        method: "POST",
        headers: authorizationHeaders(accessToken),
        body: JSON.stringify(body ?? {})
      });
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "订单操作失败。"); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={order?.orderNumber ?? "订单详情"} description="完整商品清单、员工关联、配送信息与状态时间线。">
        <Button variant="outline" asChild><Link href="/orders/all">返回全部订单</Link></Button>
      </PageHeader>
      {error ? <Alert variant="destructive"><AlertTriangleIcon /><AlertTitle>无法打开订单</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {order ? (
        <OrderCard order={order} session={session} busy={busy} showTimeline onDialog={setDialog} onDirect={directAction} />
      ) : (
        <Empty className="min-h-64 border"><EmptyHeader><EmptyTitle>{busy ? "正在读取" : "订单不存在"}</EmptyTitle></EmptyHeader></Empty>
      )}
      <OrderActionDialog
        state={dialog}
        employees={employees}
        session={session}
        onClose={() => setDialog(null)}
        onDone={async () => { setDialog(null); await load(); }}
      />
    </div>
  );
}

function PageHeader({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">订单中心</p>
        <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
        <p className="max-w-3xl text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </div>
  );
}

function OrderFilters(props: {
  filters: Filters;
  employees: Employee[];
  busy: boolean;
  onChange: (filters: Filters) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  const { filters, employees, busy, onChange, onApply, onReset } = props;
  const update = (key: keyof Filters, value: string) => onChange({ ...filters, [key]: value });
  return (
    <Card>
      <CardHeader>
        <CardTitle>统一筛选</CardTitle>
        <CardDescription>先选时间，再按订单、顾客、商品、员工或配送信息缩小范围。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onChange(dateShortcut(filters, 0, 0))}>今天</Button>
          <Button size="sm" variant="outline" onClick={() => onChange(dateShortcut(filters, 1, 1))}>昨天</Button>
          <Button size="sm" variant="outline" onClick={() => onChange(dateShortcut(filters, 6, 0))}>最近7天</Button>
          <Button size="sm" variant="outline" onClick={() => onChange(dateShortcut(filters, 29, 0))}>最近30天</Button>
        </div>
        <FieldGroup className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <TextFilter label="开始日期" type="date" value={filters.dateFrom} onChange={(value) => update("dateFrom", value)} />
          <TextFilter label="结束日期" type="date" value={filters.dateTo} onChange={(value) => update("dateTo", value)} />
          <TextFilter label="订单号" value={filters.orderNumber} onChange={(value) => update("orderNumber", value)} />
          <TextFilter label="顾客姓名" value={filters.customerName} onChange={(value) => update("customerName", value)} />
          <TextFilter label="顾客手机号" value={filters.customerPhone} onChange={(value) => update("customerPhone", value)} />
          <TextFilter label="商品名称" value={filters.productName} onChange={(value) => update("productName", value)} />
          <TextFilter label="Barcode" value={filters.barcode} onChange={(value) => update("barcode", value)} />
          <TextFilter label="配送员" value={filters.rider} onChange={(value) => update("rider", value)} />
          <TextFilter label="Affiliate" value={filters.affiliate} onChange={(value) => update("affiliate", value)} />
          <SelectFilter label="自提或配送" value={filters.fulfillmentMethod} onChange={(value) => update("fulfillmentMethod", value)} options={[["PICKUP", "自提"], ["KIKUYU_LOCAL_DELIVERY", "配送"]]} />
          <SelectFilter label="支付状态" value={filters.paymentStatus} onChange={(value) => update("paymentStatus", value)} options={PAYMENT_OPTIONS} />
          <SelectFilter label="订单状态" value={filters.orderStatus} onChange={(value) => update("orderStatus", value)} options={ORDER_OPTIONS} />
          <EmployeeFilter label="拣货员工" value={filters.pickerEmployeeId} employees={employees} onChange={(value) => update("pickerEmployeeId", value)} />
          <EmployeeFilter label="打包员工" value={filters.packerEmployeeId} employees={employees} onChange={(value) => update("packerEmployeeId", value)} />
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onReset}><RotateCcwIcon data-icon="inline-start" />重置</Button>
        <Button disabled={busy} onClick={onApply}><SearchIcon data-icon="inline-start" />应用筛选</Button>
      </CardFooter>
    </Card>
  );
}

function TextFilter({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return <Field><FieldLabel>{label}</FieldLabel><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></Field>;
}

function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: ReadonlyArray<readonly [string, string]>; onChange: (value: string) => void }) {
  return (
    <Field><FieldLabel>{label}</FieldLabel>
      <Select value={value || "ALL"} onValueChange={(next) => onChange(next === "ALL" ? "" : next)}>
        <SelectTrigger className="w-full"><SelectValue placeholder="全部" /></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="ALL">全部</SelectItem>{options.map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
    </Field>
  );
}

function EmployeeFilter({ label, value, employees, onChange }: { label: string; value: string; employees: Employee[]; onChange: (value: string) => void }) {
  return <SelectFilter label={label} value={value} onChange={onChange} options={employees.map((employee) => [employee.id, `${employee.name} · ${employee.employeeCode}`] as const)} />;
}

function OrderCard(props: {
  order: OrderRow;
  session: OperationsSession | null;
  busy: boolean;
  showTimeline?: boolean;
  onDialog: (state: DialogState) => void;
  onDirect: (order: OrderRow, action: string, body?: Record<string, unknown>) => Promise<void>;
}) {
  const { order, session, busy, showTimeline, onDialog, onDirect } = props;
  const payment = order.payments[0];
  const fulfillment = order.fulfillment;
  const afterSales = order.customerServiceCases.filter((item) => item.issueType === "AFTER_SALE");
  return (
    <Card className="[content-visibility:auto]">
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">{order.orderNumber}</CardTitle>
              <StatusBadge status={fulfillment?.status ?? order.status} />
              <StatusBadge status={payment?.status ?? "NO_PAYMENT"} />
            </div>
            <CardDescription>{formatDate(order.createdAt)} · {order.customer.displayName ?? order.customer.email} · {order.customer.phone ?? payment?.phone ?? "未留手机号"}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{order.fulfillmentMethod === "PICKUP" ? "自提" : "配送"}</Badge>
            <span className="font-semibold">{money(order.totalKsh)}</span>
            {!showTimeline ? <Button size="sm" variant="outline" asChild><Link href={`/orders/${order.id}`}>查看详情与历史</Link></Button> : null}
          </div>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Assignment label="拣货员工" value={fulfillment?.assignedPicker?.name} />
          <Assignment label="打包员工" value={fulfillment?.packedBy?.name ?? fulfillment?.packingStartedBy?.name} />
          <Assignment label="出库确认" value={fulfillment?.dispatchedBy?.name} />
          <Assignment label="配送员" value={fulfillment?.deliveryRider?.name} />
          <Assignment label="自提确认" value={fulfillment?.pickupConfirmedBy?.name} />
          <Assignment label="售后负责人" value={fulfillment?.afterSaleOwner?.name} />
          <Assignment label="Affiliate" value={order.affiliate ? `${order.affiliate.displayName} · ${order.affiliate.affiliateCode}` : undefined} />
          <Assignment label="包装" value={fulfillment?.packagingMethod ? `${fulfillment.packagingMethod} · ${fulfillment.packageCount ?? 1}件` : undefined} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Separator />
        <div className="flex flex-col gap-3">
          {order.items.map((item, index) => {
            const scan = fulfillment?.items.find((candidate) => candidate.orderItemId === item.id);
            return (
              <div key={item.id} className="grid gap-4 rounded-lg border p-3 sm:grid-cols-[112px_1fr_auto] sm:items-center">
                <div className="flex h-32 w-28 items-center justify-center overflow-hidden rounded-md border bg-white">
                  <OrderItemImage src={item.displayImageUrl ?? item.snapshot?.imageUrl} alt={item.snapshot?.title ?? "商品图片"} />
                </div>
                <div className="min-w-0">
                  <p className="font-medium">{index + 1}. {item.snapshot?.title ?? "未命名商品"}</p>
                  <div className="mt-1 grid gap-x-4 gap-y-1 text-muted-foreground text-sm md:grid-cols-3">
                    <span>Barcode: <strong className="text-foreground">{scan?.expectedBarcode ?? item.snapshot?.barcode ?? item.inventoryItem?.barcode ?? "缺失"}</strong></span>
                    <span>货架位: <strong className="text-foreground">{item.inventoryItem?.location?.locationCode ?? "未分配"}</strong></span>
                    <span>价格: <strong className="text-foreground">{money(item.unitPriceKsh)}</strong></span>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                  <Badge variant={scan?.status === "VERIFIED" ? "secondary" : "outline"}>{scan?.status === "VERIFIED" ? "已核对" : "未核对"}</Badge>
                  {fulfillment?.status === "PICKING" && scan?.status !== "VERIFIED" && hasPermission(session, "orders.pick") ? (
                    <Button size="sm" disabled={busy} onClick={() => onDialog({ kind: "scan", order, item })}><ScanBarcodeIcon data-icon="inline-start" />扫码核对</Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {afterSales.length ? <AfterSaleSummary cases={afterSales} /> : null}
        {fulfillment?.status === "EXCEPTION" ? (
          <Alert variant="destructive"><AlertTriangleIcon /><AlertTitle>{statusLabel(fulfillment.exceptionReason ?? "OTHER")}</AlertTitle><AlertDescription>{fulfillment.exceptionNote ?? "尚未填写异常说明。"}</AlertDescription></Alert>
        ) : null}
        {showTimeline ? <OrderTimeline events={fulfillment?.events ?? []} /> : null}
      </CardContent>
      <CardFooter className="flex-wrap justify-end gap-2">
        <OrderActions order={order} session={session} busy={busy} onDialog={onDialog} onDirect={onDirect} />
      </CardFooter>
    </Card>
  );
}

function OrderItemImage({ src, alt }: { src?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 text-center text-muted-foreground text-xs">
        <PackageCheckIcon className="size-7" />
        <span>暂无商品图</span>
      </div>
    );
  }
  return <img src={src} alt={alt} className="size-full object-contain" onError={() => setFailed(true)} />;
}

function OrderActions({ order, session, busy, onDialog, onDirect }: {
  order: OrderRow;
  session: OperationsSession | null;
  busy: boolean;
  onDialog: (state: DialogState) => void;
  onDirect: (order: OrderRow, action: string, body?: Record<string, unknown>) => Promise<void>;
}) {
  const status = order.fulfillment?.status;
  const actions: ReactNode[] = [];
  if (status === "PAID" && hasPermission(session, "orders.assign-picker")) actions.push(<Button key="assign" variant="outline" disabled={busy} onClick={() => onDialog({ kind: "assign-picker", order })}><UserRoundCheckIcon data-icon="inline-start" />分配拣货员</Button>);
  if (status === "PAID" && hasPermission(session, "orders.pick")) actions.push(<Button key="claim" disabled={busy} onClick={() => void onDirect(order, "claim-picking")}><ClipboardCheckIcon data-icon="inline-start" />领取拣货任务</Button>);
  if (status === "READY_TO_PACK" && hasPermission(session, "orders.pack") && !order.fulfillment?.packingStartedAt) actions.push(<Button key="start-pack" disabled={busy} onClick={() => onDialog({ kind: "start-packing", order })}><BoxIcon data-icon="inline-start" />开始打包</Button>);
  if (status === "READY_TO_PACK" && hasPermission(session, "orders.pack") && order.fulfillment?.packingStartedAt) actions.push(<Button key="pack" disabled={busy} onClick={() => onDialog({ kind: "complete-packing", order })}><PackageCheckIcon data-icon="inline-start" />完成打包</Button>);
  if (status === "PACKED" && order.fulfillmentMethod === "PICKUP" && hasPermission(session, "orders.pack")) actions.push(<Button key="pickup-ready" disabled={busy} onClick={() => void onDirect(order, "ready-for-pickup")}><ClipboardCheckIcon data-icon="inline-start" />设为待自提</Button>);
  if (status === "PACKED" && order.fulfillmentMethod === "KIKUYU_LOCAL_DELIVERY" && hasPermission(session, "orders.assign-rider")) actions.push(<Button key="dispatch-ready" disabled={busy} onClick={() => void onDirect(order, "ready-for-dispatch")}><TruckIcon data-icon="inline-start" />设为待发货</Button>);
  if (status === "READY_FOR_DISPATCH" && hasPermission(session, "orders.assign-rider")) actions.push(<Button key="rider" variant="outline" disabled={busy} onClick={() => onDialog({ kind: "assign-rider", order })}><TruckIcon data-icon="inline-start" />分配配送员</Button>);
  if (status === "READY_FOR_DISPATCH" && order.fulfillment?.deliveryRiderId && hasPermission(session, "orders.dispatch")) actions.push(<Button key="dispatch" disabled={busy} onClick={() => void onDirect(order, "dispatch")}><TruckIcon data-icon="inline-start" />已交给配送员</Button>);
  if (status === "READY_FOR_PICKUP" && hasPermission(session, "orders.complete")) actions.push(<Button key="pickup" disabled={busy} onClick={() => onDialog({ kind: "confirm-pickup", order })}><CheckCircle2Icon data-icon="inline-start" />确认已取货</Button>);
  if (status === "OUT_FOR_DELIVERY" && hasPermission(session, "orders.complete")) actions.push(<Button key="delivered" disabled={busy} onClick={() => void onDirect(order, "complete-delivery")}><CheckCircle2Icon data-icon="inline-start" />确认送达</Button>);
  if (order.customerServiceCases.some((item) => item.issueType === "AFTER_SALE") && hasPermission(session, "orders.after-sale")) actions.push(<Button key="after-sale" variant="outline" disabled={busy} onClick={() => onDialog({ kind: "assign-after-sale", order })}>处理售后</Button>);
  if (status && !["COMPLETED", "EXCEPTION"].includes(status) && ["orders.pick", "orders.pack", "orders.dispatch"].some((permission) => hasPermission(session, permission))) actions.push(<Button key="exception" variant="outline" disabled={busy} onClick={() => onDialog({ kind: "exception", order })}><AlertTriangleIcon data-icon="inline-start" />提交异常事实</Button>);
  if (!["COMPLETED", "CANCELLED", "EXPIRED", "REFUNDED"].includes(order.status) && hasPermission(session, "orders.cancel")) actions.push(<Button key="cancel" variant="destructive" disabled={busy} onClick={() => onDialog({ kind: "cancel", order })}>取消订单</Button>);
  return actions;
}

function OrderActionDialog(props: {
  state: DialogState;
  employees: Employee[];
  session: OperationsSession | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { state, employees, session, onClose, onDone } = props;
  const [employeeId, setEmployeeId] = useState("");
  const [barcode, setBarcode] = useState("");
  const [packagingMethod, setPackagingMethod] = useState("BAG");
  const [packageCount, setPackageCount] = useState("1");
  const [riderType, setRiderType] = useState("INTERNAL");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [estimatedDeliveryAt, setEstimatedDeliveryAt] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("ORDER_NUMBER");
  const [verificationValue, setVerificationValue] = useState("");
  const [exceptionReason, setExceptionReason] = useState("ITEM_NOT_FOUND");
  const [afterSaleStatus, setAfterSaleStatus] = useState("OPEN");
  const [afterSaleReason, setAfterSaleReason] = useState("");
  const [customerRequest, setCustomerRequest] = useState("");
  const [requiresReturn, setRequiresReturn] = useState("false");
  const [requiresRefund, setRequiresRefund] = useState("false");
  const [affectsAffiliateCommission, setAffectsAffiliateCommission] = useState("false");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiRequestError | null>(null);

  useEffect(() => {
    if (!state) return;
    const linkedEmployeeId = session?.adminUser?.linkedEmployee?.id ?? "";
    setEmployeeId(linkedEmployeeId);
    setBarcode(""); setPackagingMethod("BAG"); setPackageCount("1"); setRiderType("INTERNAL");
    setName(""); setPhone(""); setCompany(""); setVehicle(""); setEstimatedDeliveryAt("");
    setVerificationMethod("ORDER_NUMBER"); setVerificationValue(state.order.orderNumber);
    const afterSale = state.order.customerServiceCases.find((item) => item.issueType === "AFTER_SALE");
    setAfterSaleStatus(afterSale?.status ?? "OPEN");
    setAfterSaleReason(afterSale?.afterSaleReason ?? afterSale?.title ?? "");
    setCustomerRequest(afterSale?.customerRequest ?? "");
    setRequiresReturn(String(Boolean(afterSale?.requiresReturn)));
    setRequiresRefund(String(Boolean(afterSale?.requiresRefund)));
    setAffectsAffiliateCommission(String(Boolean(afterSale?.affectsAffiliateCommission)));
    setExceptionReason("ITEM_NOT_FOUND"); setNote(""); setError(null);
  }, [session, state]);

  async function submit() {
    if (!state) return;
    setBusy(true); setError(null);
    const orderId = state.order.id;
    let path = "";
    let body: Record<string, unknown> = { note };
    if (state.kind === "assign-picker") { path = "assign-picker"; body.employeeId = employeeId; }
    if (state.kind === "scan") { path = `items/${state.item!.id}/scan`; body.barcode = barcode; }
    if (state.kind === "start-packing") { path = "start-packing"; body.employeeId = employeeId; }
    if (state.kind === "complete-packing") { path = "complete-packing"; body = { ...body, employeeId, packagingMethod, packageCount: Number(packageCount) }; }
    if (state.kind === "assign-rider") { path = "assign-rider"; body = { ...body, riderType, employeeId: riderType === "INTERNAL" ? employeeId : undefined, name, phone, company, vehicle, estimatedDeliveryAt: estimatedDeliveryAt ? new Date(estimatedDeliveryAt).toISOString() : undefined }; }
    if (state.kind === "confirm-pickup") { path = "confirm-pickup"; body = { ...body, verificationMethod, verificationValue }; }
    if (state.kind === "exception") { path = "exception"; body.reason = exceptionReason; }
    if (state.kind === "assign-after-sale") { path = "assign-after-sale"; body = { ...body, employeeId, caseId: state.order.customerServiceCases.find((item) => item.issueType === "AFTER_SALE")?.id, status: afterSaleStatus, afterSaleReason, customerRequest, requiresReturn: requiresReturn === "true", requiresRefund: requiresRefund === "true", affectsAffiliateCommission: affectsAffiliateCommission === "true" }; }
    if (state.kind === "cancel") { path = "cancel"; }
    try {
      await request(`/operations/orders/${orderId}/${path}`, {
        method: "POST",
        headers: authorizationHeaders(session?.accessToken ?? ""),
        body: JSON.stringify(body)
      });
      await onDone();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught : new ApiRequestError(caught instanceof Error ? caught.message : "订单操作失败。"));
    } finally { setBusy(false); }
  }

  const linkedEmployeeId = session?.adminUser?.linkedEmployee?.id ?? "";
  const selectableEmployees = hasPermission(session, "orders.assign-picker") ? employees : employees.filter((item) => item.id === linkedEmployeeId);
  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{state ? dialogTitle(state.kind) : "订单操作"}</DialogTitle>
          <DialogDescription>{state ? `${state.order.orderNumber} · 所有动作都会写入状态时间线。` : ""}</DialogDescription>
        </DialogHeader>
        {state ? (
          <FieldGroup>
            {["assign-picker", "start-packing", "complete-packing", "assign-after-sale"].includes(state.kind) || (state.kind === "assign-rider" && riderType === "INTERNAL") ? (
              <EmployeeFilter label={employeeLabel(state.kind)} value={employeeId} employees={selectableEmployees} onChange={setEmployeeId} />
            ) : null}
            {state.kind === "scan" ? (
              <>
                <Alert><ScanBarcodeIcon /><AlertTitle>{state.item?.snapshot?.title}</AlertTitle><AlertDescription>预期 Barcode: {expectedBarcode(state.order, state.item!)} · 正确货架位: {state.item?.inventoryItem?.location?.locationCode ?? "未分配"}</AlertDescription></Alert>
                <TextFilter label="实际扫描 Barcode" value={barcode} onChange={setBarcode} />
              </>
            ) : null}
            {state.kind === "complete-packing" ? (
              <>
                <Alert><PackageCheckIcon /><AlertTitle>已核对商品 {state.order.fulfillment?.items.filter((item) => item.status === "VERIFIED").length ?? 0} 件</AlertTitle><AlertDescription>{state.order.items.map((item) => item.snapshot?.title ?? "未命名商品").join("、")}</AlertDescription></Alert>
                <SelectFilter label="包装方式" value={packagingMethod} onChange={setPackagingMethod} options={[["BAG", "Bag"], ["BOX", "Box"], ["OTHER", "Other"]]} />
                <TextFilter label="包裹数量" type="number" value={packageCount} onChange={setPackageCount} />
              </>
            ) : null}
            {state.kind === "assign-rider" ? (
              <>
                <SelectFilter label="配送员类型" value={riderType} onChange={setRiderType} options={[["INTERNAL", "内部员工"], ["EXTERNAL", "外部配送员"]]} />
                {riderType === "EXTERNAL" ? <><TextFilter label="姓名" value={name} onChange={setName} /><TextFilter label="手机号" value={phone} onChange={setPhone} /><TextFilter label="配送公司（可选）" value={company} onChange={setCompany} /><TextFilter label="车辆信息（可选）" value={vehicle} onChange={setVehicle} /></> : null}
                <TextFilter label="预计配送时间" type="datetime-local" value={estimatedDeliveryAt} onChange={setEstimatedDeliveryAt} />
              </>
            ) : null}
            {state.kind === "confirm-pickup" ? <><SelectFilter label="核对方式" value={verificationMethod} onChange={setVerificationMethod} options={[["ORDER_NUMBER", "订单号"], ["PHONE", "手机号"], ["PICKUP_CODE", "自提码"]]} /><TextFilter label="核对值" value={verificationValue} onChange={setVerificationValue} /></> : null}
            {state.kind === "exception" ? <SelectFilter label="异常类型" value={exceptionReason} onChange={setExceptionReason} options={EXCEPTION_OPTIONS} /> : null}
            {state.kind === "assign-after-sale" ? <><TextFilter label="售后原因" value={afterSaleReason} onChange={setAfterSaleReason} /><TextFilter label="顾客要求" value={customerRequest} onChange={setCustomerRequest} /><SelectFilter label="当前售后状态" value={afterSaleStatus} onChange={setAfterSaleStatus} options={[["OPEN", "待处理"], ["IN_PROGRESS", "处理中"], ["RESOLVED", "已解决"], ["CLOSED", "已关闭"]]} /><SelectFilter label="是否需要退货" value={requiresReturn} onChange={setRequiresReturn} options={[["false", "不需要"], ["true", "需要"]]} /><SelectFilter label="是否需要退款" value={requiresRefund} onChange={setRequiresRefund} options={[["false", "不需要"], ["true", "需要"]]} /><SelectFilter label="是否影响 Affiliate 佣金" value={affectsAffiliateCommission} onChange={setAffectsAffiliateCommission} options={[["false", "否"], ["true", "是"]]} /></> : null}
            {state.kind === "cancel" ? <Alert variant="destructive"><AlertTriangleIcon /><AlertTitle>确认取消这张订单？</AlertTitle><AlertDescription>取消会写入状态事件；已经完成或退款的订单不能在此取消。</AlertDescription></Alert> : null}
            {state.kind !== "scan" ? <Field><FieldLabel>备注（可选）</FieldLabel><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></Field> : null}
          </FieldGroup>
        ) : null}
        {error ? (
          <Alert variant="destructive"><AlertTriangleIcon /><AlertTitle>{error.message}</AlertTitle><AlertDescription>{barcodeErrorDescription(error.details)}</AlertDescription></Alert>
        ) : null}
        <DialogFooter showCloseButton>
          <Button disabled={busy} onClick={() => void submit()}>{busy ? "正在保存..." : "确认"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Assignment({ label, value }: { label: string; value?: string | null }) {
  return <div className="rounded-md bg-muted/40 px-3 py-2"><span className="text-muted-foreground">{label}</span><p className="mt-0.5 font-medium">{value || "未分配"}</p></div>;
}

function AfterSaleSummary({ cases }: { cases: OrderRow["customerServiceCases"] }) {
  return <div className="flex flex-col gap-2 rounded-lg border p-3"><p className="font-medium">售后信息</p>{cases.map((item) => <div key={item.id} className="grid gap-1 text-sm md:grid-cols-2"><span>原因：{item.afterSaleReason ?? item.title}</span><span>顾客要求：{item.customerRequest ?? "未填写"}</span><span>负责人：{item.assignedEmployee?.name ?? "未分配"}</span><span>状态：{statusLabel(item.status)}</span><span>退货：{item.requiresReturn ? "需要" : "不需要"}</span><span>退款：{item.requiresRefund ? "需要" : "不需要"}</span><span>影响 Affiliate 佣金：{item.affectsAffiliateCommission ? "是" : "否"}</span></div>)}</div>;
}

function OrderTimeline({ events }: { events: FulfillmentEvent[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div><h2 className="font-semibold">状态时间线</h2><p className="text-muted-foreground text-sm">当前状态不会覆盖历史事件。</p></div>
      {events.length ? <ol className="flex flex-col gap-3 border-l pl-4">{events.map((event) => <li key={event.id} className="relative"><span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary" /><div className="flex flex-wrap items-center gap-2"><strong>{actionLabel(event.action)}</strong><StatusBadge status={event.newStatus} /><span className="text-muted-foreground text-xs">{formatDate(event.createdAt)}</span></div><p className="text-muted-foreground text-sm">操作人：{event.actorAdminUser?.name ?? event.actorEmployee?.name ?? "系统"}{event.relatedEmployee ? ` · 关联员工：${event.relatedEmployee.name}` : ""}{event.deliveryRider ? ` · 配送员：${event.deliveryRider.name}` : ""}</p>{event.note ? <p className="text-sm">{event.note}</p> : null}{event.scannedBarcode ? <p className="text-sm">扫描：{event.scannedBarcode}{event.expectedBarcode ? ` · 预期：${event.expectedBarcode}` : ""}</p> : null}</li>)}</ol> : <p className="text-muted-foreground text-sm">尚无状态事件。</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const destructive = ["FAILED", "MANUAL_REVIEW", "EXCEPTION", "BARCODE_MISMATCH"].includes(status);
  const positive = ["SUCCESS", "PAID", "PACKED", "COMPLETED", "VERIFIED"].includes(status);
  return <Badge variant={destructive ? "destructive" : positive ? "secondary" : "outline"}>{statusLabel(status)}</Badge>;
}

function queryFromFilters(scope: Scope, tab: OrderStatusTab, filters: Filters) {
  return { scope, tab, ...Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, value || undefined])) };
}

function authorizationHeaders(accessToken: string): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

function dateShortcut(filters: Filters, daysAgoStart: number, daysAgoEnd: number): Filters {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgoStart);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgoEnd);
  return { ...filters, dateFrom: localDate(start), dateTo: localDate(end) };
}

function localDate(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function expectedBarcode(order: OrderRow, item: OrderRow["items"][number]) {
  return order.fulfillment?.items.find((candidate) => candidate.orderItemId === item.id)?.expectedBarcode ?? item.snapshot?.barcode ?? item.inventoryItem?.barcode ?? "缺失";
}

function barcodeErrorDescription(details?: Record<string, unknown>) {
  if (!details?.expectedBarcode && !details?.actualBarcode) return "请检查输入后重试。";
  return `预期 Barcode: ${String(details.expectedBarcode ?? "缺失")}；实际扫描: ${String(details.actualBarcode ?? "空")}；商品: ${String(details.productName ?? "未知")}；正确货架位: ${String(details.locationCode ?? "未分配")}`;
}

function dialogTitle(kind: DialogKind) {
  return ({ "assign-picker": "分配拣货员工", scan: "逐件 Barcode 核对", "start-packing": "开始打包", "complete-packing": "完成打包", "assign-rider": "分配配送员", "confirm-pickup": "确认顾客已取货", exception: "提交异常事实", "assign-after-sale": "处理售后订单", cancel: "取消订单" } as Record<DialogKind, string>)[kind];
}

function employeeLabel(kind: DialogKind) {
  if (kind === "assign-picker") return "拣货员工";
  if (kind === "start-packing") return "打包员工";
  if (kind === "complete-packing") return "打包员工";
  if (kind === "assign-rider") return "内部配送员工";
  return "售后负责人";
}

function actionLabel(action: string) {
  return ({ PAYMENT_CONFIRMED_PICK_TASK_CREATED: "支付成功并生成拣货任务", ASSIGN_PICKER: "分配拣货员", CLAIM_PICKING_TASK: "领取拣货任务", START_PICKING: "开始拣货", ITEM_BARCODE_VERIFIED: "商品 Barcode 核对成功", BARCODE_REJECTED: "Barcode 核对失败", COMPLETE_PICKING: "完成拣货", START_PACKING: "开始打包", COMPLETE_PACKING: "完成打包", READY_FOR_PICKUP: "等待顾客自提", READY_FOR_DISPATCH: "等待发货", ASSIGN_DELIVERY_RIDER: "分配配送员", HAND_TO_DELIVERY_RIDER: "已交给配送员", CONFIRM_DELIVERY: "确认送达", CONFIRM_CUSTOMER_PICKUP: "确认已取货", SUBMIT_EXCEPTION_FACT: "提交异常事实", ASSIGN_AFTER_SALE_OWNER: "分配售后负责人", UPDATE_AFTER_SALE_CASE: "更新售后处理", CANCEL_ORDER: "取消订单" } as Record<string, string>)[action] ?? action;
}

function statusLabel(status: string) {
  return ({ DRAFT: "草稿", PENDING_PAYMENT: "待付款", PAYMENT_PROCESSING: "支付处理中", PAID: "待拣货", PICKING: "拣货中", READY_TO_PACK: "待打包", PACKED: "已打包", READY_FOR_PICKUP: "待自提", READY_FOR_DISPATCH: "待发货", OUT_FOR_DELIVERY: "配送中", COMPLETED: "已完成", AFTER_SALE: "售后中", CANCELLED: "已取消", EXPIRED: "已取消", REFUNDED: "已退款", SUCCESS: "支付成功", FAILED: "支付失败", MANUAL_REVIEW: "人工复核", NO_PAYMENT: "无支付", EXCEPTION: "异常", ITEM_NOT_FOUND: "商品找不到", BARCODE_MISMATCH: "Barcode 不匹配", ITEM_DAMAGED: "商品损坏", DELIVERY_FAILED: "配送失败", CUSTOMER_CANCELLED: "顾客取消", OTHER: "其他异常", OPEN: "待处理", IN_PROGRESS: "处理中", RESOLVED: "已解决", CLOSED: "已关闭" } as Record<string, string>)[status] ?? status;
}

function formatDate(value: string) { return new Date(value).toLocaleString("zh-CN", { hour12: false }); }
function money(value: number) { return `${value.toLocaleString("en-KE")} KSh`; }

const PAYMENT_OPTIONS = [["PENDING", "待处理"], ["SUCCESS", "支付成功"], ["FAILED", "支付失败"], ["CANCELLED", "已取消"], ["TIMEOUT", "超时"], ["EXPIRED", "过期"], ["MANUAL_REVIEW", "人工复核"]] as const;
const ORDER_OPTIONS = [["DRAFT", "草稿"], ["PENDING_PAYMENT", "待付款"], ["PAYMENT_PROCESSING", "支付处理中"], ["PAID", "已付款"], ["FULFILLING", "履约中"], ["COMPLETED", "已完成"], ["CANCELLED", "已取消"], ["EXPIRED", "已过期"], ["REFUNDED", "已退款"]] as const;
const EXCEPTION_OPTIONS = [["ITEM_NOT_FOUND", "商品找不到"], ["BARCODE_MISMATCH", "Barcode 不匹配"], ["ITEM_DAMAGED", "商品损坏"], ["DELIVERY_FAILED", "配送失败"], ["CUSTOMER_CANCELLED", "顾客取消"], ["OTHER", "其他异常"]] as const;
