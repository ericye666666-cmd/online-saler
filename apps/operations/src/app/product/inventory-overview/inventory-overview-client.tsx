"use client";

import { useCallback, useEffect, useState } from "react";
import { BoxesIcon, RefreshCwIcon, SearchIcon } from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const API_PROXY_URL = "/api-proxy";

type DistributionRow = { label: string; count: number };
type ShelfRow = { id: string; locationCode: string; status: string; currentItemCount: number; capacity: number; remainingCapacity: number; utilizationPercent: number };
type InventoryOverview = {
  snapshotAt: string;
  metrics: {
    currentWarehouseTotal: number;
    available: number;
    reserved: number;
    paidAwaitingOutbound: number;
    published: number;
    pendingPublish: number;
    sold: number;
  };
  shelfSummary: {
    totalLocations: number;
    activeLocations: number;
    fullLocations: number;
    inactiveLocations: number;
    totalCapacity: number;
    currentItemCount: number;
    remainingCapacity: number;
    utilizationPercent: number;
  };
  categories: Array<{
    category: string;
    subcategory: string;
    currentWarehouseCount: number;
    availableCount: number;
    reservedCount: number;
    publishedCount: number;
    pendingPublishCount: number;
    sharePercent: number;
  }>;
  distributions: { gender: DistributionRow[]; size: DistributionRow[]; condition: DistributionRow[] };
  shelfDistribution: { topOccupied: ShelfRow[]; empty: ShelfRow[]; full: ShelfRow[] };
};

export function InventoryOverviewPage() {
  const { session } = useOperationsSession();
  const adminUserId = session?.adminUser?.id ?? "";
  const [overview, setOverview] = useState<InventoryOverview | null>(null);
  const [category, setCategory] = useState("");
  const [gender, setGender] = useState("ALL");
  const [size, setSize] = useState("");
  const [condition, setCondition] = useState("ALL");
  const [published, setPublished] = useState("ALL");
  const [inventoryStatus, setInventoryStatus] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!adminUserId) return;
    setBusy(true); setError("");
    try {
      setOverview(await api<InventoryOverview>("/operations/inventory-overview", {
        adminUserId,
        category,
        gender: gender === "ALL" ? "" : gender,
        size,
        condition: condition === "ALL" ? "" : condition,
        published: published === "ALL" ? "" : published,
        inventoryStatus: inventoryStatus === "ALL" ? "" : inventoryStatus
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取库存概览。");
    } finally {
      setBusy(false);
    }
  }, [adminUserId, category, condition, gender, inventoryStatus, published, size]);

  useEffect(() => { void load(); }, [load]);

  const metrics = overview ? [
    ["当前仓库商品", overview.metrics.currentWarehouseTotal],
    ["AVAILABLE", overview.metrics.available],
    ["RESERVED", overview.metrics.reserved],
    ["已付款待出库", overview.metrics.paidAwaitingOutbound],
    ["已发布", overview.metrics.published],
    ["待发布", overview.metrics.pendingPublish],
    ["累计已售", overview.metrics.sold],
    ["货架总容量", overview.shelfSummary.totalCapacity],
    ["货架占用", overview.shelfSummary.currentItemCount],
    ["剩余容量", overview.shelfSummary.remainingCapacity],
    ["货架占用率", `${overview.shelfSummary.utilizationPercent}%`]
  ] : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">商品中心 · 实时库存</p>
        <h1 className="text-2xl font-semibold tracking-tight">库存概览</h1>
        <p className="text-sm text-muted-foreground">当前仓库数量只统计仍关联有效货架位且尚未出库的 InventoryItem；历史已售商品不会混入当前库存。</p>
      </div>

      <Card>
        <CardHeader><CardTitle>库存筛选</CardTitle><CardDescription>{overview ? `快照时间：${formatDate(overview.snapshotAt)}` : "读取实时数据库中…"}</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field><FieldLabel htmlFor="inventory-category">Category</FieldLabel><Input id="inventory-category" value={category} onChange={(event) => setCategory(event.target.value)} /></Field>
          <Field><FieldLabel>Gender</FieldLabel><FilterSelect value={gender} onValueChange={setGender} values={["WOMEN", "MEN", "KIDS", "UNISEX"]} /></Field>
          <Field><FieldLabel htmlFor="inventory-size">Size</FieldLabel><Input id="inventory-size" value={size} onChange={(event) => setSize(event.target.value)} /></Field>
          <Field><FieldLabel>Condition</FieldLabel><FilterSelect value={condition} onValueChange={setCondition} values={["LIKE_NEW", "EXCELLENT", "GOOD", "FAIR"]} /></Field>
          <Field><FieldLabel>Published</FieldLabel><FilterSelect value={published} onValueChange={setPublished} values={["published", "unpublished"]} /></Field>
          <Field><FieldLabel>Inventory status</FieldLabel><FilterSelect value={inventoryStatus} onValueChange={setInventoryStatus} values={["PENDING_STOCK_IN", "AVAILABLE", "RESERVED", "PAID", "PICKED", "PACKED", "DELIVERED", "RETURNED", "LOST"]} /></Field>
          <div className="flex items-end gap-2"><Button disabled={busy} onClick={() => void load()}><SearchIcon data-icon="inline-start" />应用筛选</Button><Button variant="outline" disabled={busy} onClick={() => void load()}><RefreshCwIcon data-icon="inline-start" />刷新</Button></div>
        </CardContent>
      </Card>

      {error ? <Alert variant="destructive"><AlertTitle>库存概览读取失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

      {overview ? <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([label, value]) => <Card key={label}><CardHeader className="pb-2"><CardDescription>{label}</CardDescription><CardTitle className="text-2xl tabular-nums">{value}</CardTitle></CardHeader></Card>)}</div>
        <Card>
          <CardHeader><CardTitle>按 Category / Subcategory 的当前库存</CardTitle><CardDescription>Unclassified 单独显示，用于发现分类数据缺口。</CardDescription></CardHeader>
          <CardContent>{overview.categories.length ? <Table><TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Subcategory</TableHead><TableHead>当前仓库</TableHead><TableHead>AVAILABLE</TableHead><TableHead>RESERVED</TableHead><TableHead>已发布</TableHead><TableHead>待发布</TableHead><TableHead>占比</TableHead></TableRow></TableHeader><TableBody>{overview.categories.map((row) => <TableRow key={`${row.category}:${row.subcategory}`}><TableCell className="font-medium">{row.category}</TableCell><TableCell>{row.subcategory}</TableCell><TableCell>{row.currentWarehouseCount}</TableCell><TableCell>{row.availableCount}</TableCell><TableCell>{row.reservedCount}</TableCell><TableCell>{row.publishedCount}</TableCell><TableCell>{row.pendingPublishCount}</TableCell><TableCell>{row.sharePercent}%</TableCell></TableRow>)}</TableBody></Table> : <Empty><EmptyHeader><EmptyMedia variant="icon"><BoxesIcon /></EmptyMedia><EmptyTitle>当前筛选没有仓内商品</EmptyTitle><EmptyDescription>调整筛选条件后重试。</EmptyDescription></EmptyHeader></Empty>}</CardContent>
        </Card>
        <div className="grid gap-4 lg:grid-cols-3"><DistributionCard title="Gender 分布" rows={overview.distributions.gender} /><DistributionCard title="Size 分布" rows={overview.distributions.size} /><DistributionCard title="Condition 分布" rows={overview.distributions.condition} /></div>
        <div className="grid gap-4 lg:grid-cols-3"><ShelfCard title="货架占用 Top" rows={overview.shelfDistribution.topOccupied} /><ShelfCard title="空闲货架位" rows={overview.shelfDistribution.empty} /><ShelfCard title="已满货架位" rows={overview.shelfDistribution.full} /></div>
      </> : null}
    </div>
  );
}

