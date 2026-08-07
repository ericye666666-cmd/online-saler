"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BoxesIcon,
  EyeIcon,
  MapPinnedIcon,
  MoveRightIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon
} from "lucide-react";

import { hasPermission } from "@/components/admin/operations-access";
import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const API_PROXY_URL = "/api-proxy";

type LocationStatus = "ACTIVE" | "FULL" | "INACTIVE";

type InventoryRow = {
  id: string;
  barcode: string;
  status: string;
  product: { productCode: string; title?: string | null };
};

type LocationRow = {
  id: string;
  locationCode: string;
  capacity: number;
  currentItemCount: number;
  remainingCapacity: number;
  utilizationPercent: number;
  status: LocationStatus;
  note?: string | null;
  updatedAt: string;
  inventoryItems: InventoryRow[];
};

type LocationSummary = {
  totalLocations: number;
  activeLocations: number;
  fullLocations: number;
  inactiveLocations: number;
  totalCapacity: number;
  currentItemCount: number;
  remainingCapacity: number;
  utilizationPercent: number;
};

type DialogMode = "create" | "bulk" | "capacity" | "view" | "move" | null;

export function WarehouseLocationsPage() {
  const { session } = useOperationsSession();
  const adminUserId = session?.adminUser?.id ?? "";
  const canManage = hasPermission(session, "warehouse-locations.manage");
  const canEditCapacity = hasPermission(session, "warehouse-locations.edit-capacity");
  const canMove = hasPermission(session, "warehouse-locations.move-product");
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [summary, setSummary] = useState<LocationSummary | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [minCapacity, setMinCapacity] = useState("");
  const [maxCapacity, setMaxCapacity] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [onlyFull, setOnlyFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [selectedLocation, setSelectedLocation] = useState<LocationRow | null>(null);
  const [movingItem, setMovingItem] = useState<InventoryRow | null>(null);

  const load = useCallback(async () => {
    if (!adminUserId) return;
    setBusy(true);
    setError("");
    try {
      const query = {
        adminUserId,
        search,
        status: status === "ALL" ? "" : status,
        minCapacity,
        maxCapacity,
        onlyAvailable: onlyAvailable ? "true" : "",
        onlyFull: onlyFull ? "true" : ""
      };
      const [nextLocations, nextSummary] = await Promise.all([
        api<LocationRow[]>("/operations/warehouse-locations", query),
        api<LocationSummary>("/operations/warehouse-locations/summary", { adminUserId })
      ]);
      setLocations(nextLocations);
      setSummary(nextSummary);
    } catch (caught) {
      setError(errorMessage(caught, "无法读取货架位。"));
    } finally {
      setBusy(false);
    }
  }, [adminUserId, maxCapacity, minCapacity, onlyAvailable, onlyFull, search, status]);

  useEffect(() => { void load(); }, [load]);

  async function changeStatus(location: LocationRow, nextStatus: "ACTIVE" | "INACTIVE") {
    setBusy(true);
    setError("");
    try {
      await api(`/operations/warehouse-locations/${location.id}/status`, undefined, {
        method: "PATCH",
        body: JSON.stringify({ adminUserId, status: nextStatus })
      });
      await load();
    } catch (caught) {
      setError(errorMessage(caught, "无法更新货架位状态。"));
    } finally {
      setBusy(false);
    }
  }

  function openDialog(mode: DialogMode, location?: LocationRow, item?: InventoryRow) {
    setSelectedLocation(location ?? null);
    setMovingItem(item ?? null);
    setDialog(mode);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">商品中心 · 仓库</p>
          <h1 className="text-2xl font-semibold tracking-tight">货架位管理</h1>
          <p className="text-sm text-muted-foreground">按容量管理多件商品。系统只向启用且未满的货架位分配新商品。</p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => openDialog("bulk")}><PlusIcon data-icon="inline-start" />批量生成</Button>
            <Button onClick={() => openDialog("create")}><PlusIcon data-icon="inline-start" />新增货架位</Button>
          </div>
        ) : null}
      </div>

      {summary ? <SummaryCards summary={summary} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>筛选货架位</CardTitle>
          <CardDescription>状态和可用容量均由实时库存计算。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Field><FieldLabel htmlFor="shelf-search">货架编码或商品</FieldLabel><Input id="shelf-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="A-010101" /></Field>
            <Field><FieldLabel>状态</FieldLabel><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="ALL">全部</SelectItem><SelectItem value="ACTIVE">可用</SelectItem><SelectItem value="FULL">已满</SelectItem><SelectItem value="INACTIVE">已停用</SelectItem></SelectGroup></SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="min-capacity">最小容量</FieldLabel><Input id="min-capacity" type="number" min={1} value={minCapacity} onChange={(event) => setMinCapacity(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="max-capacity">最大容量</FieldLabel><Input id="max-capacity" type="number" min={1} value={maxCapacity} onChange={(event) => setMaxCapacity(event.target.value)} /></Field>
            <div className="flex items-end gap-2"><Button disabled={busy} onClick={() => void load()}><SearchIcon data-icon="inline-start" />应用</Button><Button variant="outline" disabled={busy} onClick={() => void load()}><RefreshCwIcon data-icon="inline-start" />刷新</Button></div>
          </div>
          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={onlyAvailable} onCheckedChange={(checked) => setOnlyAvailable(checked === true)} />仅显示有空位</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={onlyFull} onCheckedChange={(checked) => setOnlyFull(checked === true)} />仅显示已满</label>
          </div>
        </CardContent>
      </Card>

      {error ? <Alert variant="destructive"><AlertTitle>货架位操作失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

      {locations.length ? (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader><TableRow><TableHead>货架位</TableHead><TableHead>状态</TableHead><TableHead>当前 / 容量</TableHead><TableHead>剩余</TableHead><TableHead>占用率</TableHead><TableHead>最后更新</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
              <TableBody>
                {locations.map((location) => (
                  <TableRow key={location.id}>
                    <TableCell className="font-medium">{location.locationCode}</TableCell>
                    <TableCell><StatusBadge status={location.status} /></TableCell>
                    <TableCell className="tabular-nums">{location.currentItemCount} / {location.capacity}</TableCell>
                    <TableCell className="tabular-nums">{location.remainingCapacity}</TableCell>
                    <TableCell className="tabular-nums">{location.utilizationPercent}%</TableCell>
                    <TableCell>{formatDate(location.updatedAt)}</TableCell>
                    <TableCell><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => openDialog("view", location)}><EyeIcon data-icon="inline-start" />查看商品</Button>{canEditCapacity ? <Button size="sm" variant="outline" onClick={() => openDialog("capacity", location)}><PencilIcon data-icon="inline-start" />容量</Button> : null}{canManage ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void changeStatus(location, location.status === "INACTIVE" ? "ACTIVE" : "INACTIVE")}>{location.status === "INACTIVE" ? "启用" : "停用"}</Button> : null}</div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : <Empty className="min-h-64 border"><EmptyHeader><EmptyMedia variant="icon"><MapPinnedIcon /></EmptyMedia><EmptyTitle>{busy ? "正在读取货架位" : "没有符合条件的货架位"}</EmptyTitle><EmptyDescription>调整搜索、状态或容量筛选后重试。</EmptyDescription></EmptyHeader></Empty>}

      <LocationDialog
        mode={dialog}
        locations={locations}
        selectedLocation={selectedLocation}
        movingItem={movingItem}
        adminUserId={adminUserId}
        canMove={canMove}
        onMove={(item) => { setMovingItem(item); setDialog("move"); }}
        onClose={() => { setDialog(null); setSelectedLocation(null); setMovingItem(null); }}
        onDone={async () => { setDialog(null); setSelectedLocation(null); setMovingItem(null); await load(); }}
      />
    </div>
  );
}

function SummaryCards({ summary }: { summary: LocationSummary }) {
  const cards = [
    ["货架位总数", summary.totalLocations], ["可用", summary.activeLocations], ["已满", summary.fullLocations], ["已停用", summary.inactiveLocations],
    ["总容量", summary.totalCapacity], ["当前占用", summary.currentItemCount], ["剩余容量", summary.remainingCapacity], ["总体占用率", `${summary.utilizationPercent}%`]
  ];
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value]) => <Card key={label}><CardHeader className="pb-2"><CardDescription>{label}</CardDescription><CardTitle className="text-2xl tabular-nums">{value}</CardTitle></CardHeader></Card>)}</div>;
}

