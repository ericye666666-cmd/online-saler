"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { RefreshCwIcon } from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const API_PROXY_URL = "/api-proxy";

export type AnalyticsView =
  | "overview"
  | "product-funnel"
  | "payment-conversion"
  | "inventory-sellout"
  | "category-performance"
  | "affiliate-performance"
  | "returns-exceptions"
  | "employee-efficiency";

type Metric = {
  key: string;
  label: string;
  value: number | null;
  unit: "count" | "percent" | "hours" | "ksh";
  status: "AVAILABLE" | "NO_SOURCE";
  definition: string;
  source: string;
  note?: string;
};

type Dashboard = {
  generatedAt: string;
  filters: Record<string, string | null>;
  metrics: Metric[];
  noDataNotes: string[];
  tables: {
    categoryPerformance: Array<{
      category: string;
      createdProducts: number;
      publishedProducts: number;
      paidOrders: number;
    }>;
    affiliatePerformance: Array<{
      affiliateId: string;
      affiliateCode: string;
      displayName: string;
      clicks: number;
      paidOrders: number;
      attributedSalesKsh: number;
      commissions: number;
      commissionAmountKsh: number;
    }>;
    returnsAndExceptions: {
      refunded: number;
      cancelled: number;
      paymentExceptions: number;
      fulfillmentExceptions: number;
      rejectedCommissions: number;
      openServiceCases: number;
    };
    employeeEfficiency: Array<{
      employeeId: string;
      name: string;
      createdProducts: number;
      reviewedProducts: number;
      fulfillmentActions: number;
    }>;
  };
};

type Filters = {
  dateFrom: string;
  dateTo: string;
  category: string;
  employeeId: string;
  affiliateId: string;
  fulfillmentMethod: "" | "PICKUP" | "KIKUYU_LOCAL_DELIVERY";
};

type RequestOptions = RequestInit & {
  query?: Record<string, string | undefined>;
};

const emptyFilters: Filters = {
  dateFrom: "",
  dateTo: "",
  category: "",
  employeeId: "",
  affiliateId: "",
  fulfillmentMethod: ""
};

const viewMeta: Record<AnalyticsView, { title: string; description: string }> = {
  overview: {
    title: "销售概览",
    description: "只展示已经有真实数据来源的指标；缺少埋点的指标会明确标为暂无数据。"
  },
  "product-funnel": {
    title: "商品漏斗",
    description: "从创建商品到发布、Checkout 和支付，先以现有服务端数据计算可用部分。"
  },
  "payment-conversion": {
    title: "支付转化",
    description: "基于 Payment 和 CheckoutDraft 计算支付成功率和 15 分钟过期率。"
  },
  "inventory-sellout": {
    title: "库存售罄",
    description: "基于 InventoryItem 状态计算售罄和履约后的库存流转。"
  },
  "category-performance": {
    title: "分类表现",
    description: "按商品分类查看创建、发布和已付款订单表现。"
  },
  "affiliate-performance": {
    title: "推广者表现",
    description: "按推广者查看点击、归因销售额和佣金。"
  },
  "returns-exceptions": {
    title: "退货与异常",
    description: "展示退款、取消、支付异常、履约异常、佣金异常和客服未结案。"
  },
  "employee-efficiency": {
    title: "员工效率",
    description: "按员工统计商品创建、审核和履约操作数量。"
  }
};

const metricGroups: Record<AnalyticsView, string[]> = {
  overview: [
    "publishedProducts",
    "publishSuccessRate",
    "paymentSuccessRate",
    "reservationExpiryRate",
    "selloutRate",
    "pickupRatio",
    "deliveryRatio",
    "affiliateOrderShare"
  ],
  "product-funnel": ["publishedProducts", "publishSuccessRate", "productViews", "addToCartRate", "checkoutRate"],
  "payment-conversion": ["paymentSuccessRate", "reservationExpiryRate", "checkoutRate"],
  "inventory-sellout": ["selloutRate", "averageSoldHours"],
  "category-performance": ["publishedProducts", "publishSuccessRate"],
  "affiliate-performance": ["affiliateOrderShare"],
  "returns-exceptions": ["paymentSuccessRate", "reservationExpiryRate"],
  "employee-efficiency": ["publishedProducts", "publishSuccessRate"]
};

