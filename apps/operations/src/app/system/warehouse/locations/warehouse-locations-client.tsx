"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { MapPinnedIcon, MoveRightIcon, PlusIcon, PrinterIcon, RefreshCwIcon, SearchIcon } from "lucide-react";

import { hasPermission } from "@/components/admin/operations-access";
import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const API_PROXY_URL = "/api-proxy";

type LocationRow = {
  id: string;
  locationCode: string;
  zoneCode?: string | null;
  rackCode?: string | null;
  binCode?: string | null;
  qrCode?: string | null;
  active: boolean;
  note?: string | null;
  inventoryItems: Array<{
    id: string;
    barcode: string;
    status: string;
    product: { productCode: string; title?: string | null; images: Array<{ publicUrl?: string | null; originalUrl: string }> };
  }>;
};

type DialogMode = "create" | "bulk" | "move" | null;

export function WarehouseLocationsPage() {
  const { session } = useOperationsSession();
  const adminUserId = session?.adminUser?.id ?? "";
  const canManage = hasPermission(session, "warehouse-locations.manage");
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [movingItem, setMovingItem] = useState<LocationRow["inventoryItems"][number] | null>(null);

  const load = useCallback(async () => {
    if (!adminUserId) return;
    setBusy(true); setError("");
    try { setLocations(await api<LocationRow[]>("/operations/warehouse-locations", { adminUserId, search })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "无法读取货架位。"); }
    finally { setBusy(false); }
  }, [adminUserId, search]);

  useEffect(() => { void load(); }, [load]);

  async function setActive(location: LocationRow, active: boolean) {
    setBusy(true);
    try {
      await api(`/operations/warehouse-locations/${location.id}/active`, undefined, { method: "PATCH", body: JSON.stringify({ adminUserId, active }) });
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "无法更新货架位。"); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><p className="text-muted-foreground text-sm">系统管理 · 仓库配置</p><h1 className="font-semibold text-2xl tracking-tight">货架位管理</h1><p className="text-muted-foreground text-sm">维护区域、货架和仓位；日常订单处理仍全部留在订单中心。</p></div>
        <div className="flex flex-wrap gap-2">
          {canManage ? <><Button variant="outline" onClick={() => setDialog("bulk")}><PlusIcon data-icon="inline-start" />批量生成仓位</Button><Button onClick={() => setDialog("create")}><PlusIcon data-icon="inline-start" />新增区域 / 货架 / 仓位</Button></> : null}
        </div>
      </div>
      <Card><CardContent className="flex flex-col gap-3 pt-6 sm:flex-row"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="仓位、Barcode 或商品名称" /><Button variant="secondary" disabled={busy} onClick={() => void load()}><SearchIcon data-icon="inline-start" />搜索</Button><Button variant="outline" disabled={busy} onClick={() => void load()}><RefreshCwIcon data-icon="inline-start" />刷新</Button></CardContent></Card>
      {error ? <Alert variant="destructive"><AlertTitle>货架位操作失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        {locations.map((location) => (
          <Card key={location.id} className="[content-visibility:auto]">
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div><CardTitle>{location.locationCode}</CardTitle><CardDescription>{[location.zoneCode && `区域 ${location.zoneCode}`, location.rackCode && `货架 ${location.rackCode}`, location.binCode && `仓位 ${location.binCode}`].filter(Boolean).join(" · ")}</CardDescription></div>
              <Badge variant={location.active ? "secondary" : "outline"}>{location.active ? "启用" : "停用"}</Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <LocationQr value={location.qrCode ?? location.locationCode} />
              <div className="flex flex-col gap-2"><p className="font-medium text-sm">仓位内商品</p>{location.inventoryItems.length ? location.inventoryItems.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><div className="min-w-0"><p className="truncate font-medium text-sm">{item.product.title ?? item.product.productCode}</p><p className="text-muted-foreground text-xs">{item.barcode} · {item.status}</p></div>{canManage ? <Button size="sm" variant="outline" onClick={() => { setMovingItem(item); setDialog("move"); }}><MoveRightIcon data-icon="inline-start" />移动</Button> : null}</div>) : <p className="text-muted-foreground text-sm">当前仓位没有商品。</p>}</div>
            </CardContent>
            <CardFooter className="justify-end gap-2"><Button variant="outline" onClick={() => printLocation(location)}><PrinterIcon data-icon="inline-start" />打印仓位二维码</Button>{canManage ? <Button variant="outline" disabled={busy} onClick={() => void setActive(location, !location.active)}>{location.active ? "停用仓位" : "重新启用"}</Button> : null}</CardFooter>
          </Card>
        ))}
      </div>
      {!locations.length ? <Empty className="min-h-64 border"><EmptyHeader><EmptyMedia variant="icon"><MapPinnedIcon /></EmptyMedia><EmptyTitle>{busy ? "正在读取货架位" : "没有符合条件的货架位"}</EmptyTitle><EmptyDescription>新增区域、货架或仓位，或重置搜索条件。</EmptyDescription></EmptyHeader></Empty> : null}
      <LocationDialog mode={dialog} locations={locations} movingItem={movingItem} adminUserId={adminUserId} onClose={() => { setDialog(null); setMovingItem(null); }} onDone={async () => { setDialog(null); setMovingItem(null); await load(); }} />
    </div>
  );
}