function FilterSelect({ value, onValueChange, values }: { value: string; onValueChange: (value: string) => void; values: string[] }) {
  return <Select value={value} onValueChange={onValueChange}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="ALL">全部</SelectItem>{values.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectGroup></SelectContent></Select>;
}

function DistributionCard({ title, rows }: { title: string; rows: DistributionRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="flex flex-col gap-3">{rows.slice(0, 10).map((row) => <div key={row.label} className="flex flex-col gap-1"><div className="flex justify-between gap-3 text-sm"><span>{row.label}</span><span className="tabular-nums">{row.count}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (row.count / max) * 100)}%` }} /></div></div>)}{rows.length === 0 ? <p className="text-sm text-muted-foreground">暂无数据</p> : null}</CardContent></Card>;
}

function ShelfCard({ title, rows }: { title: string; rows: ShelfRow[] }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="flex flex-col gap-2">{rows.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><div><p className="font-medium">{row.locationCode}</p><p className="text-xs text-muted-foreground">{row.currentItemCount} / {row.capacity} · 剩余 {row.remainingCapacity}</p></div><Badge variant={row.status === "FULL" ? "default" : "outline"}>{row.utilizationPercent}%</Badge></div>)}{rows.length === 0 ? <p className="text-sm text-muted-foreground">暂无数据</p> : null}</CardContent></Card>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN", { hour12: false });
}

async function api<T>(path: string, query: Record<string, string>): Promise<T> {
  const url = new URL(`${API_PROXY_URL}${path}`, window.location.origin);
  Object.entries(query).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
  const response = await fetch(url, { headers: { "Content-Type": "application/json" } });
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!response.ok) throw new Error(body && typeof body === "object" && "message" in body ? String((body as { message?: unknown }).message) : `Request failed: ${response.status}`);
  return body as T;
}
