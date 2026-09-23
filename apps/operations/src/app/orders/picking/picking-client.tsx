"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { AlertTriangleIcon, CheckCircle2Icon, RefreshCwIcon, ScanBarcodeIcon, SkipForwardIcon } from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { hasPermission } from "@/components/admin/operations-access";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { operationsRequester } from "@/lib/operations-request";
import { t } from "@/i18n/runtime";
import { compareShelfCodes } from "../picking-sheet-print";
import { FulfillmentLabelPrinter } from "../../warehouse/fulfillment-label-printer";
import { PackingView } from "./packing-view";
import type { PackOrder } from "./picking-types";

/**
 * The picker's phone.
 *
 * A paper list tells someone what to fetch but cannot tell them they fetched the
 * wrong thing, and the barcode check is the whole reason this shop can promise a
 * one-of-one garment. So the sheet stays as the thing you carry, and this is the
 * thing that decides: one garment at a time, the shelf code big enough to read
 * at arm's length, and a scan box that moves on by itself when the code matches.
 *
 * Deliberately one item per screen rather than a checklist. A list invites
 * ticking ahead — "I'll scan them all at the bench" — and scanning at the bench
 * proves only that the garment exists, not that it came off the right shelf.
 *
 * It calls the same two endpoints the workbench does: claim the picking task,
 * then scan each item. There is no picker-only state anywhere, so an order moved
 * here is an order moved everywhere.
 */

type PickItem = {
  orderId: string;
  orderItemId: string;
  orderNumber: string;
  locationCode: string;
  title: string;
  sizeLabel: string | null;
  barcode: string;
  destination: string;
  imageUrl: string | null;
};

type PickerOrder = {
  id: string;
  orderNumber: string;
  fulfillmentMethod: "PICKUP" | "KIKUYU_LOCAL_DELIVERY";
  fulfillmentNode?: { id: string; name: string } | null;
  items: Array<{
    id: string;
    displayImageUrl?: string | null;
    snapshot?: { title: string; barcode?: string | null; sizeLabel?: string | null; imageUrl?: string | null } | null;
    inventoryItem?: { barcode: string; location?: { locationCode: string } | null } | null;
  }>;
  fulfillment?: {
    status: string;
    assignedPickerEmployeeId?: string | null;
    packingStartedAt?: string | null;
    packageCode?: string | null;
    fulfillmentNode?: { id: string; name: string } | null;
    items: Array<{ orderItemId: string; status: string; expectedBarcode?: string | null }>;
  } | null;
};

function destinationLabel(order: PickerOrder): string {
  const node = order.fulfillment?.fulfillmentNode ?? order.fulfillmentNode;
  if (order.fulfillmentMethod === "KIKUYU_LOCAL_DELIVERY") {
    return node ? t("送货 · 经 {name}", { name: node.name }) : t("送货 · 未指定");
  }
  return node ? t("自提 · {name}", { name: node.name }) : t("自提 · 未指定门店");
}

function proxied(src: string | null | undefined): string | null {
  if (!src) return null;
  return src.startsWith("/") && !src.startsWith("/api-proxy/") ? `/api-proxy${src}` : src;
}

