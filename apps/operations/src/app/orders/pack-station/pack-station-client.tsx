"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  PackageCheckIcon,
  PrinterIcon,
  RefreshCwIcon,
  ScanBarcodeIcon,
  TruckIcon,
  XIcon
} from "lucide-react";
import { parseDeliveryAddress, deliveryMapUrl } from "@online-saler/business-rules";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { hasPermission } from "@/components/admin/operations-access";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { operationsRequester } from "@/lib/operations-request";
import { t } from "@/i18n/runtime";
import { DEFAULT_PRINTER_NAME } from "../../local-label-print";
import { detectLabelPrinter, printLabelSheet } from "../../warehouse/fulfillment-label-printer";
import { renderFulfillmentLabels } from "../../warehouse/fulfillment-label-raster";
import { isTransitNodeOption } from "../dispatch-readiness";
import { labelInput, type NodeOption, type OrderRow } from "../orders-client";
import {
  PRINTER_MEMORY_KEY,
  destinationNode,
  expectedBarcodeFor,
  findOrderByBarcode,
  handoverFor,
  isItemVerified,
  localDay,
  needsDestination,
  needsLabel,
  packStationStep,
  printerMemoryValue,
  rememberedPrinter,
  remainingItems,
  waitingOrders,
  type PackStationStep
} from "./pack-station-logic";

/**
 * 打包台 — one PC, one label printer, one employee, one order at a time.
 *
 * The daily dispatch page splits a morning into batches handed between people;
 * that is right for a busy warehouse and too many steps for a one-person one.
 * Here the garment in the hand is the starting point: scan it, and the screen
 * walks that one order through verify → pack → print → send, then waits for
 * the next garment.
 *
 * Nothing here is new state. Each button calls the same endpoint the order
 * centre calls, so every ownership check, inventory move and timeline entry
 * happens exactly as it does there, and an order moved here is moved
 * everywhere.
 */

const TABS = ["waiting-pick", "picking", "ready-to-pack", "packed"] as const;

const STEPS: Array<{ key: Exclude<PackStationStep, "gone">; label: string }> = [
  { key: "scan", label: "① 扫码核对" },
  { key: "details", label: "② 顾客信息 · 打包" },
  { key: "print", label: "③ 打印面单" },
  { key: "send", label: "④ 发往目的地" }
];

const PACKAGING = [
  ["BAG", "袋 Bag"],
  ["BOX", "箱 Box"],
  ["OTHER", "其他 Other"]
] as const;

function proxied(src: string | null | undefined): string | null {
  if (!src) return null;
  return src.startsWith("/") && !src.startsWith("/api-proxy/") ? `/api-proxy${src}` : src;
}

function readPrinterMemory(): string | null {
  try {
    return rememberedPrinter(window.localStorage.getItem(PRINTER_MEMORY_KEY), localDay());
  } catch {
    return null;
  }
}

function writePrinterMemory(name: string | null) {
  try {
    if (name) window.localStorage.setItem(PRINTER_MEMORY_KEY, printerMemoryValue(name, localDay()));
    else window.localStorage.removeItem(PRINTER_MEMORY_KEY);
  } catch {
    // Private windows refuse storage; the station then asks once per page load.
  }
}

function destinationText(order: OrderRow): string {
  const node = destinationNode(order);
  const delivery = order.fulfillmentMethod === "KIKUYU_LOCAL_DELIVERY";
  if (!node) return delivery ? t("送货上门 · 还没选中转门店") : t("自提 · 还没选门店");
  const name = node.type === "WAREHOUSE" ? t("{name}（中央仓）", { name: node.name ?? "—" }) : node.name ?? "—";
  return delivery ? t("送货上门 · 经 {name}", { name }) : t("自提 · {name}", { name });
}

function handoverLabel(order: OrderRow): string {
  const handover = handoverFor(order);
  const node = destinationNode(order);
  if (handover?.action === "send-to-node") return t("已贴好，发往 {name}", { name: node?.name ?? "—" });
  if (handover?.action === "ready-for-pickup") return t("已放上自提架，设为待自提");
  if (handover?.action === "ready-for-dispatch") return t("已打包好，设为待发货");
  return t("先选目的地");
}

