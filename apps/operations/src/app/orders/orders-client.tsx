"use client";

import { operationsFetch } from "@/lib/operations-api";

import Link from "next/link";
import { parseDeliveryAddress, deliveryMapUrl } from "@online-saler/business-rules";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangleIcon,
  BoxIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ClipboardCheckIcon,
  PackageCheckIcon,
  PrinterIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  ScanBarcodeIcon,
  SearchIcon,
  TruckIcon,
  UserRoundCheckIcon
} from "lucide-react";
import { FulfillmentLabelPrinter } from "../warehouse/fulfillment-label-printer";
import type { FulfillmentLabelInput } from "../warehouse/fulfillment-label-raster";
import { PickingSheetDialog, type PickingLine } from "./picking-sheet";

import { hasPermission, type OperationsSession } from "@/components/admin/operations-access";
import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ORDER_STATUS_TABS, type OrderStatusTab } from "./order-center-routes";
import { AfterSalesPanel } from "./after-sales-panel";
import { operationsRequester } from "@/lib/operations-request";
import { operationsFormatLocale, t } from "@/i18n/runtime";

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
type NodeOption = {
  id: string;
  code: string;
  name: string;
  type: "WAREHOUSE" | "STORE";
  supportsPickup: boolean;
  supportsDelivery: boolean;
};