export function PickingStation() {
  const { session } = useOperationsSession();
  const accessToken = session?.accessToken ?? "";
  const request = useMemo(() => operationsRequester(accessToken), [accessToken]);

  const [orders, setOrders] = useState<PickerOrder[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [skipped, setSkipped] = useState<PickItem[]>([]);
  const [justPicked, setJustPicked] = useState("");
  // Picking walks the racks in shelf order across every order; packing puts the
  // trolley back together one order at a time. Same person, same phone, two
  // different orderings of the same garments.
  const [mode, setMode] = useState<"pick" | "pack">("pick");
  const [labelOrder, setLabelOrder] = useState<PackOrder | null>(null);
  const scanRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setBusy(true);
    setError("");
    try {
      setOrders(await request<PickerOrder[]>("/operations/orders", { query: { scope: "workbench", tab: "all" } }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("读不到待拣货的订单。"));
    } finally {
      setBusy(false);
    }
  }, [accessToken, request]);

  useEffect(() => { void load(); }, [load]);

  const waiting = orders.filter((order) => order.fulfillment?.status === "PAID");

  /**
   * Everything still to fetch, in shelf order across every claimed order.
   *
   * Across orders on purpose: the racks do not know which parcel a garment is
   * going into, and a picker who walks them one order at a time walks the same
   * aisle five times. Skipped garments drop to the end rather than out, so a
   * shelf that was blocked gets a second look before the run is called done.
   */
  const queue = useMemo(() => {
    const skippedKeys = new Set(skipped.map((item) => item.orderItemId));
    const pending: PickItem[] = [];
    for (const order of orders) {
      if (order.fulfillment?.status !== "PICKING") continue;
      const destination = destinationLabel(order);
      for (const item of order.items) {
        const scan = order.fulfillment.items.find((candidate) => candidate.orderItemId === item.id);
        if (scan?.status === "VERIFIED") continue;
        pending.push({
          orderId: order.id,
          orderItemId: item.id,
          orderNumber: order.orderNumber,
          locationCode: item.inventoryItem?.location?.locationCode ?? "—",
          title: item.snapshot?.title ?? t("未命名商品"),
          sizeLabel: item.snapshot?.sizeLabel ?? null,
          barcode: scan?.expectedBarcode ?? item.snapshot?.barcode ?? item.inventoryItem?.barcode ?? "",
          destination,
          imageUrl: proxied(item.displayImageUrl ?? item.snapshot?.imageUrl)
        });
      }
    }
    // Same comparison the paper sheet uses, so the phone and the sheet send a
    // picker down the aisles in exactly the same order.
    const ordered = [...pending].sort((a, b) =>
      compareShelfCodes(a.locationCode, b.locationCode) || a.orderNumber.localeCompare(b.orderNumber));
    return [
      ...ordered.filter((item) => !skippedKeys.has(item.orderItemId)),
      ...ordered.filter((item) => skippedKeys.has(item.orderItemId))
    ];
  }, [orders, skipped]);

  const picked = useMemo(() => orders.reduce((sum, order) => {
    if (order.fulfillment?.status !== "PICKING") return sum;
    return sum + order.fulfillment.items.filter((item) => item.status === "VERIFIED").length;
  }, 0), [orders]);
  const total = picked + queue.length;
  const active = queue[0] ?? null;

  useEffect(() => { scanRef.current?.focus(); }, [active?.orderItemId]);

  /** The trolley, regrouped: one entry per order, which is one parcel. */
  const packOrders = useMemo<PackOrder[]>(() => orders
    .filter((order) => order.fulfillment?.status === "READY_TO_PACK" || order.fulfillment?.status === "PACKED")
    .map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      destination: destinationLabel(order),
      fulfillment: order.fulfillment
        ? {
            status: order.fulfillment.status,
            packingStartedAt: order.fulfillment.packingStartedAt ?? null,
            packageCode: order.fulfillment.packageCode ?? null
          }
        : null,
      items: order.items.map((item) => ({
        id: item.id,
        title: item.snapshot?.title ?? t("未命名商品"),
        sizeLabel: item.snapshot?.sizeLabel ?? null,
        barcode: item.snapshot?.barcode ?? item.inventoryItem?.barcode ?? "",
        imageUrl: proxied(item.displayImageUrl ?? item.snapshot?.imageUrl),
        locationCode: item.inventoryItem?.location?.locationCode ?? "—"
      }))
    })), [orders]);

  const toPackCount = packOrders.filter((order) => order.fulfillment?.status === "READY_TO_PACK").length;

  // The moment the racks are done, the job becomes packing. Leaving the picker
  // on an empty picking screen is how they walk back to a desk to ask what next.
  useEffect(() => {
    if (mode === "pick" && !active && !waiting.length && toPackCount > 0) setMode("pack");
  }, [mode, active, waiting.length, toPackCount]);

  async function packAction(order: PackOrder, action: string, body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await request(`/operations/orders/${order.id}/${action}`, { method: "POST", body: JSON.stringify(body) });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("打包操作失败。"));
    } finally {
      setBusy(false);
    }
  }

  async function claimAll() {
    setBusy(true);
    setError("");
    const failures: string[] = [];
    try {
      for (const order of waiting) {
        try {
          await request(`/operations/orders/${order.id}/claim-picking`, { method: "POST", body: JSON.stringify({}) });
        } catch (caught) {
          failures.push(`${order.orderNumber}（${caught instanceof Error ? caught.message : t("未知错误")}）`);
        }
      }
    } finally {
      setBusy(false);
    }
    if (failures.length) setError(t("有 {count} 单没能领取：{detail}", { count: failures.length, detail: failures.join("；") }));
    await load();
  }

  async function submitScan(raw: string) {
    if (!active || busy) return;
    const barcode = raw.trim();
    if (!barcode) return;
    setBusy(true);
    setError("");
    try {
      await request(`/operations/orders/${active.orderId}/items/${active.orderItemId}/scan`, {
        method: "POST",
        body: JSON.stringify({ barcode })
      });
      setJustPicked(active.title);
      setScanValue("");
      // Re-read rather than advance locally: scanning the last garment of an
      // order moves that order to 待打包, and the picker should see it leave.
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("条码对不上。"));
      setScanValue("");
    } finally {
      setBusy(false);
      scanRef.current?.focus();
    }
  }

  if (!hasPermission(session, "orders.pick")) {
    return (
      <Alert variant="destructive">
        <AlertTriangleIcon />
        <AlertTitle>{t("这个账号不能拣货")}</AlertTitle>
        <AlertDescription>{t("要拣货权限（orders.pick）。找管理员在角色里加上。")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Progress first and sticky: the one thing worth knowing while walking is
          how much is left. */}
      <div className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 pt-1 pb-2 backdrop-blur">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            className={`rounded-md py-2 font-medium text-sm ${mode === "pick" ? "bg-background shadow-xs" : "text-muted-foreground"}`}
            onClick={() => setMode("pick")}
          >
            {t("拣货")} {queue.length ? <span className="tabular-nums">{queue.length}</span> : null}
          </button>
          <button
            type="button"
            className={`rounded-md py-2 font-medium text-sm ${mode === "pack" ? "bg-background shadow-xs" : "text-muted-foreground"}`}
            onClick={() => setMode("pack")}
          >
            {t("打包")} {toPackCount ? <span className="tabular-nums">{toPackCount}</span> : null}
          </button>
        </div>
        {mode === "pick" ? (
          <>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="font-bold text-2xl tabular-nums">{picked}<span className="text-muted-foreground text-lg"> / {total}</span></span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void load()}>
                <RefreshCwIcon data-icon="inline-start" />{t("刷新")}
              </Button>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${total ? (picked / total) * 100 : 0}%` }} />
            </div>
          </>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-sm">{t("一张卡片 = 一个包裹")}</span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void load()}>
              <RefreshCwIcon data-icon="inline-start" />{t("刷新")}
            </Button>
          </div>
        )}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>{t("没通过")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {mode === "pack" ? (
        <PackingView
          orders={packOrders}
          busy={busy}
          onStart={(order) => packAction(order, "start-packing", {})}
          onComplete={(order, packagingMethod, packageCount) => packAction(order, "complete-packing", { packagingMethod, packageCount })}
          onLabel={setLabelOrder}
        />
      ) : active ? (
        <div className="flex flex-col gap-3 rounded-xl border p-4">
          <div className="flex items-start justify-between gap-3">
            {/* Arm's length, in a warehouse, is the reading distance this has to
                survive, so the shelf code is the biggest thing on the phone. */}
            <span className="font-extrabold text-4xl leading-none tracking-tight tabular-nums">{active.locationCode}</span>
            <Badge variant="outline" className="shrink-0">{active.destination}</Badge>
          </div>

          {active.imageUrl ? (
            <img src={active.imageUrl} alt={active.title} className="h-48 w-full rounded-lg border bg-white object-contain" />
          ) : null}

          <div>
            <p className="font-medium text-lg">{active.title}</p>
            <p className="text-muted-foreground text-sm">
              {active.sizeLabel ? <>{active.sizeLabel} · </> : null}
              <span className="font-mono">{active.barcode || t("条码缺失")}</span> · {active.orderNumber}
            </p>
          </div>

          <form
            onSubmit={(event) => { event.preventDefault(); void submitScan(scanValue); }}
            className="flex gap-2"
          >
            <Input
              ref={scanRef}
              className="h-14 text-center font-mono text-lg"
              inputMode="numeric"
              autoComplete="off"
              placeholder={t("扫码或输入条码")}
              value={scanValue}
              onChange={(event) => setScanValue(event.target.value)}
              disabled={busy}
            />
            <Button type="submit" className="h-14 px-6" disabled={busy || !scanValue.trim()}>
              <ScanBarcodeIcon data-icon="inline-start" />{t("核对")}
            </Button>
          </form>

          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setSkipped((current) => current.some((item) => item.orderItemId === active.orderItemId) ? current : [...current, active])}
          >
            <SkipForwardIcon data-icon="inline-start" />{t("找不到这件，先跳过")}
          </Button>
          <p className="text-muted-foreground text-xs">
            {t("跳过的会排到最后再问你一次。到最后还是找不到，在订单工作台提交异常，别自己改状态。")}
          </p>
        </div>
      ) : waiting.length ? (
        <div className="flex flex-col gap-3 rounded-xl border p-4 text-center">
          <p className="font-medium text-lg">{t("有 {count} 单在等拣货", { count: waiting.length })}</p>
          <p className="text-muted-foreground text-sm">{t("领取之后，系统会把所有商品按货架位排成一条路线，一件一件给你。")}</p>
          <Button className="h-14" disabled={busy} onClick={() => void claimAll()}>
            <ScanBarcodeIcon data-icon="inline-start" />{t("领取并开始拣货")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border p-6 text-center">
          <CheckCircle2Icon className="mx-auto size-10 text-muted-foreground" />
          <p className="font-medium text-lg">{busy ? t("正在读取…") : t("没有待拣的商品")}</p>
          {justPicked ? <p className="text-muted-foreground text-sm">{t("最后核对的是：{title}", { title: justPicked })}</p> : null}
          {skipped.length ? (
            <div className="mt-2 text-left">
              <p className="font-medium text-sm">{t("有 {count} 件没找到：", { count: skipped.length })}</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground text-sm">
                {skipped.map((item) => <li key={item.orderItemId}>{item.locationCode} · {item.title} · {item.orderNumber}</li>)}
              </ul>
              <p className="mt-1 text-muted-foreground text-xs">{t("把这几件报给主管，在订单工作台提交异常。")}</p>
            </div>
          ) : null}
        </div>
      )}

      {labelOrder ? (
        <FulfillmentLabelPrinter
          labels={[{
            packageCode: labelOrder.fulfillment?.packageCode ?? "",
            nodeName: labelOrder.destination,
            orderNumber: labelOrder.orderNumber,
            isDelivery: labelOrder.destination.startsWith(t("送货")),
            itemCount: labelOrder.items.length,
            customerName: null,
            customerPhone: null,
            deliveryAddress: null,
            deliveryArea: null,
            items: labelOrder.items.map((item) => ({ title: item.title, sizeLabel: item.sizeLabel, barcode: item.barcode || null }))
          }]}
          onClose={() => setLabelOrder(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * The same screen, framed like a phone, for a supervisor at a desk — plus the
 * QR the picker points their own phone at.
 *
 * Not an iframe: the picker's screen is the same React tree here, so what a
 * supervisor sees cannot drift from what the picker sees, and there is no second
 * session to sign in to.
 */
export function PickingStationPage() {
  const [qr, setQr] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    const here = `${window.location.origin}/orders/picking`;
    setUrl(here);
    void QRCode.toDataURL(here, { margin: 1, width: 240 }).then(setQr).catch(() => setQr(""));
  }, []);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="w-full lg:max-w-[420px]">
        <div className="rounded-[28px] border-4 bg-background p-3 shadow-sm lg:p-4">
          <PickingStation />
        </div>
      </div>
      <div className="flex max-w-md flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-semibold">{t("拣货员用自己的手机打开")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("手机扫这个码，用自己的员工账号登录，就是左边这个界面。谁扫的码算谁拣的，所以不要共用账号。")}
        </p>
        {qr ? <img src={qr} alt={t("拣货台二维码")} className="size-52 self-start rounded border bg-white p-2" /> : null}
        <p className="break-all font-mono text-muted-foreground text-xs">{url}</p>
        <p className="text-muted-foreground text-sm">
          {t("左边不是截图，是同一个界面。你在这里操作和拣货员在手机上操作，效果完全一样。")}
        </p>
      </div>
    </div>
  );
}