function LocationDialog({ mode, locations, selectedLocation, movingItem, adminUserId, canMove, onMove, onClose, onDone }: {
  mode: DialogMode;
  locations: LocationRow[];
  selectedLocation: LocationRow | null;
  movingItem: InventoryRow | null;
  adminUserId: string;
  canMove: boolean;
  onMove: (item: InventoryRow) => void;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [locationCode, setLocationCode] = useState("");
  const [prefix, setPrefix] = useState("A-01");
  const [start, setStart] = useState("0101");
  const [end, setEnd] = useState("0120");
  const [capacity, setCapacity] = useState("100");
  const [status, setStatus] = useState("ACTIVE");
  const [locationId, setLocationId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!mode) return;
    setLocationCode(""); setPrefix("A-01"); setStart("0101"); setEnd("0120");
    setCapacity(String(selectedLocation?.capacity ?? 100)); setStatus("ACTIVE"); setLocationId(""); setNote(""); setError("");
  }, [mode, selectedLocation]);

  const preview = useMemo(() => bulkPreview(prefix, start, end), [end, prefix, start]);
  const destination = locations.find((location) => location.id === locationId);

  async function submit() {
    if (!mode) return;
    const nextCapacity = Number(capacity);
    if (mode === "capacity" && selectedLocation && nextCapacity < selectedLocation.capacity && !window.confirm("容量将减少。确认保存新的货架容量？")) return;
    setBusy(true); setError("");
    try {
      if (mode === "create") await api("/operations/warehouse-locations", undefined, { method: "POST", body: JSON.stringify({ adminUserId, locationCode, capacity: nextCapacity, status, note }) });
      if (mode === "bulk") await api("/operations/warehouse-locations/bulk", undefined, { method: "POST", body: JSON.stringify({ adminUserId, prefix, start, end, capacity: nextCapacity, status, note }) });
      if (mode === "capacity" && selectedLocation) await api(`/operations/warehouse-locations/${selectedLocation.id}/capacity`, undefined, { method: "PATCH", body: JSON.stringify({ adminUserId, capacity: nextCapacity, note }) });
      if (mode === "move") await api("/operations/warehouse-locations/move-item", undefined, { method: "POST", body: JSON.stringify({ adminUserId, inventoryItemId: movingItem?.id, locationId, note }) });
      await onDone();
    } catch (caught) {
      setError(errorMessage(caught, "保存失败。"));
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "bulk" ? "批量生成货架位" : mode === "capacity" ? "编辑容量" : mode === "view" ? `货架商品 · ${selectedLocation?.locationCode ?? ""}` : mode === "move" ? "移动商品" : "新增货架位";
  return (
    <Dialog open={Boolean(mode)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{mode === "view" ? `${selectedLocation?.currentItemCount ?? 0} / ${selectedLocation?.capacity ?? 0}，剩余 ${selectedLocation?.remainingCapacity ?? 0}` : mode === "move" ? `${movingItem?.product.title ?? movingItem?.barcode} · ${movingItem?.barcode}` : "容量可选 50、100、200 或输入自定义正整数。"}</DialogDescription></DialogHeader>
        {mode === "view" ? <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">{selectedLocation?.inventoryItems.length ? selectedLocation.inventoryItems.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><div className="min-w-0"><p className="truncate font-medium">{item.product.title ?? item.product.productCode}</p><p className="text-xs text-muted-foreground">{item.barcode} · {item.status}</p></div>{canMove ? <Button size="sm" variant="outline" onClick={() => onMove(item)}><MoveRightIcon data-icon="inline-start" />移动</Button> : null}</div>) : <p className="text-sm text-muted-foreground">当前货架位没有占用中的商品。</p>}</div> : (
          <FieldGroup>
            {mode === "create" ? <Field><FieldLabel htmlFor="location-code">货架位编码</FieldLabel><Input id="location-code" value={locationCode} onChange={(event) => setLocationCode(event.target.value)} placeholder="A-010101" /></Field> : null}
            {mode === "bulk" ? <><Field><FieldLabel htmlFor="location-prefix">区域前缀</FieldLabel><Input id="location-prefix" value={prefix} onChange={(event) => setPrefix(event.target.value)} placeholder="A-01" /></Field><div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="location-start">起始编号</FieldLabel><Input id="location-start" inputMode="numeric" value={start} onChange={(event) => setStart(event.target.value)} /></Field><Field><FieldLabel htmlFor="location-end">结束编号</FieldLabel><Input id="location-end" inputMode="numeric" value={end} onChange={(event) => setEnd(event.target.value)} /></Field></div><p className="text-sm text-muted-foreground">预览：{preview.slice(0, 4).join("、")}{preview.length > 4 ? `… 共 ${preview.length} 个` : ""}</p></> : null}
            {mode === "capacity" && selectedLocation ? <p className="text-sm">当前数量：{selectedLocation.currentItemCount} · 当前容量：{selectedLocation.capacity} · 调整后剩余：{Number.isFinite(Number(capacity)) ? Math.max(0, Number(capacity) - selectedLocation.currentItemCount) : "-"}</p> : null}
            {mode !== "move" ? <><Field><FieldLabel htmlFor="location-capacity">容量</FieldLabel><div className="flex gap-2"><Select value={["50", "100", "200"].includes(capacity) ? capacity : "CUSTOM"} onValueChange={(value) => { if (value !== "CUSTOM") setCapacity(value); }}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem><SelectItem value="200">200</SelectItem><SelectItem value="CUSTOM">自定义</SelectItem></SelectGroup></SelectContent></Select><Input id="location-capacity" type="number" min={1} value={capacity} onChange={(event) => setCapacity(event.target.value)} /></div></Field>{mode !== "capacity" ? <Field><FieldLabel>初始状态</FieldLabel><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="ACTIVE">启用</SelectItem><SelectItem value="INACTIVE">停用</SelectItem></SelectGroup></SelectContent></Select></Field> : null}</> : <Field><FieldLabel>目标货架位</FieldLabel><Select value={locationId} onValueChange={setLocationId}><SelectTrigger className="w-full"><SelectValue placeholder="选择有空位的启用货架" /></SelectTrigger><SelectContent><SelectGroup>{locations.filter((location) => location.status === "ACTIVE" && location.remainingCapacity > 0 && location.id !== selectedLocation?.id).map((location) => <SelectItem key={location.id} value={location.id}>{location.locationCode} · {location.currentItemCount}/{location.capacity}</SelectItem>)}</SelectGroup></SelectContent></Select>{destination ? <p className="text-sm text-muted-foreground">目标剩余容量：{destination.remainingCapacity}</p> : null}</Field>}
            <Field><FieldLabel htmlFor="location-note">备注（可选）</FieldLabel><Textarea id="location-note" value={note} onChange={(event) => setNote(event.target.value)} /></Field>
          </FieldGroup>
        )}
        {error ? <Alert variant="destructive"><AlertTitle>保存失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {mode !== "view" ? <DialogFooter showCloseButton><Button disabled={busy} onClick={() => void submit()}>{busy ? "正在保存…" : "确认保存"}</Button></DialogFooter> : <DialogFooter showCloseButton />}
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: LocationStatus }) {
  return <Badge variant={status === "ACTIVE" ? "secondary" : status === "FULL" ? "default" : "outline"}>{status === "ACTIVE" ? "可用" : status === "FULL" ? "已满" : "已停用"}</Badge>;
}

function bulkPreview(prefix: string, startText: string, endText: string) {
  if (!/^\d+$/.test(startText) || !/^\d+$/.test(endText)) return [];
  const start = Number(startText); const end = Number(endText); const count = end - start + 1;
  if (count < 1 || count > 200) return [];
  const width = Math.max(4, startText.length, endText.length);
  return Array.from({ length: count }, (_, index) => `${prefix.toUpperCase()}${String(start + index).padStart(width, "0")}`);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN", { hour12: false });
}

function errorMessage(value: unknown, fallback: string) {
  return value instanceof Error ? value.message : fallback;
}

async function api<T>(path: string, query?: Record<string, string>, init?: RequestInit): Promise<T> {
  const url = new URL(`${API_PROXY_URL}${path}`, window.location.origin);
  Object.entries(query ?? {}).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!response.ok) throw new Error(body && typeof body === "object" && "message" in body ? String((body as { message?: unknown }).message) : `Request failed: ${response.status}`);
  return body as T;
}