export function PackStationPage() {
  const { session } = useOperationsSession();
  const accessToken = session?.accessToken ?? "";
  const request = useMemo(() => operationsRequester(accessToken), [accessToken]);
  const me = session?.adminUser?.linkedEmployee?.id ?? "";
  const supervisor = hasPermission(session, "orders.assign-packer");

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [current, setCurrent] = useState<OrderRow | null>(null);
  const [scanValue, setScanValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastScanned, setLastScanned] = useState("");
  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [nodeId, setNodeId] = useState("");
  const [packagingMethod, setPackagingMethod] = useState("BAG");
  const [packageCount, setPackageCount] = useState("1");
  const [printer, setPrinter] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { setPrinter(readPrinterMemory()); }, []);

  const loadWaiting = useCallback(async () => {
    if (!accessToken) return;
    try {
      // One status at a time rather than 全部: 全部 stops at 150 orders, newest
      // first, and an old paid order must not fall off the end of the list.
      // Sequential because each read also creates missing picking tasks.
      const next: OrderRow[] = [];
      for (const tab of TABS) {
        next.push(...await request<OrderRow[]>("/operations/orders", { query: { scope: "workbench", tab } }));
      }
      setOrders(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("读不到待打包的订单。"));
    }
  }, [accessToken, request]);

  useEffect(() => { void loadWaiting(); }, [loadWaiting]);

  const waiting = useMemo(() => waitingOrders(orders, me, supervisor), [orders, me, supervisor]);
  const step = current ? packStationStep(current) : null;

  // A new order starts with fresh choices; the last parcel's box count does
  // not carry over to the next one.
  const currentId = current?.id ?? "";
  useEffect(() => {
    setPackagingMethod("BAG");
    setPackageCount("1");
    setNodeId("");
  }, [currentId]);
  useEffect(() => {
    if (!currentId || step === "scan") scanRef.current?.focus();
  }, [currentId, step]);

  // The node list is only needed when this order has nowhere to go yet.
  const choosingNode = Boolean(current && needsDestination(current) && step !== "scan");
  useEffect(() => {
    if (!choosingNode || nodes.length) return;
    void request<NodeOption[]>("/operations/orders/nodes").then(setNodes).catch(() => setNodes([]));
  }, [choosingNode, nodes.length, request]);

  const nodeOptions = useMemo(() => {
    if (!current) return [];
    return current.fulfillmentMethod === "PICKUP"
      ? nodes.filter((node) => node.supportsPickup)
      : nodes.filter((node) => node.supportsDelivery && isTransitNodeOption(node));
  }, [current, nodes]);

  async function readOrder(orderId: string): Promise<OrderRow> {
    return request<OrderRow>(`/operations/orders/${orderId}`);
  }

  async function post(orderId: string, action: string, body: Record<string, unknown> = {}) {
    await request(`/operations/orders/${orderId}/${action}`, { method: "POST", body: JSON.stringify(body) });
  }

  /**
   * Once every garment is verified the order is 待打包. Packing starts right
   * away: the employee has the garments in hand at the bench. The API still
   * decides whether this person may pack it (the picker was made its packer
   * when the last garment was scanned, unless a supervisor chose someone else).
   */
  async function startPackingIfReady(order: OrderRow): Promise<OrderRow> {
    if (order.fulfillment?.status !== "READY_TO_PACK" || order.fulfillment.packingStartedAt) return order;
    await post(order.id, "start-packing");
    return readOrder(order.id);
  }

  async function run(work: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  async function verifyItem(order: OrderRow, itemId: string, barcode: string) {
    // Scanning claims an unclaimed order on the server, but an order a
    // supervisor handed to this picker is still 待拣货 and has to be started
    // first — the same claim the order centre's 领取拣货任务 makes.
    if (order.fulfillment?.status === "PAID" || !order.fulfillment) await post(order.id, "claim-picking");
    await post(order.id, `items/${itemId}/scan`, { barcode });
    setLastScanned(order.items.find((item) => item.id === itemId)?.snapshot?.title ?? t("未命名商品"));
    await show(order.id);
  }

  /** Opens an order on the station, starting packing when its garments are all verified. */
  async function show(orderId: string) {
    // Shown before packing starts, so a refusal (another packer's parcel)
    // appears next to the order it is about.
    const fresh = await readOrder(orderId);
    setCurrent(fresh);
    setCurrent(await startPackingIfReady(fresh));
  }

  function onScan(raw: string) {
    const barcode = raw.trim();
    setScanValue("");
    if (!barcode || busy) return;
    void run(async () => {
      if (current) {
        if (packStationStep(current) !== "scan") {
          throw new Error(t("这一单已经核对完了。先把它做完，或者点「换一单」。"));
        }
        const hit = findOrderByBarcode([current], barcode);
        if (hit.kind === "none") throw new Error(t("{barcode} 不是这一单的衣服。先放一边，把这一单的扫完。", { barcode }));
        if (hit.verified) {
          setNotice(t("这件已经扫过了：{title}", { title: hit.item.snapshot?.title ?? "—" }));
          return;
        }
        await verifyItem(current, hit.item.id, barcode);
        return;
      }
      // A garment with no order open: find the order it was sold in. The
      // loaded list is checked first; the search covers anything outside it.
      let hit = findOrderByBarcode(orders, barcode);
      if (hit.kind === "none") {
        const found = await request<OrderRow[]>("/operations/orders", { query: { scope: "workbench", tab: "all", barcode } });
        hit = findOrderByBarcode(found, barcode);
      }
      if (hit.kind === "none") {
        throw new Error(t("{barcode} 没有待发的订单。可能还没卖出、已经发走了，或者条码不对。", { barcode }));
      }
      if (packStationStep(hit.order) === "scan" && !hit.verified) {
        await verifyItem(hit.order, hit.item.id, barcode);
      } else {
        await show(hit.order.id);
      }
    }, t("核对没通过。"));
  }

  function openOrder(order: OrderRow) {
    void run(() => show(order.id), t("打不开这一单。"));
  }

  function closeOrder() {
    setCurrent(null);
    setError("");
    setNotice("");
    void loadWaiting();
  }

  function completePacking() {
    if (!current) return;
    const order = current;
    void run(async () => {
      if (needsDestination(order)) {
        if (!nodeId) throw new Error(t("先选这一单发往哪里。"));
        await post(order.id, "assign-node", { nodeId });
      }
      let fresh = await readOrder(order.id);
      if (fresh.fulfillment?.status === "READY_TO_PACK" && !fresh.fulfillment.packingStartedAt) {
        fresh = await startPackingIfReady(fresh);
      }
      if (fresh.fulfillment?.status === "READY_TO_PACK") {
        await post(order.id, "complete-packing", { packagingMethod, packageCount: Number(packageCount) || 1 });
        fresh = await readOrder(order.id);
      }
      setCurrent(fresh);
    }, t("打包没完成。"));
  }

  function chooseDestination() {
    if (!current || !nodeId) return;
    const order = current;
    void run(async () => {
      await post(order.id, "assign-node", { nodeId });
      setCurrent(await readOrder(order.id));
    }, t("目的地没保存。"));
  }

  async function findPrinter(): Promise<string> {
    const { name } = await detectLabelPrinter(printer ?? DEFAULT_PRINTER_NAME);
    writePrinterMemory(name);
    setPrinter(name);
    return name;
  }

  function redetectPrinter() {
    void run(async () => {
      writePrinterMemory(null);
      setPrinter(null);
      const name = await findPrinter();
      setNotice(t("打印机已连接：{name}。今天之内不用再检测。", { name }));
    }, t("没找到打印机。"));
  }

  function printLabels() {
    if (!current) return;
    const order = current;
    void run(async () => {
      const input = labelInput(order);
      const sheets = renderFulfillmentLabels(input);
      const name = printer ?? await findPrinter();
      let sent = 0;
      try {
        for (const sheet of sheets) {
          await printLabelSheet(input, sheet, name);
          sent += 1;
          // Sheet 1 is the routing sticker the store scans. 发往门店 is refused
          // until it is recorded, so it is recorded the moment it is out.
          if (sheet.kind === "routing") {
            await post(order.id, "package-label-printed", { packageCode: input.packageCode });
          }
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "";
        throw new Error(t("打印了 {sent} 张后停止。{message}", { sent, message }));
      }
      setCurrent(await readOrder(order.id));
      setNotice(t("{total} 张已打印。第 1 张贴在包裹上，其余放进包裹。", { total: sheets.length }));
    }, t("面单没打出来。"));
  }

  function handOver() {
    if (!current) return;
    const order = current;
    const handover = handoverFor(order);
    if (!handover) return;
    void run(async () => {
      await post(order.id, handover.action);
      setCurrent(null);
      setNotice(t("{orderNumber} 已完成：{destination}。扫下一件。", { orderNumber: order.orderNumber, destination: destinationText(order) }));
      await loadWaiting();
    }, t("没能发出。"));
  }

  if (!hasPermission(session, "orders.pick") && !hasPermission(session, "orders.pack")) {
    return (
      <Alert variant="destructive">
        <AlertTriangleIcon />
        <AlertTitle>{t("这个账号不能打包")}</AlertTitle>
        <AlertDescription>{t("要拣货和打包权限（orders.pick、orders.pack）。找管理员在角色里加上。")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">{t("仓库发货")}</p>
          <h1 className="font-semibold text-2xl tracking-tight">{t("打包台")}</h1>
          <p className="max-w-3xl text-muted-foreground text-sm">
            {t("在连着面单打印机的电脑上用。扫一件衣服，就打开它所在的订单：核对 → 打包 → 打印面单 → 发出，一个人在这一页做完。")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={printer ? "secondary" : "outline"}>
            <PrinterIcon />{printer ? t("打印机：{name}", { name: printer }) : t("打印机未检测")}
          </Badge>
          <Button size="sm" variant="outline" disabled={busy} onClick={redetectPrinter}>{t("检测打印机")}</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void loadWaiting()}>
            <RefreshCwIcon data-icon="inline-start" />{t("刷新")}
          </Button>
        </div>
      </div>

      {!me ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>{t("这个账号没有关联员工")}</AlertTitle>
          <AlertDescription>{t("拣货和打包都记在员工名下。找管理员在账号管理里给这个账号关联员工。")}</AlertDescription>
        </Alert>
      ) : null}

      <ol className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {STEPS.map((entry) => {
          const active = current ? step === entry.key : entry.key === "scan";
          return (
            <li
              key={entry.key}
              className={`rounded-lg border px-3 py-2 font-medium text-sm ${active ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {t(entry.label)}
            </li>
          );
        })}
      </ol>

      {error ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>{t("没通过")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>{notice}</AlertTitle>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          {!current || step === "scan" ? (
            <form
              className="flex gap-2"
              onSubmit={(event) => { event.preventDefault(); onScan(scanValue); }}
            >
              <Input
                ref={scanRef}
                autoFocus
                className="h-16 text-center font-mono text-2xl"
                autoComplete="off"
                placeholder={current ? t("扫这一单的下一件") : t("扫一件衣服的条码，开始打包")}
                value={scanValue}
                onChange={(event) => setScanValue(event.target.value)}
                disabled={busy}
              />
              <Button type="submit" className="h-16 px-8 text-lg" disabled={busy || !scanValue.trim()}>
                <ScanBarcodeIcon data-icon="inline-start" />{t("开始打包")}
              </Button>
            </form>
          ) : null}

          {current ? (
            <CurrentOrder
              order={current}
              step={step!}
              busy={busy}
              lastScanned={lastScanned}
              nodeOptions={nodeOptions}
              nodeId={nodeId}
              onNodeId={setNodeId}
              packagingMethod={packagingMethod}
              onPackagingMethod={setPackagingMethod}
              packageCount={packageCount}
              onPackageCount={setPackageCount}
              canHandOver={(() => {
                const handover = handoverFor(current);
                return Boolean(handover && hasPermission(session, handover.permission));
              })()}
              onComplete={completePacking}
              onChooseDestination={chooseDestination}
              onPrint={printLabels}
              onHandOver={handOver}
              onClose={closeOrder}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-xl border p-10 text-center">
              <ScanBarcodeIcon className="size-12 text-muted-foreground" />
              <p className="font-medium text-lg">{busy ? t("正在处理…") : t("扫下一件")}</p>
              <p className="max-w-md text-muted-foreground text-sm">
                {t("用扫码枪扫衣服吊牌上的条码。系统会找到它所在的已付款订单，第一次扫就算你领了这一单。也可以在右边点一单打开。")}
              </p>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-2">
          <h2 className="font-semibold text-sm">{t("等待打包")} <Badge variant="secondary">{waiting.length}</Badge></h2>
          {waiting.length ? waiting.map((order) => {
            const left = remainingItems(order).length;
            const orderStep = packStationStep(order);
            return (
              <button
                key={order.id}
                type="button"
                disabled={busy}
                onClick={() => openOrder(order)}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left hover:bg-muted/50 disabled:opacity-60 ${current?.id === order.id ? "border-primary" : ""}`}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-sm">{order.orderNumber}</span>
                  <Badge variant="outline">
                    {orderStep === "scan" ? t("还差 {count} 件", { count: left })
                      : orderStep === "details" ? t("待打包")
                        : orderStep === "print" ? t("待打面单") : t("待发出")}
                  </Badge>
                </span>
                <span className="text-muted-foreground text-xs">{destinationText(order)} · {t("{count} 件", { count: order.items.length })}</span>
              </button>
            );
          }) : (
            <p className="rounded-lg border p-3 text-muted-foreground text-sm">{t("没有等待打包的订单。")}</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function CurrentOrder(props: {
  order: OrderRow;
  step: PackStationStep;
  busy: boolean;
  lastScanned: string;
  nodeOptions: NodeOption[];
  nodeId: string;
  onNodeId: (value: string) => void;
  packagingMethod: string;
  onPackagingMethod: (value: string) => void;
  packageCount: string;
  onPackageCount: (value: string) => void;
  canHandOver: boolean;
  onComplete: () => void;
  onChooseDestination: () => void;
  onPrint: () => void;
  onHandOver: () => void;
  onClose: () => void;
}) {
  const { order, step, busy } = props;
  const delivery = order.fulfillmentMethod === "KIKUYU_LOCAL_DELIVERY";
  const address = parseDeliveryAddress(order.deliveryAddress ?? "");
  const left = remainingItems(order);
  const unrouted = needsDestination(order);
  const phone = order.whatsappPhone ?? order.customer.phone ?? order.payments[0]?.phone ?? null;

  return (
    <div className="flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-semibold text-lg">{order.orderNumber}</span>
          <Badge variant={delivery ? "default" : "secondary"}>{delivery ? t("送货上门") : t("自提")}</Badge>
          {order.fulfillment?.packageCode ? <Badge variant="outline" className="font-mono">{order.fulfillment.packageCode}</Badge> : null}
        </div>
        <Button size="sm" variant="ghost" disabled={busy} onClick={props.onClose}>
          <XIcon data-icon="inline-start" />{t("换一单")}
        </Button>
      </div>

      {step === "scan" ? (
        <div className="rounded-lg bg-amber-50 p-3 text-amber-900">
          <p className="font-semibold text-xl">{t("还差 {count} 件", { count: left.length })}</p>
          <p className="text-sm">{t("把下面这几件找齐，一件一件扫。全部扫完自动进入下一步。")}</p>
          {props.lastScanned ? <p className="mt-1 text-sm">{t("刚扫过：{title}", { title: props.lastScanned })}</p> : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {order.items.map((item) => {
          const verified = isItemVerified(order, item.id) || step !== "scan";
          const image = proxied(item.displayImageUrl ?? item.snapshot?.imageUrl);
          return (
            <div key={item.id} className={`flex items-center gap-3 rounded-lg border p-2 ${verified ? "" : "border-amber-400"}`}>
              {image ? (
                <img src={image} alt={item.snapshot?.title ?? ""} className="size-16 shrink-0 rounded border bg-white object-contain" />
              ) : (
                <div className="flex size-16 shrink-0 items-center justify-center rounded border bg-muted text-muted-foreground text-xs">{t("无图")}</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.snapshot?.title ?? t("未命名商品")}</p>
                <p className="text-muted-foreground text-sm">
                  <span className="font-semibold text-foreground">{item.inventoryItem?.location?.locationCode ?? t("货架位未分配")}</span>
                  {" · "}<span className="font-mono">{expectedBarcodeFor(order, item) || t("条码缺失")}</span>
                  {item.snapshot?.sizeLabel ? <> · {item.snapshot.sizeLabel}</> : null}
                </p>
              </div>
              <Badge variant={verified ? "secondary" : "outline"}>{verified ? t("已核对") : t("未核对")}</Badge>
            </div>
          );
        })}
      </div>

      {step !== "scan" ? (
        <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
          <div>
            <p className="text-muted-foreground text-xs">{t("顾客")}</p>
            <p className="font-semibold text-2xl">{order.customer.displayName ?? order.customer.email}</p>
            <p className="font-mono text-xl">{phone ?? t("未留手机号")}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">{t("去哪里")}</p>
            <p className="font-semibold text-xl">{destinationText(order)}</p>
            {delivery ? (
              <>
                <p className="mt-1 break-words">{address.address || t("未填写地址")}</p>
                {order.deliveryNote ? <p className="whitespace-pre-wrap text-muted-foreground text-sm">{order.deliveryNote}</p> : null}
                {address.point ? <a className="text-sm underline" href={deliveryMapUrl(address.point)} target="_blank" rel="noopener noreferrer">Google Maps ↗</a> : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {step !== "scan" && unrouted ? (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-400 p-3">
          <p className="font-medium">{delivery ? t("这单经哪家门店中转？") : t("这单在哪里自提？")}</p>
          <NativeSelect className="h-12 w-full" value={props.nodeId} onChange={(event) => props.onNodeId(event.target.value)} disabled={busy}>
            <NativeSelectOption value="">{t("请选择")}</NativeSelectOption>
            {props.nodeOptions.map((node) => (
              <NativeSelectOption key={node.id} value={node.id}>
                {node.type === "WAREHOUSE" ? t("{name}（中央仓）", { name: node.name }) : node.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {step !== "details" ? (
            <Button disabled={busy || !props.nodeId} onClick={props.onChooseDestination}>{t("保存目的地")}</Button>
          ) : null}
        </div>
      ) : null}

      {step === "details" ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <NativeSelect className="h-12 flex-1" value={props.packagingMethod} onChange={(event) => props.onPackagingMethod(event.target.value)} disabled={busy}>
              {PACKAGING.map(([value, label]) => <NativeSelectOption key={value} value={value}>{t(label)}</NativeSelectOption>)}
            </NativeSelect>
            <Input
              className="h-12 w-24 text-center"
              inputMode="numeric"
              value={props.packageCount}
              onChange={(event) => props.onPackageCount(event.target.value.replace(/\D/g, "").slice(0, 2))}
              aria-label={t("包裹数量")}
              disabled={busy}
            />
          </div>
          <Button className="h-14 text-lg" disabled={busy || !Number(props.packageCount) || (unrouted && !props.nodeId)} onClick={props.onComplete}>
            <PackageCheckIcon data-icon="inline-start" />{t("装好了，完成打包")}
          </Button>
          <p className="text-muted-foreground text-xs">{t("一单装成两个包就填 2。完成后生成包裹号，下一步打面单。")}</p>
        </div>
      ) : null}

      {step === "print" ? (
        <div className="flex flex-col gap-2">
          <Button className="h-14 text-lg" disabled={busy} onClick={props.onPrint}>
            <PrinterIcon data-icon="inline-start" />{busy ? t("正在打印…") : t("打印面单")}
          </Button>
          <p className="text-muted-foreground text-xs">{t("会连着打几张：第 1 张贴在包裹上（门店扫它签收），其余放进包裹。")}</p>
        </div>
      ) : null}

      {step === "send" && !unrouted ? (
        <div className="flex flex-col gap-2">
          {needsLabel(order) ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary"><PrinterIcon />{t("面单已打印")}</Badge>
              <Button size="sm" variant="outline" disabled={busy} onClick={props.onPrint}>{t("重打面单")}</Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t("在中央仓直接交给顾客或骑手，不用贴面单。")}</p>
          )}
          <Button className="h-14 text-lg" disabled={busy || !props.canHandOver} onClick={props.onHandOver}>
            <TruckIcon data-icon="inline-start" />{handoverLabel(order)}
          </Button>
          {!props.canHandOver ? (
            <p className="text-destructive text-sm">{t("这个账号不能做这一步，请主管在订单工作台处理。")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