function LocationDialog({ mode, locations, movingItem, adminUserId, onClose, onDone }: { mode: DialogMode; locations: LocationRow[]; movingItem: LocationRow["inventoryItems"][number] | null; adminUserId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [zoneCode, setZoneCode] = useState("");
  const [rackCode, setRackCode] = useState("");
  const [binCode, setBinCode] = useState("");
  const [start, setStart] = useState("1");
  const [count, setCount] = useState("10");
  const [locationId, setLocationId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (mode) { setZoneCode(""); setRackCode(""); setBinCode(""); setStart("1"); setCount("10"); setLocationId(""); setNote(""); setError(""); } }, [mode]);
  async function submit() {
    if (!mode) return;
    setBusy(true); setError("");
    try {
      if (mode === "create") await api("/operations/warehouse-locations", undefined, { method: "POST", body: JSON.stringify({ adminUserId, zoneCode, rackCode: rackCode || undefined, binCode: binCode || undefined, note }) });
      if (mode === "bulk") await api("/operations/warehouse-locations/bulk", undefined, { method: "POST", body: JSON.stringify({ adminUserId, zoneCode, rackCode, start: Number(start), count: Number(count), note }) });
      if (mode === "move") await api("/operations/warehouse-locations/move-item", undefined, { method: "POST", body: JSON.stringify({ adminUserId, inventoryItemId: movingItem?.id, locationId, note }) });
      await onDone();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "保存失败。"); }
    finally { setBusy(false); }
  }
  return <Dialog open={Boolean(mode)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent><DialogHeader><DialogTitle>{mode === "bulk" ? "批量生成仓位" : mode === "move" ? "移动商品到其他仓位" : "新增区域、货架或仓位"}</DialogTitle><DialogDescription>{mode === "move" ? `${movingItem?.product.title ?? movingItem?.barcode} · ${movingItem?.barcode}` : "只填写区域可新增区域；填写区域和货架可新增货架；三项都填则新增仓位。"}</DialogDescription></DialogHeader><FieldGroup>{mode !== "move" ? <><Field><FieldLabel>区域代码</FieldLabel><Input value={zoneCode} onChange={(event) => setZoneCode(event.target.value)} placeholder="A" /></Field><Field><FieldLabel>货架代码</FieldLabel><Input value={rackCode} onChange={(event) => setRackCode(event.target.value)} placeholder="01" /></Field>{mode === "create" ? <Field><FieldLabel>仓位代码（可选）</FieldLabel><Input value={binCode} onChange={(event) => setBinCode(event.target.value)} placeholder="001" /></Field> : <><Field><FieldLabel>起始仓位</FieldLabel><Input type="number" value={start} onChange={(event) => setStart(event.target.value)} /></Field><Field><FieldLabel>生成数量</FieldLabel><Input type="number" value={count} onChange={(event) => setCount(event.target.value)} /></Field></>}</> : <Field><FieldLabel>目标仓位</FieldLabel><Select value={locationId} onValueChange={setLocationId}><SelectTrigger className="w-full"><SelectValue placeholder="选择启用仓位" /></SelectTrigger><SelectContent><SelectGroup>{locations.filter((item) => item.active).map((item) => <SelectItem key={item.id} value={item.id}>{item.locationCode}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>}<Field><FieldLabel>备注（可选）</FieldLabel><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></Field></FieldGroup>{error ? <Alert variant="destructive"><AlertTitle>保存失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}<DialogFooter showCloseButton><Button disabled={busy} onClick={() => void submit()}>{busy ? "正在保存..." : "确认"}</Button></DialogFooter></DialogContent></Dialog>;
}

function LocationQr({ value }: { value: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => { let active = true; void QRCode.toDataURL(value, { width: 144, margin: 1 }).then((url) => { if (active) setSrc(url); }); return () => { active = false; }; }, [value]);
  return <div className="flex items-center gap-3 rounded-md bg-muted/40 p-3">{src ? <img src={src} alt={`${value} 仓位二维码`} className="size-24 rounded bg-background" /> : <div className="size-24 rounded bg-background" />}<div><p className="font-medium">{value}</p><p className="text-muted-foreground text-sm">扫描后定位到此仓位。</p></div></div>;
}

async function printLocation(location: LocationRow) {
  const dataUrl = await QRCode.toDataURL(location.qrCode ?? location.locationCode, { width: 320, margin: 2 });
  const printWindow = window.open("", "_blank", "width=520,height=620");
  if (!printWindow) return;
  printWindow.document.write(`<html><head><title>${location.locationCode}</title></head><body style="font-family:Arial;text-align:center;padding:32px"><h1>${location.locationCode}</h1><img src="${dataUrl}" width="320" height="320"/><p>${location.note ?? "Warehouse location"}</p></body></html>`);
  printWindow.document.close(); printWindow.focus(); printWindow.print();
}

async function api<T>(path: string, query?: Record<string, string>, init?: RequestInit): Promise<T> {
  const url = new URL(`${API_PROXY_URL}${path}`, window.location.origin); Object.entries(query ?? {}).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const text = await response.text(); let body: unknown = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!response.ok) throw new Error(body && typeof body === "object" && "message" in body ? String((body as { message?: unknown }).message) : `Request failed: ${response.status}`);
  return body as T;
}