export function AnalyticsWorkbenchPage({ view }: { view: AnalyticsView }) {
  const { session } = useOperationsSession();
  const adminUserId = session?.adminUser?.id ?? "";
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const meta = viewMeta[view];

  const load = useCallback(async () => {
    if (!adminUserId) return;
    setBusy(true);
    setError("");
    try {
      setDashboard(await request<Dashboard>("/operations/analytics/dashboard", {
        query: {
          adminUserId,
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          category: filters.category || undefined,
          employeeId: filters.employeeId || undefined,
          affiliateId: filters.affiliateId || undefined,
          fulfillmentMethod: filters.fulfillmentMethod || undefined
        }
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取数据看板。");
    } finally {
      setBusy(false);
    }
  }, [adminUserId, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => {
    const allowed = new Set(metricGroups[view]);
    return (dashboard?.metrics ?? []).filter((metric) => allowed.has(metric.key));
  }, [dashboard, view]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="数据分析"
        title={meta.title}
        description={meta.description}
        action={
          <Button variant="outline" disabled={busy} onClick={() => void load()}>
            <RefreshCwIcon data-icon="inline-start" />
            刷新
          </Button>
        }
      />

      <FilterPanel filters={filters} busy={busy} onChange={setFilters} onApply={load} />

      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.key} metric={metric} />
        ))}
      </section>

      {dashboard?.noDataNotes.length ? (
        <Card>
          <CardHeader>
            <CardTitle>暂无数据说明</CardTitle>
            <CardDescription>这些位置不会展示虚构 Demo 数据。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-muted-foreground text-sm">
            {dashboard.noDataNotes.map((note) => <p key={note}>{note}</p>)}
          </CardContent>
        </Card>
      ) : null}

      {view === "category-performance" ? <CategoryTable rows={dashboard?.tables.categoryPerformance ?? []} /> : null}
      {view === "affiliate-performance" ? <AffiliateTable rows={dashboard?.tables.affiliatePerformance ?? []} /> : null}
      {view === "returns-exceptions" ? <ExceptionPanel data={dashboard?.tables.returnsAndExceptions} /> : null}
      {view === "employee-efficiency" ? <EmployeeTable rows={dashboard?.tables.employeeEfficiency ?? []} /> : null}
      {view === "overview" || view === "product-funnel" || view === "payment-conversion" || view === "inventory-sellout" ? (
        <MetricDefinitions metrics={metrics} />
      ) : null}
    </div>
  );
}