type OrderNode = { id: string; code: string; name: string; type: "WAREHOUSE" | "STORE" };

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  centerTab: OrderStatusTab;
  fulfillmentMethod: "PICKUP" | "KIKUYU_LOCAL_DELIVERY";
  fulfillmentNode?: OrderNode | null;
  whatsappPhone?: string | null;
  refunds?: Array<{ id: string; amountKsh: number; externalReference: string; refundedAt: string }>;
  totalKsh: number;
  deliveryFeeKsh: number;
  deliveryAddress?: string | null;
  deliveryNote?: string | null;
  createdAt: string;
  customer: { displayName?: string | null; email: string; phone?: string | null };
  affiliate?: { affiliateCode: string; displayName: string } | null;
  payments: Array<{ status: string; phone: string; providerReceiptNumber?: string | null }>;
  items: Array<{
    id: string;
    unitPriceKsh: number;
    quantity: number;
    displayImageUrl?: string | null;
    snapshot?: { title: string; barcode?: string | null; sizeLabel?: string | null; imageUrl?: string | null } | null;
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
    fulfillmentNode?: OrderNode | null;
    packageCode?: string | null;
    sentToNodeAt?: string | null;
    arrivedAtNodeAt?: string | null;
    actualDeliveryCostKsh?: number | null;
    deliveryRiderName?: string | null;
    exceptionReason?: string | null;
    exceptionNote?: string | null;
    exceptionFromStatus?: string | null;
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
    afterSaleReturn?: { id: string } | null;
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
type DialogKind = "assign-picker" | "scan" | "start-packing" | "complete-packing" | "assign-rider" | "confirm-pickup" | "complete-delivery" | "exception" | "assign-after-sale" | "cancel" | "assign-node" | "write-off" | "refund" | "resolve-exception";
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
  const response = await operationsFetch(url.toString(), {
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

/** One order as the label renderer wants it. Shared so a batch and a single print never drift. */
function labelInput(order: OrderRow): FulfillmentLabelInput {
  return {
    packageCode: order.fulfillment?.packageCode ?? "",
    nodeName: order.fulfillment?.fulfillmentNode?.name ?? order.fulfillmentNode?.name ?? "—",
    orderNumber: order.orderNumber,
    isDelivery: order.fulfillmentMethod === "KIKUYU_LOCAL_DELIVERY",
    itemCount: order.items.length,
    customerName: order.customer.displayName,
    customerPhone: order.whatsappPhone ?? order.customer.phone,
    // The pin and the map link are for a screen, not a sticker.
    deliveryAddress: parseDeliveryAddress(order.deliveryAddress ?? "").address,
    deliveryArea: order.deliveryNote,
    items: order.items.map((item) => ({
      title: item.snapshot?.title ?? "Item",
      sizeLabel: item.snapshot?.sizeLabel ?? null,
      barcode: item.snapshot?.barcode ?? item.inventoryItem?.barcode ?? null
    }))
  };
}

/**
 * Where this parcel is going, which is how the morning's work is actually
 * divided: one trolley per store, one pile for the van.
 *
 * A pickup order carries the store the shopper chose at checkout; a delivery
 * order carries the store the warehouse routed it through. Both are the same
 * question — which door does this leave by — so they group the same way.
 */
function destinationOf(order: OrderRow): { key: string; label: string; sort: string } {
  const node = order.fulfillment?.fulfillmentNode ?? order.fulfillmentNode;
  if (order.fulfillmentMethod === "KIKUYU_LOCAL_DELIVERY") {
    return node
      ? { key: `delivery:${node.id}`, label: t("送货上门 · 经 {name}", { name: node.name }), sort: `1:${node.name}` }
      : { key: "delivery:unrouted", label: t("送货上门 · 未指定履约点"), sort: "2" };
  }
  return node
    ? { key: `pickup:${node.id}`, label: t("自提 · {name}", { name: node.name }), sort: `0:${node.name}` }
    : { key: "pickup:unknown", label: t("自提 · 未指定门店"), sort: "2:" };
}

type OrderGroup = { key: string; label: string; sort: string; orders: OrderRow[] };

function groupByDestination(orders: OrderRow[]): OrderGroup[] {
  const groups = new Map<string, OrderGroup>();
  for (const order of orders) {
    const destination = destinationOf(order);
    const existing = groups.get(destination.key);
    if (existing) existing.orders.push(order);
    else groups.set(destination.key, { ...destination, orders: [order] });
  }
  // Stores first and alphabetical, then deliveries, then whatever still has no
  // destination — which is the pile somebody has to deal with before the van goes.
  return [...groups.values()].sort((a, b) => a.sort.localeCompare(b.sort));
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
  const [labelOrders, setLabelOrders] = useState<OrderRow[] | null>(null);
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
      setError(caught instanceof Error ? caught.message : t("无法读取订单中心。 "));
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
      setError(caught instanceof Error ? caught.message : t("订单操作失败。"));
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
      <PageHeader title={t(meta.title)} description={t(meta.description)}>
        <Button variant="outline" disabled={busy} onClick={() => void load()}>
          <RefreshCwIcon data-icon="inline-start" />{t("刷新")}
        </Button>
      </PageHeader>

      {scope === "workbench" || scope === "all" ? (
        <Tabs value={tab} onValueChange={(value) => setTab(value as OrderStatusTab)}>
          <TabsList className="h-auto w-full justify-start overflow-x-auto p-1">
            {ORDER_STATUS_TABS.map(([value, label]) => (
              <TabsTrigger key={value} value={value} className="shrink-0">
                {t(label)}<Badge variant="secondary">{counts[value] ?? 0}</Badge>
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
          <AlertTitle>{t("订单中心操作失败")}</AlertTitle>
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
            onLabel={(target) => setLabelOrders([target])}
          />
        )) : (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ClipboardCheckIcon /></EmptyMedia>
              <EmptyTitle>{busy ? t("正在读取订单") : t("当前筛选下没有订单")}</EmptyTitle>
              <EmptyDescription>{busy ? t("订单、员工和状态数量正在同步。") : t("可以重置筛选，或切换其他状态查看。")}</EmptyDescription>
            </EmptyHeader>
            {!busy ? <EmptyContent><Button variant="outline" onClick={resetFilters}><RotateCcwIcon data-icon="inline-start" />{t("重置筛选")}</Button></EmptyContent> : null}
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
      {labelOrders?.length ? (
        <FulfillmentLabelPrinter labels={labelOrders.map(labelInput)} onClose={() => setLabelOrders(null)} />
      ) : null}
    </div>
  );
}

/**
 * What can be done to everything ticked, pinned to the bottom of the screen.
 *
 * Only actions that fit part of the selection appear, and each says how many
 * orders it will touch — because a mixed selection is normal and "领取拣货 12 单"
 * out of 20 ticked is the honest description of what the button does.
 */
function BatchBar({ orders, session, busy, onClear, onPickingSheet, onLabels, onBatch }: {
  orders: OrderRow[];
  session: OperationsSession | null;
  busy: boolean;
  onClear: () => void;
  onPickingSheet: () => void;
  onLabels: (orders: OrderRow[]) => void;
  onBatch: (orders: OrderRow[], action: string, label: string) => Promise<void>;
}) {
  if (!orders.length) return null;
  const claimable = orders.filter((order) => order.fulfillment?.status === "PAID");
  const printable = orders.filter((order) => order.fulfillment?.packageCode);
  const sendable = orders.filter((order) =>
    order.fulfillment?.status === "PACKED"
    && (order.fulfillment?.fulfillmentNode?.type ?? order.fulfillmentNode?.type) === "STORE");
  const itemCount = orders.reduce((sum, order) => sum + order.items.length, 0);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
        <span className="font-medium">{t("已选 {count} 单 · {items} 件", { count: orders.length, items: itemCount })}</span>
        <Button variant="ghost" size="sm" onClick={onClear}>{t("取消选择")}</Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={busy} onClick={onPickingSheet}>
            <PrinterIcon data-icon="inline-start" />{t("打拣货单")}
          </Button>
          {printable.length && hasPermission(session, "orders.pack") ? (
            <Button variant="outline" disabled={busy} onClick={() => onLabels(printable)}>
              <PrinterIcon data-icon="inline-start" />{t("打面单 {count} 单", { count: printable.length })}
            </Button>
          ) : null}
          {claimable.length && hasPermission(session, "orders.pick") ? (
            <Button disabled={busy} onClick={() => void onBatch(claimable, "claim-picking", t("批量领取拣货"))}>
              <ClipboardCheckIcon data-icon="inline-start" />{t("领取拣货 {count} 单", { count: claimable.length })}
            </Button>
          ) : null}
          {sendable.length && hasPermission(session, "orders.assign-node") ? (
            <Button disabled={busy} onClick={() => void onBatch(sendable, "send-to-node", t("批量发往门店"))}>
              <TruckIcon data-icon="inline-start" />{t("发往门店 {count} 单", { count: sendable.length })}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The four things a morning consists of, in the order they happen. */
const DISPATCH_STEPS = [
  { key: "pick", label: "① 打单拣货", statuses: ["PAID"], hint: "先打一张拣货单，按货架位走一遍。领取拣货后这些单进入下一步。" },
  { key: "scan", label: "② 逐件核对", statuses: ["PICKING"], hint: "拿回来的每一件都要扫码核对。全部核对完，订单自动进入待打包。" },
  { key: "pack", label: "③ 打包", statuses: ["READY_TO_PACK"], hint: "开始打包 → 完成打包。填包装方式和包裹数量，完成时生成包裹号。" },
  { key: "dispatch", label: "④ 打面单发车", statuses: ["PACKED"], hint: "先勾上整组打面单，第 1 张贴箱子、其余放进去，然后整组发往门店。没有履约点的单打不出面单——没有目的地就没有路由贴纸，要先指定。" }
] as const;

type DispatchStep = (typeof DISPATCH_STEPS)[number]["key"];

/**
 * The warehouse's morning, as one screen.
 *
 * The order centre answers "what happened to order DL-…?", which is a different
 * question from "what do I do between eight and eleven". This page answers the
 * second one: it takes every order still inside the warehouse, splits it into
 * the four steps of a morning, and inside each step groups by where the parcel
 * is going — because that is how the work physically divides, one trolley per
 * store and one pile for the van.
 *
 * It writes through the same endpoints as the order centre, so an order moved
 * here shows its new status there, and an order moved there disappears from the
 * step here. There is no separate state to fall out of sync.
 */
export function DailyDispatchPage() {
  const { session } = useOperationsSession();
  const accessToken = session?.accessToken ?? "";
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [step, setStep] = useState<DispatchStep>("pick");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [labelOrders, setLabelOrders] = useState<OrderRow[] | null>(null);
  const [pickingSheet, setPickingSheet] = useState<OrderRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setBusy(true);
    setError("");
    const headers = authorizationHeaders(accessToken);
    try {
      const [nextOrders, nextEmployees] = await Promise.all([
        request<OrderRow[]>("/operations/orders", { query: { scope: "workbench", tab: "all" }, headers }),
        request<Employee[]>("/operations/orders/employees", { headers })
      ]);
      setOrders(nextOrders);
      setEmployees(nextEmployees);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("无法读取今天的出货任务。"));
    } finally {
      setBusy(false);
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);
  // A selection only means anything within one step; carrying it across would
  // act on orders that are no longer on screen.
  useEffect(() => { setSelected(new Set()); }, [step]);

  const byStep = useMemo(() => {
    const map = {} as Record<DispatchStep, OrderRow[]>;
    for (const entry of DISPATCH_STEPS) {
      map[entry.key] = orders.filter((order) => (entry.statuses as readonly string[]).includes(order.fulfillment?.status ?? ""));
    }
    return map;
  }, [orders]);

  const current = DISPATCH_STEPS.find((entry) => entry.key === step)!;
  const stepOrders = byStep[step] ?? [];
  const groups = useMemo(() => groupByDestination(stepOrders), [stepOrders]);
  const selectedOrders = useMemo(() => stepOrders.filter((order) => selected.has(order.id)), [stepOrders, selected]);

  function toggleOrder(orderId: string, value: boolean) {
    setSelected((currentSelection) => {
      const next = new Set(currentSelection);
      if (value) next.add(orderId); else next.delete(orderId);
      return next;
    });
  }

  function toggleGroup(group: OrderGroup, value: boolean) {
    setSelected((currentSelection) => {
      const next = new Set(currentSelection);
      for (const order of group.orders) {
        if (value) next.add(order.id); else next.delete(order.id);
      }
      return next;
    });
  }

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
      setError(caught instanceof Error ? caught.message : t("订单操作失败。"));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Runs one action across the selected orders, one request at a time.
   *
   * Sequential rather than parallel on purpose: these take the same order lock
   * and touch the same stock rows, and firing thirty at once earns thirty
   * conflict errors instead of thirty claimed orders. A failure does not stop
   * the run — one bad order should not cost the other twenty-nine — but each
   * failure is named, because "12 succeeded" does not tell anyone which parcel
   * to go and look at.
   */
  async function batchAction(targets: OrderRow[], action: string, label: string) {
    if (!targets.length) return;
    setBusy(true);
    setError("");
    setNotice("");
    const failures: string[] = [];
    try {
      for (const order of targets) {
        try {
          await request(`/operations/orders/${order.id}/${action}`, {
            method: "POST",
            headers: authorizationHeaders(accessToken),
            body: JSON.stringify({})
          });
        } catch (caught) {
          failures.push(`${order.orderNumber}（${caught instanceof Error ? caught.message : t("未知错误")}）`);
        }
      }
    } finally {
      setBusy(false);
    }
    setSelected(new Set());
    if (failures.length) {
      setError(t("{label}：{done} 单成功，{failed} 单没成功 —— {detail}", {
        label,
        done: targets.length - failures.length,
        failed: failures.length,
        detail: failures.join("；")
      }));
    } else {
      setNotice(t("{label}：{done} 单已完成。", { label, done: targets.length }));
    }
    await load();
  }

  const pickingLines = useMemo<PickingLine[]>(() => (pickingSheet ?? []).flatMap((order) => {
    const destination = destinationOf(order).label;
    return order.items.map((item) => ({
      locationCode: item.inventoryItem?.location?.locationCode ?? "—",
      title: item.snapshot?.title ?? t("未命名商品"),
      sizeLabel: item.snapshot?.sizeLabel ?? null,
      barcode: item.snapshot?.barcode ?? item.inventoryItem?.barcode ?? "—",
      orderNumber: order.orderNumber,
      destination
    }));
  }), [pickingSheet]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("每日打单配送")}
        description={t("仓库一个上午的活：打拣货单、拣货核对、打包贴面单、按门店发车。改的是同一批订单，订单中心会同步更新。")}
      >
        <Button variant="outline" disabled={busy} onClick={() => void load()}>
          <RefreshCwIcon data-icon="inline-start" />{t("刷新")}
        </Button>
      </PageHeader>

      <Tabs value={step} onValueChange={(value) => setStep(value as DispatchStep)}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto p-1">
          {DISPATCH_STEPS.map((entry) => (
            <TabsTrigger key={entry.key} value={entry.key} className="shrink-0">
              {t(entry.label)}<Badge variant="secondary">{(byStep[entry.key] ?? []).length}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <p className="text-muted-foreground text-sm">{t(current.hint)}</p>

      {error ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>{t("有订单没有处理成功")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>{notice}</AlertTitle>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-6 pb-24">
        {groups.length ? groups.map((group) => {
          const allSelected = group.orders.every((order) => selected.has(order.id));
          return (
            <section key={group.key} className="flex flex-col gap-3">
              {/* The destination is the heading because it is how the work
                  divides on the floor: one trolley per store. */}
              <div className="flex flex-wrap items-center gap-3 border-b pb-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(value) => toggleGroup(group, value === true)}
                  aria-label={t("选择这一组的全部订单")}
                />
                <h2 className="font-semibold text-base">{group.label}</h2>
                <Badge variant="secondary">{t("{count} 单", { count: group.orders.length })}</Badge>
              </div>
              {group.orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  session={session}
                  busy={busy}
                  selected={selected.has(order.id)}
                  onSelect={toggleOrder}
                  onDialog={setDialog}
                  onDirect={directAction}
                  onLabel={(target) => setLabelOrders([target])}
                />
              ))}
            </section>
          );
        }) : (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ClipboardCheckIcon /></EmptyMedia>
              <EmptyTitle>{busy ? t("正在读取") : t("这一步没有待办")}</EmptyTitle>
              <EmptyDescription>{busy ? t("正在同步今天的出货任务。") : t("这一步是空的。看看上一步还有没有没做完的。")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <BatchBar
        orders={selectedOrders}
        session={session}
        busy={busy}
        onClear={() => setSelected(new Set())}
        onPickingSheet={() => setPickingSheet(selectedOrders)}
        onLabels={(targets) => setLabelOrders(targets)}
        onBatch={batchAction}
      />

      <OrderActionDialog
        state={dialog}
        employees={employees}
        session={session}
        onClose={() => setDialog(null)}
        onDone={async () => { setDialog(null); await load(); }}
      />
      {labelOrders?.length ? (
        <FulfillmentLabelPrinter labels={labelOrders.map(labelInput)} onClose={() => setLabelOrders(null)} />
      ) : null}
      {pickingSheet?.length ? (
        <PickingSheetDialog lines={pickingLines} onClose={() => setPickingSheet(null)} />
      ) : null}
    </div>
  );
}

export function OrderDetailPage({ orderId }: { orderId: string }) {
  const { session } = useOperationsSession();
  const accessToken = session?.accessToken ?? "";
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [labelOrders, setLabelOrders] = useState<OrderRow[] | null>(null);
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
      setError(caught instanceof Error ? caught.message : t("无法读取订单详情。"));
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
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("订单操作失败。")); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={order?.orderNumber ?? t("订单详情")} description={t("完整商品清单、员工关联、配送信息与状态时间线。")}>
        <Button variant="outline" asChild><Link href="/orders/all">{t("返回全部订单")}</Link></Button>
      </PageHeader>
      {error ? <Alert variant="destructive"><AlertTriangleIcon /><AlertTitle>{t("无法打开订单")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {order ? (
        <>
          <OrderCard order={order} session={session} busy={busy} showTimeline onDialog={setDialog} onDirect={directAction} onLabel={(order) => setLabelOrders([order])} />
          <AfterSalesPanel key={order.id} order={order} session={session} onOrderChanged={load} />
        </>
      ) : (
        <Empty className="min-h-64 border"><EmptyHeader><EmptyTitle>{busy ? t("正在读取") : t("订单不存在")}</EmptyTitle></EmptyHeader></Empty>
      )}
      <OrderActionDialog
        state={dialog}
        employees={employees}
        session={session}
        onClose={() => setDialog(null)}
        onDone={async () => { setDialog(null); await load(); }}
      />
      {labelOrders?.length ? (
        <FulfillmentLabelPrinter labels={labelOrders.map(labelInput)} onClose={() => setLabelOrders(null)} />
      ) : null}
    </div>
  );
}

function PageHeader({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">{t("订单中心")}</p>
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
        <CardTitle>{t("统一筛选")}</CardTitle>
        <CardDescription>{t("先选时间，再按订单、顾客、商品、员工或配送信息缩小范围。")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onChange(dateShortcut(filters, 0, 0))}>{t("今天")}</Button>
          <Button size="sm" variant="outline" onClick={() => onChange(dateShortcut(filters, 1, 1))}>{t("昨天")}</Button>
          <Button size="sm" variant="outline" onClick={() => onChange(dateShortcut(filters, 6, 0))}>{t("最近7天")}</Button>
          <Button size="sm" variant="outline" onClick={() => onChange(dateShortcut(filters, 29, 0))}>{t("最近30天")}</Button>
        </div>
        <FieldGroup className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <TextFilter label={t("开始日期")} type="date" value={filters.dateFrom} onChange={(value) => update("dateFrom", value)} />
          <TextFilter label={t("结束日期")} type="date" value={filters.dateTo} onChange={(value) => update("dateTo", value)} />
          <TextFilter label={t("订单号")} value={filters.orderNumber} onChange={(value) => update("orderNumber", value)} />
          <TextFilter label={t("顾客姓名")} value={filters.customerName} onChange={(value) => update("customerName", value)} />
          <TextFilter label={t("本单付款手机号")} value={filters.customerPhone} onChange={(value) => update("customerPhone", value)} />
          <TextFilter label={t("商品名称")} value={filters.productName} onChange={(value) => update("productName", value)} />
          <TextFilter label="Barcode" value={filters.barcode} onChange={(value) => update("barcode", value)} />
          <TextFilter label={t("配送员")} value={filters.rider} onChange={(value) => update("rider", value)} />
          <TextFilter label="Affiliate" value={filters.affiliate} onChange={(value) => update("affiliate", value)} />
          <SelectFilter label={t("自提或配送")} value={filters.fulfillmentMethod} onChange={(value) => update("fulfillmentMethod", value)} options={[["PICKUP", t("自提")], ["KIKUYU_LOCAL_DELIVERY", t("配送")]]} />
          <SelectFilter label={t("支付状态")} value={filters.paymentStatus} onChange={(value) => update("paymentStatus", value)} options={PAYMENT_OPTIONS} />
          <SelectFilter label={t("订单状态")} value={filters.orderStatus} onChange={(value) => update("orderStatus", value)} options={ORDER_OPTIONS} />
          <EmployeeFilter label={t("拣货员工")} value={filters.pickerEmployeeId} employees={employees} onChange={(value) => update("pickerEmployeeId", value)} />
          <EmployeeFilter label={t("打包员工")} value={filters.packerEmployeeId} employees={employees} onChange={(value) => update("packerEmployeeId", value)} />
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onReset}><RotateCcwIcon data-icon="inline-start" />{t("重置")}</Button>
        <Button disabled={busy} onClick={onApply}><SearchIcon data-icon="inline-start" />{t("应用筛选")}</Button>
      </CardFooter>
    </Card>
  );
}

function TextFilter({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return <Field><FieldLabel>{t(label)}</FieldLabel><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></Field>;
}

function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: ReadonlyArray<readonly [string, string]>; onChange: (value: string) => void }) {
  return (
    <Field><FieldLabel>{t(label)}</FieldLabel>
      <Select value={value || "ALL"} onValueChange={(next) => onChange(next === "ALL" ? "" : next)}>
        <SelectTrigger className="w-full"><SelectValue placeholder={t("全部")} /></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="ALL">{t("全部")}</SelectItem>{options.map(([key, text]) => <SelectItem key={key} value={key}>{t(text)}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
    </Field>
  );
}

function EmployeeFilter({ label, value, employees, onChange }: { label: string; value: string; employees: Employee[]; onChange: (value: string) => void }) {
  return <SelectFilter label={label} value={value} onChange={onChange} options={employees.map((employee) => [employee.id, `${employee.name} · ${employee.employeeCode}`] as const)} />;
}

/**
 * One order, showing only what the current step needs.
 *
 * The card used to open with eight labelled boxes — picker, packer, dispatcher,
 * rider, pickup, after-sales, affiliate, packaging — almost all of them reading
 * 未分配 on a fresh order. Eight empty boxes is not information; it is a form
 * nobody filled in. They now appear one at a time, as the person doing that step
 * is actually recorded, so the card grows a line as the order moves instead of
 * starting full of blanks.
 */
function OrderCard(props: {
  order: OrderRow;
  session: OperationsSession | null;
  busy: boolean;
  showTimeline?: boolean;
  selected?: boolean;
  onSelect?: (orderId: string, selected: boolean) => void;
  onDialog: (state: DialogState) => void;
  onDirect: (order: OrderRow, action: string, body?: Record<string, unknown>) => Promise<void>;
  onLabel: (order: OrderRow) => void;
}) {
  const { order, session, busy, showTimeline, selected, onSelect, onDialog, onDirect, onLabel } = props;
  const delivery = parseDeliveryAddress(order.deliveryAddress ?? "");
  const payment = order.payments[0];
  const fulfillment = order.fulfillment;
  const afterSales = order.customerServiceCases.filter((item) => item.issueType === "AFTER_SALE");
  const people: Array<[string, string]> = [];
  if (fulfillment?.assignedPicker?.name) people.push([t("拣货"), fulfillment.assignedPicker.name]);
  if (fulfillment?.packedBy?.name ?? fulfillment?.packingStartedBy?.name) people.push([t("打包"), (fulfillment?.packedBy?.name ?? fulfillment?.packingStartedBy?.name)!]);
  if (fulfillment?.dispatchedBy?.name) people.push([t("出库"), fulfillment.dispatchedBy.name]);
  if (fulfillment?.deliveryRider?.name ?? fulfillment?.deliveryRiderName) people.push([t("骑手"), (fulfillment?.deliveryRider?.name ?? fulfillment?.deliveryRiderName)!]);
  if (fulfillment?.pickupConfirmedBy?.name) people.push([t("自提确认"), fulfillment.pickupConfirmedBy.name]);
  if (fulfillment?.afterSaleOwner?.name) people.push([t("售后"), fulfillment.afterSaleOwner.name]);
  if (fulfillment?.packagingMethod) people.push([t("包装"), t("{packagingMethod} · {v1}件", { packagingMethod: fulfillment.packagingMethod, v1: fulfillment.packageCount ?? 1 })]);
  if (order.affiliate) people.push(["Affiliate", `${order.affiliate.displayName} · ${order.affiliate.affiliateCode}`]);

  return (
    <Card className="[content-visibility:auto]">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {onSelect ? (
              <Checkbox
                className="mt-1"
                checked={Boolean(selected)}
                onCheckedChange={(value) => onSelect(order.id, value === true)}
                aria-label={t("选择这一单")}
              />
            ) : null}
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-lg">{order.orderNumber}</CardTitle>
                <StatusBadge status={fulfillment?.status ?? order.status} />
                <StatusBadge status={payment?.status ?? "NO_PAYMENT"} />
                {fulfillment?.packageCode ? <Badge variant="outline" className="font-mono">{fulfillment.packageCode}</Badge> : null}
              </div>
              <CardDescription>
                {formatDate(order.createdAt)} · {order.customer.displayName ?? order.customer.email} · {payment?.phone ?? order.customer.phone ?? t("未留手机号")}
              </CardDescription>
              {people.length ? (
                <CardDescription className="flex flex-wrap gap-x-3 gap-y-1">
                  {people.map(([label, value]) => (
                    <span key={label}>{label}：<span className="text-foreground">{value}</span></span>
                  ))}
                </CardDescription>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge variant="outline">{order.fulfillmentMethod === "PICKUP" ? t("自提") : t("配送")}</Badge>
            <span className="font-semibold">{money(order.totalKsh)}</span>
            {!showTimeline ? <Button size="sm" variant="ghost" asChild><Link href={`/orders/${order.id}`}>{t("详情")}</Link></Button> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {order.fulfillmentMethod === "KIKUYU_LOCAL_DELIVERY" ? (
          <div className="rounded-lg border p-3 text-sm">
            <span className="text-muted-foreground">{t("配送地址：")}</span>
            <span className="break-words">{delivery.address || t("未填写")}</span>
            {delivery.point ? <> · <a className="underline" href={deliveryMapUrl(delivery.point)} target="_blank" rel="noopener noreferrer">Google Maps ↗</a></> : null}
            {order.deliveryNote ? <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{order.deliveryNote}</p> : null}
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          {order.items.map((item, index) => {
            const scan = fulfillment?.items.find((candidate) => candidate.orderItemId === item.id);
            return (
              <div key={item.id} className="grid gap-3 rounded-lg border p-2 sm:grid-cols-[72px_1fr_auto] sm:items-center">
                <div className="flex h-20 w-18 items-center justify-center overflow-hidden rounded-md border bg-white">
                  <OrderItemImage src={item.displayImageUrl ?? item.snapshot?.imageUrl} alt={item.snapshot?.title ?? t("商品图片")} />
                </div>
                <div className="min-w-0">
                  {/* The shelf code leads: it is the only thing on this row that
                      tells a picker where to walk. */}
                  <p className="font-semibold text-base">
                    {item.inventoryItem?.location?.locationCode ?? t("货架位未分配")}
                    <span className="ml-2 font-normal text-muted-foreground text-sm">{index + 1}. {item.snapshot?.title ?? t("未命名商品")}</span>
                  </p>
                  <p className="text-muted-foreground text-sm">
                    <span className="font-mono">{scan?.expectedBarcode ?? item.snapshot?.barcode ?? item.inventoryItem?.barcode ?? t("缺失")}</span>
                    {item.snapshot?.sizeLabel ? <> · {item.snapshot.sizeLabel}</> : null} · {money(item.unitPriceKsh)}
                  </p>
                </div>
                <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                  <Badge variant={scan?.status === "VERIFIED" ? "secondary" : "outline"}>{scan?.status === "VERIFIED" ? t("已核对") : t("未核对")}</Badge>
                  {fulfillment?.status === "PICKING" && scan?.status !== "VERIFIED" && hasPermission(session, "orders.pick") ? (
                    <Button size="sm" disabled={busy} onClick={() => onDialog({ kind: "scan", order, item })}><ScanBarcodeIcon data-icon="inline-start" />{t("扫码核对")}</Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {afterSales.length ? <AfterSaleSummary cases={afterSales} /> : null}
        {fulfillment?.status === "EXCEPTION" ? (
          <Alert variant="destructive"><AlertTriangleIcon /><AlertTitle>{statusLabel(fulfillment.exceptionReason ?? "OTHER")}</AlertTitle><AlertDescription>{fulfillment.exceptionNote ?? t("尚未填写异常说明。")}</AlertDescription></Alert>
        ) : null}
        {showTimeline ? <OrderTimeline events={fulfillment?.events ?? []} /> : null}
      </CardContent>
      <CardFooter className="justify-end">
        <OrderActionBar actions={orderActions({ order, session, onDialog, onDirect, onLabel })} busy={busy} />
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
        <span>{t("暂无商品图")}</span>
      </div>
    );
  }
  return <img src={src.startsWith("/") && !src.startsWith("/api-proxy/") ? `/api-proxy${src}` : src} alt={alt} loading="lazy" decoding="async" className="size-full object-contain" onError={() => setFailed(true)} />;
}

type OrderAction = {
  key: string;
  label: string;
  icon: ReactNode;
  run: () => void;
  variant?: "default" | "outline" | "destructive";
};

/**
 * Everything this order can do right now, in the order a warehouse expects.
 *
 * The first entry is the one the card shows as a button; the rest go behind
 * 更多. That split is the point. A 待拣货 order has exactly one thing anyone is
 * meant to do to it, but the card used to offer five buttons at once — reassign,
 * claim, route, raise an exception, write the order off — which reads as a
 * decision to make rather than a task to do, and buries the one button the
 * picker wants under four they will use once a month.
 *
 * Nothing is removed. The rare actions are one click further away.
 */
function orderActions({ order, session, onDialog, onDirect, onLabel }: {
  order: OrderRow;
  session: OperationsSession | null;
  onDialog: (state: DialogState) => void;
  onDirect: (order: OrderRow, action: string, body?: Record<string, unknown>) => Promise<void>;
  onLabel: (order: OrderRow) => void;
}): OrderAction[] {
  const status = order.fulfillment?.status;
  const actions: OrderAction[] = [];
  const nodeType = order.fulfillment?.fulfillmentNode?.type ?? order.fulfillmentNode?.type ?? null;
  const atStoreNode = nodeType === "STORE";
  const hasNode = Boolean(order.fulfillment?.fulfillmentNode ?? order.fulfillmentNode);

  // A packed parcel with nowhere to go is the one case where routing is the
  // next thing to do rather than a correction, so it leads.
  if (status === "PACKED" && !hasNode && hasPermission(session, "orders.assign-node")) {
    actions.push({ key: "node", label: t("指定履约点"), icon: <TruckIcon data-icon="inline-start" />, run: () => onDialog({ kind: "assign-node", order }) });
  }

  if (status === "PAID" && hasPermission(session, "orders.pick")) {
    actions.push({ key: "claim", label: t("领取拣货任务"), icon: <ClipboardCheckIcon data-icon="inline-start" />, run: () => void onDirect(order, "claim-picking") });
  }
  if (status === "READY_TO_PACK" && hasPermission(session, "orders.pack") && !order.fulfillment?.packingStartedAt) {
    actions.push({ key: "start-pack", label: t("开始打包"), icon: <BoxIcon data-icon="inline-start" />, run: () => onDialog({ kind: "start-packing", order }) });
  }
  if (status === "READY_TO_PACK" && hasPermission(session, "orders.pack") && order.fulfillment?.packingStartedAt) {
    actions.push({ key: "pack", label: t("完成打包"), icon: <PackageCheckIcon data-icon="inline-start" />, run: () => onDialog({ kind: "complete-packing", order }) });
  }
  if (status === "PACKED" && atStoreNode && hasPermission(session, "orders.assign-node")) {
    actions.push({ key: "send-node", label: t("发往门店"), icon: <TruckIcon data-icon="inline-start" />, run: () => void onDirect(order, "send-to-node") });
  }
  if (status === "IN_TRANSIT_TO_NODE" && hasPermission(session, "orders.node-receive")) {
    actions.push({ key: "receive-node", label: t("确认到店"), icon: <PackageCheckIcon data-icon="inline-start" />, run: () => void onDirect(order, "receive-at-node") });
  }
  if (["PACKED", "ARRIVED_AT_NODE"].includes(status ?? "") && !(status === "PACKED" && atStoreNode) && order.fulfillmentMethod === "PICKUP" && hasPermission(session, "orders.pack")) {
    actions.push({ key: "pickup-ready", label: t("设为待自提"), icon: <ClipboardCheckIcon data-icon="inline-start" />, run: () => void onDirect(order, "ready-for-pickup") });
  }
  if (["PACKED", "ARRIVED_AT_NODE"].includes(status ?? "") && !(status === "PACKED" && atStoreNode) && order.fulfillmentMethod === "KIKUYU_LOCAL_DELIVERY" && hasPermission(session, "orders.assign-rider")) {
    actions.push({ key: "dispatch-ready", label: t("设为待发货"), icon: <TruckIcon data-icon="inline-start" />, run: () => void onDirect(order, "ready-for-dispatch") });
  }
  if (status === "READY_FOR_DISPATCH" && order.fulfillment?.deliveryRiderId && hasPermission(session, "orders.dispatch")) {
    actions.push({ key: "dispatch", label: t("已交给配送员"), icon: <TruckIcon data-icon="inline-start" />, run: () => void onDirect(order, "dispatch") });
  }
  if (status === "READY_FOR_DISPATCH" && hasPermission(session, "orders.assign-rider")) {
    actions.push({ key: "rider", label: t("分配配送员"), icon: <TruckIcon data-icon="inline-start" />, run: () => onDialog({ kind: "assign-rider", order }), variant: "outline" });
  }
  if (status === "READY_FOR_PICKUP" && hasPermission(session, "orders.complete")) {
    actions.push({ key: "pickup", label: t("确认已取货"), icon: <CheckCircle2Icon data-icon="inline-start" />, run: () => onDialog({ kind: "confirm-pickup", order }) });
  }
  if (status === "OUT_FOR_DELIVERY" && hasPermission(session, "orders.complete")) {
    actions.push({ key: "delivered", label: t("确认送达"), icon: <CheckCircle2Icon data-icon="inline-start" />, run: () => onDialog({ kind: "complete-delivery", order }) });
  }

  // Everything below is a correction, a reprint or an escape hatch.

  if (status === "PAID" && hasPermission(session, "orders.assign-picker")) {
    actions.push({ key: "assign", label: t("分配给其他拣货员"), icon: <UserRoundCheckIcon data-icon="inline-start" />, run: () => onDialog({ kind: "assign-picker", order }), variant: "outline" });
  }
  // Printable as soon as packing assigns a package code, and reprintable at any
  // later step: a sticker that falls off in a van should not need the order
  // rewound to replace it.
  if (order.fulfillment?.packageCode && hasPermission(session, "orders.pack")) {
    actions.push({ key: "label", label: t("打印面单"), icon: <PrinterIcon data-icon="inline-start" />, run: () => onLabel(order), variant: "outline" });
  }
  if (status && !["COMPLETED", "IN_TRANSIT_TO_NODE", "ARRIVED_AT_NODE", "READY_FOR_PICKUP", "READY_FOR_DISPATCH", "OUT_FOR_DELIVERY"].includes(status) && hasPermission(session, "orders.assign-node") && !(status === "PACKED" && !hasNode)) {
    actions.push({ key: "node", label: hasNode ? t("改派履约点") : t("指定履约点"), icon: <TruckIcon data-icon="inline-start" />, run: () => onDialog({ kind: "assign-node", order }), variant: "outline" });
  }
  if (status === "OUT_FOR_DELIVERY" && hasPermission(session, "orders.resend-code")) {
    actions.push({ key: "resend-code", label: t("重发配送码"), icon: <TruckIcon data-icon="inline-start" />, run: () => void onDirect(order, "resend-delivery-code"), variant: "outline" });
  }
  if (order.customerServiceCases.some((item) => item.issueType === "AFTER_SALE") && hasPermission(session, "orders.after-sale")) {
    actions.push({ key: "after-sale", label: t("处理售后"), icon: <ClipboardCheckIcon data-icon="inline-start" />, run: () => onDialog({ kind: "assign-after-sale", order }), variant: "outline" });
  }
  if (status && !["COMPLETED", "EXCEPTION"].includes(status) && ["orders.pick", "orders.pack", "orders.dispatch"].some((permission) => hasPermission(session, permission))) {
    actions.push({ key: "exception", label: t("提交异常事实"), icon: <AlertTriangleIcon data-icon="inline-start" />, run: () => onDialog({ kind: "exception", order }), variant: "outline" });
  }
  if (status === "EXCEPTION" && order.fulfillment?.exceptionFromStatus && !["CANCELLED", "REFUNDED"].includes(order.status) && ["orders.pick", "orders.pack", "orders.dispatch", "orders.node-receive"].some((permission) => hasPermission(session, permission))) {
    actions.push({ key: "resolve-exception", label: t("异常已解决，回到原步骤"), icon: <CheckCircle2Icon data-icon="inline-start" />, run: () => onDialog({ kind: "resolve-exception", order }), variant: "outline" });
  }
  // A paid order cannot simply be cancelled: the garment has to be accounted
  // for and the money has to be given back.
  const paid = Boolean(order.payments?.some((payment) => payment.status === "SUCCESS"));
  if (paid && !["COMPLETED", "CANCELLED", "REFUNDED"].includes(order.status) && hasPermission(session, "orders.write-off")) {
    actions.push({ key: "write-off", label: t("无法履约，作废订单"), icon: <AlertTriangleIcon data-icon="inline-start" />, run: () => onDialog({ kind: "write-off", order }), variant: "destructive" });
  }
  if (paid && ["CANCELLED", "REFUNDED"].includes(order.status) && hasPermission(session, "orders.refund")) {
    actions.push({ key: "refund", label: t("登记退款"), icon: <ClipboardCheckIcon data-icon="inline-start" />, run: () => onDialog({ kind: "refund", order }), variant: "outline" });
  }
  if (!paid && !["COMPLETED", "CANCELLED", "EXPIRED", "REFUNDED"].includes(order.status) && hasPermission(session, "orders.cancel")) {
    actions.push({ key: "cancel", label: t("取消订单"), icon: <AlertTriangleIcon data-icon="inline-start" />, run: () => onDialog({ kind: "cancel", order }), variant: "destructive" });
  }
  return actions;
}

/** The leading action as a button; everything else one click away under 更多. */
function OrderActionBar({ actions, busy }: { actions: OrderAction[]; busy: boolean }) {
  if (!actions.length) return null;
  const [primary, ...rest] = actions;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {rest.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={busy}>{t("更多")}<ChevronDownIcon data-icon="inline-end" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {rest.map((action) => (
              <DropdownMenuItem
                key={action.key}
                disabled={busy}
                variant={action.variant === "destructive" ? "destructive" : "default"}
                onSelect={() => action.run()}
              >
                {action.icon}{action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <Button variant={primary.variant ?? "default"} disabled={busy} onClick={primary.run}>{primary.icon}{primary.label}</Button>
    </div>
  );
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
  const [verificationValue, setVerificationValue] = useState("");
  const [exceptionReason, setExceptionReason] = useState("ITEM_NOT_FOUND");
  const [nodeId, setNodeId] = useState("");
  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [inventoryOutcome, setInventoryOutcome] = useState("LOST");
  const [refundAmountKsh, setRefundAmountKsh] = useState("");
  const [refundReference, setRefundReference] = useState("");
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
    // Never prefilled: the whole point is that the customer supplies it.
    setVerificationValue("");
    const afterSale = state.order.customerServiceCases.find((item) => item.issueType === "AFTER_SALE");
    setAfterSaleStatus(afterSale?.status ?? "OPEN");
    setAfterSaleReason(afterSale?.afterSaleReason ?? afterSale?.title ?? "");
    setCustomerRequest(afterSale?.customerRequest ?? "");
    setRequiresReturn(String(Boolean(afterSale?.requiresReturn)));
    setRequiresRefund(String(Boolean(afterSale?.requiresRefund)));
    setAffectsAffiliateCommission(String(Boolean(afterSale?.affectsAffiliateCommission)));
    setExceptionReason("ITEM_NOT_FOUND"); setNote(""); setError(null);
    setNodeId(state.order.fulfillmentNode?.id ?? "");
    setInventoryOutcome("LOST");
    setRefundAmountKsh(String(state.order.totalKsh ?? ""));
    setRefundReference("");
  }, [session, state]);

  useEffect(() => {
    if (state?.kind !== "assign-node" || !session?.accessToken) return;
    void (async () => {
      try {
        setNodes(await operationsRequester(session.accessToken ?? "")<NodeOption[]>("/operations/orders/nodes"));
      } catch {
        // The select stays empty; the dialog still shows why nothing is listed.
      }
    })();
  }, [session?.accessToken, state?.kind]);

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
    if (state.kind === "confirm-pickup") { path = "confirm-pickup"; body = { ...body, verificationMethod: "PICKUP_CODE", verificationValue }; }
    if (state.kind === "complete-delivery") { path = "complete-delivery"; body = { ...body, code: verificationValue }; }
    if (state.kind === "exception") { path = "exception"; body.reason = exceptionReason; }
    if (state.kind === "assign-node") { path = "assign-node"; body.nodeId = nodeId; }
    if (state.kind === "resolve-exception") { path = "resolve-exception"; }
    if (state.kind === "write-off") { path = "write-off"; body.inventoryOutcome = inventoryOutcome; }
    if (state.kind === "refund") {
      path = "refund";
      body = { ...body, amountKsh: Number(refundAmountKsh), externalReference: refundReference, evidenceNote: note };
    }
    if (state.kind === "assign-after-sale") {
      path = "assign-after-sale";
      const afterSale = state.order.customerServiceCases.find((item) => item.issueType === "AFTER_SALE");
      body = { ...body, employeeId, caseId: afterSale?.id };
      if (!afterSale?.afterSaleReturn) Object.assign(body, {
        status: afterSaleStatus, afterSaleReason, customerRequest,
        requiresReturn: requiresReturn === "true", requiresRefund: requiresRefund === "true",
        affectsAffiliateCommission: affectsAffiliateCommission === "true"
      });
    }
    if (state.kind === "cancel") { path = "cancel"; }
    try {
      await request(`/operations/orders/${orderId}/${path}`, {
        method: "POST",
        headers: authorizationHeaders(session?.accessToken ?? ""),
        body: JSON.stringify(body)
      });
      await onDone();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught : new ApiRequestError(caught instanceof Error ? caught.message : t("订单操作失败。")));
    } finally { setBusy(false); }
  }

  const linkedEmployeeId = session?.adminUser?.linkedEmployee?.id ?? "";
  const selectableEmployees = hasPermission(session, "orders.assign-picker") ? employees : employees.filter((item) => item.id === linkedEmployeeId);
  const managedAfterSale = Boolean(state?.order.customerServiceCases.find((item) => item.issueType === "AFTER_SALE")?.afterSaleReturn);
  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{state ? dialogTitle(state.kind) : t("订单操作")}</DialogTitle>
          <DialogDescription>{state ? t("{orderNumber} · 所有动作都会写入状态时间线。", { orderNumber: state.order.orderNumber }) : ""}</DialogDescription>
        </DialogHeader>
        {state ? (
          <FieldGroup>
            {["assign-picker", "start-packing", "complete-packing", "assign-after-sale"].includes(state.kind) || (state.kind === "assign-rider" && riderType === "INTERNAL") ? (
              <EmployeeFilter label={employeeLabel(state.kind)} value={employeeId} employees={selectableEmployees} onChange={setEmployeeId} />
            ) : null}
            {state.kind === "scan" ? (
              <>
                <Alert><ScanBarcodeIcon /><AlertTitle>{state.item?.snapshot?.title}</AlertTitle><AlertDescription>{t("预期 Barcode:")} {expectedBarcode(state.order, state.item!)}  {t("· 正确货架位:")} {state.item?.inventoryItem?.location?.locationCode ?? t("未分配")}</AlertDescription></Alert>
                <TextFilter label={t("实际扫描 Barcode")} value={barcode} onChange={setBarcode} />
              </>
            ) : null}
            {state.kind === "complete-packing" ? (
              <>
                <Alert><PackageCheckIcon /><AlertTitle>{t("已核对商品")} {state.order.fulfillment?.items.filter((item) => item.status === "VERIFIED").length ?? 0}  {t("件")}</AlertTitle><AlertDescription>{state.order.items.map((item) => item.snapshot?.title ?? t("未命名商品")).join("、")}</AlertDescription></Alert>
                <SelectFilter label={t("包装方式")} value={packagingMethod} onChange={setPackagingMethod} options={[["BAG", "Bag"], ["BOX", "Box"], ["OTHER", "Other"]]} />
                <TextFilter label={t("包裹数量")} type="number" value={packageCount} onChange={setPackageCount} />
              </>
            ) : null}
            {state.kind === "assign-rider" ? (
              <>
                <SelectFilter label={t("配送员类型")} value={riderType} onChange={setRiderType} options={[["INTERNAL", t("内部员工")], ["EXTERNAL", t("外部配送员")]]} />
                {riderType === "EXTERNAL" ? <><TextFilter label={t("姓名")} value={name} onChange={setName} /><TextFilter label={t("手机号")} value={phone} onChange={setPhone} /><TextFilter label={t("配送公司（可选）")} value={company} onChange={setCompany} /><TextFilter label={t("车辆信息（可选）")} value={vehicle} onChange={setVehicle} /></> : null}
                <TextFilter label={t("预计配送时间")} type="datetime-local" value={estimatedDeliveryAt} onChange={setEstimatedDeliveryAt} />
              </>
            ) : null}
            {state.kind === "confirm-pickup" ? (
              <>
                <Alert><CheckCircle2Icon /><AlertTitle>{t("请顾客报出自提码")}</AlertTitle><AlertDescription>{t("顾客自己的订单页上有 4 位自提码。订单号和手机号都印在包裹上，不能当凭证。")}</AlertDescription></Alert>
                <TextFilter label={t("顾客报的自提码")} value={verificationValue} onChange={setVerificationValue} />
              </>
            ) : null}
            {state.kind === "complete-delivery" ? (
              <>
                <Alert><CheckCircle2Icon /><AlertTitle>{t("请顾客报出配送码")}</AlertTitle><AlertDescription>{t("顾客收到货以后，才会把自己订单页上的 4 位配送码报出来。没有这个号码不能确认送达——即使骑手说已经送到了。顾客打不开订单页的话，用「用 WhatsApp 发给顾客」把链接发过去。")}</AlertDescription></Alert>
                <TextFilter label={t("顾客报的配送码")} value={verificationValue} onChange={setVerificationValue} />
              </>
            ) : null}
            {state.kind === "exception" ? <SelectFilter label={t("异常类型")} value={exceptionReason} onChange={setExceptionReason} options={EXCEPTION_OPTIONS} /> : null}
            {state.kind === "assign-node" ? (
              <>
                <Alert><TruckIcon /><AlertTitle>{t("这单在哪里交给顾客？")}</AlertTitle><AlertDescription>{t("选门店时，打包后需要先发往门店、门店扫码签收，才能交给顾客或叫 Bolt。选中央仓则在仓库直接交付。")}</AlertDescription></Alert>
                <SelectFilter
                  label={t("履约点")}
                  value={nodeId}
                  onChange={setNodeId}
                  options={nodes
                    .filter((node) => state.order.fulfillmentMethod === "PICKUP" ? node.supportsPickup : node.supportsDelivery)
                    .map((node) => [node.id, node.type === "WAREHOUSE" ? `${node.name}（${t("中央仓")}）` : node.name] as [string, string])}
                />
              </>
            ) : null}
            {state.kind === "resolve-exception" ? (
              <Alert><CheckCircle2Icon /><AlertTitle>{t("回到")} {statusLabel(state.order.fulfillment?.exceptionFromStatus ?? "")}</AlertTitle><AlertDescription>{t("写清楚问题是怎么解决的，订单会回到异常发生前的那一步继续。")}</AlertDescription></Alert>
            ) : null}
            {state.kind === "write-off" ? (
              <>
                <Alert variant="destructive"><AlertTriangleIcon /><AlertTitle>{t("这单的钱已经收了")}</AlertTitle><AlertDescription>{t("作废后订单会被取消、佣金冲回、商品按你选择的方式处理，并进入待退款列表。退款要在 M-Pesa 里操作完再回来登记凭证。")}</AlertDescription></Alert>
                <SelectFilter
                  label={t("商品怎么处理")}
                  value={inventoryOutcome}
                  onChange={setInventoryOutcome}
                  options={[["LOST", t("找不到 / 已损坏 / 已线下卖掉 —— 记为丢失")], ["RESTOCK", t("商品还在，重新上架销售")]]}
                />
              </>
            ) : null}
            {state.kind === "refund" ? (
              <>
                <Alert><AlertTriangleIcon /><AlertTitle>{t("只登记，不转账")}</AlertTitle><AlertDescription>{t("先在 M-Pesa 里把钱退给顾客，再回到这里登记金额和凭证号。系统不会自动转账。")}</AlertDescription></Alert>
                <TextFilter label={t("退款金额 KSh")} type="number" value={refundAmountKsh} onChange={setRefundAmountKsh} />
                <TextFilter label={t("M-Pesa 冲正 / 付款凭证号")} value={refundReference} onChange={setRefundReference} />
              </>
            ) : null}
            {state.kind === "assign-after-sale" && !managedAfterSale ? <><TextFilter label={t("售后原因")} value={afterSaleReason} onChange={setAfterSaleReason} /><TextFilter label={t("顾客要求")} value={customerRequest} onChange={setCustomerRequest} /><SelectFilter label={t("当前售后状态")} value={afterSaleStatus} onChange={setAfterSaleStatus} options={[["OPEN", t("待处理")], ["IN_PROGRESS", t("处理中")], ["RESOLVED", t("已解决")], ["CLOSED", t("已关闭")]]} /><SelectFilter label={t("是否需要退货")} value={requiresReturn} onChange={setRequiresReturn} options={[["false", t("不需要")], ["true", t("需要")]]} /><SelectFilter label={t("是否需要退款")} value={requiresRefund} onChange={setRequiresRefund} options={[["false", t("不需要")], ["true", t("需要")]]} /><SelectFilter label={t("是否影响 Affiliate 佣金")} value={affectsAffiliateCommission} onChange={setAffectsAffiliateCommission} options={[["false", t("否")], ["true", t("是")]]} /></> : null}
            {state.kind === "assign-after-sale" && managedAfterSale ? <p className="text-muted-foreground text-sm">{t("此处仅分配售后负责人。审批、验收、退款和入库请在订单详情的“退货与退款”区域处理。")}</p> : null}
            {state.kind === "cancel" ? <Alert variant="destructive"><AlertTriangleIcon /><AlertTitle>{t("确认取消这张订单？")}</AlertTitle><AlertDescription>{t("取消会写入状态事件；已经完成或退款的订单不能在此取消。")}</AlertDescription></Alert> : null}
            {state.kind !== "scan" ? <Field><FieldLabel>{t("备注（可选）")}</FieldLabel><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></Field> : null}
          </FieldGroup>
        ) : null}
        {error ? (
          <Alert variant="destructive"><AlertTriangleIcon /><AlertTitle>{error.message}</AlertTitle><AlertDescription>{barcodeErrorDescription(error.details)}</AlertDescription></Alert>
        ) : null}
        <DialogFooter showCloseButton>
          <Button disabled={busy} onClick={() => void submit()}>{busy ? t("正在保存...") : t("确认")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AfterSaleSummary({ cases }: { cases: OrderRow["customerServiceCases"] }) {
  return <div className="flex flex-col gap-2 rounded-lg border p-3"><p className="font-medium">{t("售后信息")}</p>{cases.map((item) => <div key={item.id} className="grid gap-1 text-sm md:grid-cols-2"><span>{t("原因：")}{item.afterSaleReason ?? item.title}</span><span>{t("顾客要求：")}{item.customerRequest ?? t("未填写")}</span><span>{t("负责人：")}{item.assignedEmployee?.name ?? t("未分配")}</span><span>{t("状态：")}{statusLabel(item.status)}</span><span>{t("退货：")}{item.requiresReturn ? t("需要") : t("不需要")}</span><span>{t("退款：")}{item.requiresRefund ? t("需要") : t("不需要")}</span><span>{t("影响 Affiliate 佣金：")}{item.affectsAffiliateCommission ? t("是") : t("否")}</span></div>)}</div>;
}

function OrderTimeline({ events }: { events: FulfillmentEvent[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div><h2 className="font-semibold">{t("状态时间线")}</h2><p className="text-muted-foreground text-sm">{t("当前状态不会覆盖历史事件。")}</p></div>
      {events.length ? <ol className="flex flex-col gap-3 border-l pl-4">{events.map((event) => <li key={event.id} className="relative"><span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary" /><div className="flex flex-wrap items-center gap-2"><strong>{actionLabel(event.action)}</strong><StatusBadge status={event.newStatus} /><span className="text-muted-foreground text-xs">{formatDate(event.createdAt)}</span></div><p className="text-muted-foreground text-sm">{t("操作人：")}{event.actorAdminUser?.name ?? event.actorEmployee?.name ?? t("系统")}{event.relatedEmployee ? t(" · 关联员工：{name}", { name: event.relatedEmployee.name }) : ""}{event.deliveryRider ? t(" · 配送员：{name}", { name: event.deliveryRider.name }) : ""}</p>{event.note ? <p className="text-sm">{event.note}</p> : null}{event.scannedBarcode ? <p className="text-sm">{t("扫描：")}{event.scannedBarcode}{event.expectedBarcode ? t(" · 预期：{expectedBarcode}", { expectedBarcode: event.expectedBarcode }) : ""}</p> : null}</li>)}</ol> : <p className="text-muted-foreground text-sm">{t("尚无状态事件。")}</p>}
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
  return order.fulfillment?.items.find((candidate) => candidate.orderItemId === item.id)?.expectedBarcode ?? item.snapshot?.barcode ?? item.inventoryItem?.barcode ?? t("缺失");
}

function barcodeErrorDescription(details?: Record<string, unknown>) {
  if (!details?.expectedBarcode && !details?.actualBarcode) return t("请检查输入后重试。");
  return t("预期 Barcode: {v0}；实际扫描: {v1}；商品: {v2}；正确货架位: {v3}", { v0: String(details.expectedBarcode ?? t("缺失")), v1: String(details.actualBarcode ?? t("空")), v2: String(details.productName ?? t("未知")), v3: String(details.locationCode ?? t("未分配")) });
}

function dialogTitle(kind: DialogKind) {
  return ({ "assign-picker": t("分配拣货员工"), scan: t("逐件 Barcode 核对"), "start-packing": t("开始打包"), "complete-packing": t("完成打包"), "assign-rider": t("分配配送员"), "confirm-pickup": t("确认顾客已取货"), "complete-delivery": t("用配送码确认送达"), exception: t("提交异常事实"), "assign-after-sale": t("处理售后订单"), cancel: t("取消订单"), "assign-node": t("指定履约点"), "resolve-exception": t("解决异常"), "write-off": t("作废订单并处理库存"), refund: t("登记已完成的退款") } as Record<DialogKind, string>)[kind];
}

function employeeLabel(kind: DialogKind) {
  if (kind === "assign-picker") return t("拣货员工");
  if (kind === "start-packing") return t("打包员工");
  if (kind === "complete-packing") return t("打包员工");
  if (kind === "assign-rider") return t("内部配送员工");
  return t("售后负责人");
}

function actionLabel(action: string) {
  return ({ PAYMENT_CONFIRMED_PICK_TASK_CREATED: t("支付成功并生成拣货任务"), ASSIGN_PICKER: t("分配拣货员"), CLAIM_PICKING_TASK: t("领取拣货任务"), START_PICKING: t("开始拣货"), ITEM_BARCODE_VERIFIED: t("商品 Barcode 核对成功"), BARCODE_REJECTED: t("Barcode 核对失败"), COMPLETE_PICKING: t("完成拣货"), START_PACKING: t("开始打包"), COMPLETE_PACKING: t("完成打包"), READY_FOR_PICKUP: t("等待顾客自提"), READY_FOR_DISPATCH: t("等待发货"), ASSIGN_DELIVERY_RIDER: t("分配配送员"), HAND_TO_DELIVERY_RIDER: t("已交给配送员"), CONFIRM_DELIVERY: t("确认送达"), CONFIRM_CUSTOMER_PICKUP: t("确认已取货"), SUBMIT_EXCEPTION_FACT: t("提交异常事实"), ASSIGN_AFTER_SALE_OWNER: t("分配售后负责人"), UPDATE_AFTER_SALE_CASE: t("更新售后处理"), CANCEL_ORDER: t("取消订单") } as Record<string, string>)[action] ?? action;
}

function statusLabel(status: string) {
  return ({ DRAFT: t("草稿"), PENDING_PAYMENT: t("待付款"), PAYMENT_PROCESSING: t("支付处理中"), DEPOSIT_PAID: t("定金已付待尾款"), DEPOSIT_EXPIRED: t("定金逾期"), PAID: t("待拣货"), PICKING: t("拣货中"), READY_TO_PACK: t("待打包"), PACKED: t("已打包"), IN_TRANSIT_TO_NODE: t("发往门店中"), ARRIVED_AT_NODE: t("已到店"), READY_FOR_PICKUP: t("待自提"), READY_FOR_DISPATCH: t("待发货"), OUT_FOR_DELIVERY: t("配送中"), COMPLETED: t("已完成"), AFTER_SALE: t("售后中"), CANCELLED: t("已取消"), EXPIRED: t("已取消"), REFUNDED: t("已退款"), SUCCESS: t("支付成功"), FAILED: t("支付失败"), MANUAL_REVIEW: t("人工复核"), NO_PAYMENT: t("无支付"), EXCEPTION: t("异常"), ITEM_NOT_FOUND: t("商品找不到"), BARCODE_MISMATCH: t("Barcode 不匹配"), ITEM_DAMAGED: t("商品损坏"), ITEM_SOLD_OFFLINE: t("已线下卖掉"), NODE_NOT_RECEIVED: t("门店未收到"), WRONG_NODE: t("发错门店"), CUSTOMER_UNREACHABLE: t("联系不上顾客"), DELIVERY_FAILED: t("配送失败"), CUSTOMER_CANCELLED: t("顾客取消"), OTHER: t("其他异常"), OPEN: t("待处理"), IN_PROGRESS: t("处理中"), RESOLVED: t("已解决"), CLOSED: t("已关闭") } as Record<string, string>)[status] ?? status;
}

function formatDate(value: string) { return new Date(value).toLocaleString(operationsFormatLocale(), { hour12: false }); }
function money(value: number) { return `${value.toLocaleString("en-KE")} KSh`; }

const PAYMENT_OPTIONS = [["PENDING", "待处理"], ["SUCCESS", "支付成功"], ["FAILED", "支付失败"], ["CANCELLED", "已取消"], ["TIMEOUT", "超时"], ["EXPIRED", "过期"], ["MANUAL_REVIEW", "人工复核"]] as const;
const ORDER_OPTIONS = [["DRAFT", "草稿"], ["PENDING_PAYMENT", "待付款"], ["PAYMENT_PROCESSING", "支付处理中"], ["DEPOSIT_PAID", "定金已付待尾款"], ["DEPOSIT_EXPIRED", "定金逾期"], ["PAID", "已付款"], ["FULFILLING", "履约中"], ["COMPLETED", "已完成"], ["CANCELLED", "已取消"], ["EXPIRED", "已过期"], ["REFUNDED", "已退款"]] as const;
const EXCEPTION_OPTIONS = [["ITEM_NOT_FOUND", "商品找不到"], ["BARCODE_MISMATCH", "Barcode 不匹配"], ["ITEM_DAMAGED", "商品损坏"], ["ITEM_SOLD_OFFLINE", "已线下卖掉"], ["NODE_NOT_RECEIVED", "门店未收到"], ["WRONG_NODE", "发错门店"], ["CUSTOMER_UNREACHABLE", "联系不上顾客"], ["DELIVERY_FAILED", "配送失败"], ["CUSTOMER_CANCELLED", "顾客取消"], ["OTHER", "其他异常"]] as const;