function FilterPanel({
  filters,
  busy,
  onChange,
  onApply
}: {
  filters: Filters;
  busy: boolean;
  onChange: (filters: Filters) => void;
  onApply: () => void;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <FieldGroup className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Field>
            <FieldLabel>开始日期</FieldLabel>
            <Input type="date" value={filters.dateFrom} onChange={(event) => onChange({ ...filters, dateFrom: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel>结束日期</FieldLabel>
            <Input type="date" value={filters.dateTo} onChange={(event) => onChange({ ...filters, dateTo: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel>品类</FieldLabel>
            <Input value={filters.category} placeholder="DRESS / SHIRT" onChange={(event) => onChange({ ...filters, category: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel>员工 ID</FieldLabel>
            <Input value={filters.employeeId} onChange={(event) => onChange({ ...filters, employeeId: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel>推广者 ID</FieldLabel>
            <Input value={filters.affiliateId} onChange={(event) => onChange({ ...filters, affiliateId: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel>履约方式</FieldLabel>
            <div className="flex gap-2">
              <NativeSelect
                value={filters.fulfillmentMethod}
                onChange={(event) => onChange({ ...filters, fulfillmentMethod: event.target.value as Filters["fulfillmentMethod"] })}
              >
                <NativeSelectOption value="">全部</NativeSelectOption>
                <NativeSelectOption value="PICKUP">自提</NativeSelectOption>
                <NativeSelectOption value="KIKUYU_LOCAL_DELIVERY">Kikuyu配送</NativeSelectOption>
              </NativeSelect>
              <Button type="button" disabled={busy} onClick={() => void onApply()}>
                应用
              </Button>
            </div>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function MetricCard({ metric }: { metric: Metric }) {
  const unavailable = metric.status === "NO_SOURCE";
  return (
    <Card className={cn(unavailable && "border-dashed")}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardDescription>{metric.label}</CardDescription>
          <Badge variant={unavailable ? "outline" : "secondary"}>{unavailable ? "暂无数据源" : "真实数据"}</Badge>
        </div>
        <CardTitle className="text-2xl">{formatMetric(metric)}</CardTitle>
        <CardDescription>{metric.source}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function MetricDefinitions({ metrics }: { metrics: Metric[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>指标定义</CardTitle>
        <CardDescription>所有指标直接来自后端聚合，不展示虚构 Demo 数据。</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>指标</TableHead>
              <TableHead>定义</TableHead>
              <TableHead>数据来源</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.map((metric) => (
              <TableRow key={metric.key}>
                <TableCell>{metric.label}</TableCell>
                <TableCell>{metric.definition}{metric.note ? <div className="text-muted-foreground text-xs">{metric.note}</div> : null}</TableCell>
                <TableCell>{metric.source}</TableCell>
                <TableCell><Badge variant={metric.status === "NO_SOURCE" ? "outline" : "secondary"}>{metric.status === "NO_SOURCE" ? "暂无数据" : "可用"}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CategoryTable({ rows }: { rows: Dashboard["tables"]["categoryPerformance"] }) {
  return (
    <DataTableCard title="分类表现" empty="当前没有分类数据。" headers={["分类", "创建商品", "已发布", "已付款订单"]}>
      {rows.map((row) => (
        <TableRow key={row.category}>
          <TableCell>{row.category}</TableCell>
          <TableCell>{row.createdProducts}</TableCell>
          <TableCell>{row.publishedProducts}</TableCell>
          <TableCell>{row.paidOrders}</TableCell>
        </TableRow>
      ))}
    </DataTableCard>
  );
}

function AffiliateTable({ rows }: { rows: Dashboard["tables"]["affiliatePerformance"] }) {
  return (
    <DataTableCard title="推广者表现" empty="当前没有推广者数据。" headers={["推广者", "点击", "已付款订单", "归因销售额", "佣金"]}>
      {rows.map((row) => (
        <TableRow key={row.affiliateId}>
          <TableCell>
            <div className="font-medium">{row.displayName}</div>
            <div className="font-mono text-muted-foreground text-xs">{row.affiliateCode}</div>
          </TableCell>
          <TableCell>{row.clicks}</TableCell>
          <TableCell>{row.paidOrders}</TableCell>
          <TableCell>{money(row.attributedSalesKsh)}</TableCell>
          <TableCell>{row.commissions} / {money(row.commissionAmountKsh)}</TableCell>
        </TableRow>
      ))}
    </DataTableCard>
  );
}

function ExceptionPanel({ data }: { data?: Dashboard["tables"]["returnsAndExceptions"] }) {
  const rows = [
    { label: "已退款订单", value: data?.refunded ?? 0 },
    { label: "已取消订单", value: data?.cancelled ?? 0 },
    { label: "支付异常", value: data?.paymentExceptions ?? 0 },
    { label: "履约异常", value: data?.fulfillmentExceptions ?? 0 },
    { label: "驳回佣金", value: data?.rejectedCommissions ?? 0 },
    { label: "未结案客服", value: data?.openServiceCases ?? 0 }
  ];
  return (
    <section className="grid gap-4 md:grid-cols-3">
      {rows.map((row) => (
        <Card key={row.label}>
          <CardHeader>
            <CardDescription>{row.label}</CardDescription>
            <CardTitle>{row.value}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </section>
  );
}

function EmployeeTable({ rows }: { rows: Dashboard["tables"]["employeeEfficiency"] }) {
  return (
    <DataTableCard title="员工效率" empty="当前没有员工操作数据。" headers={["员工", "创建商品", "审核商品", "履约操作"]}>
      {rows.map((row) => (
        <TableRow key={row.employeeId}>
          <TableCell>{row.name}</TableCell>
          <TableCell>{row.createdProducts}</TableCell>
          <TableCell>{row.reviewedProducts}</TableCell>
          <TableCell>{row.fulfillmentActions}</TableCell>
        </TableRow>
      ))}
    </DataTableCard>
  );
}

function DataTableCard({ title, empty, headers, children }: { title: string; empty: string; headers: string[]; children: ReactNode }) {
  const rows = Array.isArray(children) ? children : [children];
  const hasRows = rows.some(Boolean);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((header) => <TableHead key={header}>{header}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {hasRows ? children : (
              <TableRow>
                <TableCell colSpan={headers.length} className="h-28 text-center text-muted-foreground">
                  {empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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

function StatusMessage({ children, tone }: { children: ReactNode; tone?: "danger" }) {
  return (
    <div className={cn("rounded-lg border p-3 text-sm", tone === "danger" ? "border-destructive/30 bg-destructive/10 text-destructive" : "bg-muted")}>
      {children}
    </div>
  );
}

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

function formatMetric(metric: Metric): string {
  if (metric.value === null) return "暂无";
  if (metric.unit === "percent") return `${metric.value.toFixed(1)}%`;
  if (metric.unit === "hours") return `${metric.value.toLocaleString("en-KE")} h`;
  if (metric.unit === "ksh") return money(metric.value);
  return metric.value.toLocaleString("en-KE");
}

function money(value: number): string {
  return `${Math.round(value).toLocaleString("en-KE")} KSh`;
}
