"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ProductImageComparisonResponse } from "@online-saler/shared-types";
import JsBarcode from "jsbarcode";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  BarcodeIcon,
  CheckCircle2Icon,
  LoaderCircleIcon,
  MapPinIcon,
  PackageCheckIcon,
  PrinterIcon,
  RefreshCwIcon
} from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DEFAULT_LABEL_SIZE,
  DEFAULT_PRINT_AGENT_URL,
  DEFAULT_PRINTER_NAME,
  buildLabelPrintPayload,
  printerList,
  selectDeliPrinter
} from "../local-label-print";
import { productStatusLabel } from "./product-factory-display";

const API_PROXY_URL = "/api-proxy";

type InventoryItem = {
  status?: string | null;
  locationId?: string | null;
  location?: { locationCode?: string | null } | null;
};

type ProductRecord = Record<string, unknown> & {
  id: string;
  productCode: string;
  batchItemNumber?: number | null;
  status: string;
  barcode?: string | null;
  title?: string | null;
  category?: string | null;
  color?: string | null;
  finalSizeLabel?: string | null;
  tagSize?: string | null;
  conditionGrade?: string | null;
  labelPrintedAt?: string | null;
  inventoryItem?: InventoryItem | null;
};

type ProductBatch = {
  id: string;
  batchCode: string;
  targetCount: number;
  stage: string;
  stageLabel: string;
  products: ProductRecord[];
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_PROXY_URL}${path}`, {
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
    const message = body && typeof body === "object" && "message" in body
      ? String((body as { message?: unknown }).message)
      : `Request failed: ${response.status}`;
    throw new Error(translateApiError(message));
  }
  return body as T;
}

function useOperationIds() {
  const { session } = useOperationsSession();
  return useMemo(() => ({
    adminUserId: String(session?.adminUser?.id ?? ""),
    employeeId: String(session?.adminUser?.linkedEmployeeId ?? "")
  }), [session]);
}

async function loadBatch(batchId: string, adminUserId: string): Promise<ProductBatch> {
  const query = new URLSearchParams({ adminUserId });
  const batch = await request<ProductBatch>(`/operations/product-batches/${encodeURIComponent(batchId)}?${query.toString()}`);
  return {
    ...batch,
    products: [...batch.products].sort((left, right) => Number(left.batchItemNumber ?? 0) - Number(right.batchItemNumber ?? 0))
  };
}

async function loadComparison(productId: string, adminUserId: string) {
  return request<ProductImageComparisonResponse>(`/products/${productId}/image-comparison`, {
    headers: { "X-Admin-User-Id": adminUserId }
  });
}

export function ProductBatchBarcodePage({ batchId }: { batchId: string }) {
  const ids = useOperationIds();
  const [batch, setBatch] = useState<ProductBatch | null>(null);
  const [comparisons, setComparisons] = useState<Record<string, ProductImageComparisonResponse>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    const next = await loadBatch(batchId, ids.adminUserId);
    const comparisonEntries = await Promise.all(next.products.map(async (product) => {
      try {
        return [product.id, await loadComparison(product.id, ids.adminUserId)] as const;
      } catch {
        return null;
      }
    }));
    setBatch(next);
    setComparisons(Object.fromEntries(
      comparisonEntries.filter((entry): entry is readonly [string, ProductImageComparisonResponse] => Boolean(entry))
    ));
  }, [batchId, ids.adminUserId]);

  useEffect(() => {
    const carriedNotice = sessionStorage.getItem(`product-factory-notice:${batchId}`);
    if (carriedNotice) {
      sessionStorage.removeItem(`product-factory-notice:${batchId}`);
      setNotice(carriedNotice);
    }
    void load().catch((caught) => setError(errorMessage(caught, "无法读取打印与归位工作台。")));
  }, [batchId, load]);

  const allAiDisplaysReady = Boolean(batch?.products.length) && batch!.products.every((product) =>
    Boolean(comparisons[product.id]?.aiDisplayMain)
  );

  useEffect(() => {
    if (!batch || busy || allAiDisplaysReady || batch.products.every((product) => product.status === "PUBLISHED")) return;
    const timer = window.setTimeout(() => {
      void load().catch(() => undefined);
    }, 3_000);
    return () => window.clearTimeout(timer);
  }, [allAiDisplaysReady, batch, busy, load]);

  async function generateBarcodesAndLocations() {
    if (!batch) return;
    setBusy("generate");
    setError("");
    try {
      await request(`/operations/product-batches/${batch.id}/generate-barcodes`, {
        method: "POST",
        body: JSON.stringify(ids)
      });
      await load();
      setNotice(`本批 ${batch.targetCount} 个 Barcode 已生成，货架位已同时预留。`);
    } catch (caught) {
      setError(errorMessage(caught, "无法生成 Barcode 或预留货架位。"));
    } finally {
      setBusy("");
    }
  }

  async function rerunDetails() {
    if (!batch) return;
    setBusy("details");
    setError("");
    try {
      await request(`/operations/product-batches/${batch.id}/detail-generation/run`, {
        method: "POST",
        headers: { "X-Admin-User-Id": ids.adminUserId },
        body: JSON.stringify({})
      });
      setNotice("正在补生成 AI 陈列图与销售详情，完成后本页会自动更新。");
      await load();
    } catch (caught) {
      setError(errorMessage(caught, "无法生成 AI 陈列图与销售详情。"));
    } finally {
      setBusy("");
    }
  }

  async function printProducts(products: ProductRecord[]) {
    if (!batch || products.length === 0) return;
    setBusy(products.length === 1 ? `print-${products[0]!.id}` : "print-all");
    setError("");
    setNotice("");
    try {
      const health = await fetch(`${DEFAULT_PRINT_AGENT_URL}/health`);
      if (!health.ok) throw new Error("本地打印代理未就绪。");
      const printersResponse = await fetch(`${DEFAULT_PRINT_AGENT_URL}/printers`);
      const printersBody = await printersResponse.json() as { printers?: unknown };
      const printerName = selectDeliPrinter(printerList(printersBody.printers), DEFAULT_PRINTER_NAME);
      for (const product of products) {
        const response = await fetch(`${DEFAULT_PRINT_AGENT_URL}/print/label`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildLabelPrintPayload({ product, labelSize: DEFAULT_LABEL_SIZE, printerName }))
        });
        if (!response.ok) throw new Error(`第 ${product.batchItemNumber ?? "-"} 件标签打印失败。`);
      }
      await markPrinted(products);
      setNotice(`已发送 ${products.length} 张标签到 ${printerName}。`);
    } catch (caught) {
      setError(errorMessage(caught, "打印失败。请启动本地打印代理并确认 Deli DL-720C 已连接。"));
    } finally {
      setBusy("");
    }
  }

  async function markPrinted(products: ProductRecord[]) {
    if (!batch) return;
    if (products.length === batch.products.length) {
      await request(`/operations/product-batches/${batch.id}/mark-labels-printed`, {
        method: "POST",
        body: JSON.stringify(ids)
      });
    } else {
      await request("/operations/product-control/labels/printed", {
        method: "POST",
        body: JSON.stringify({ ...ids, productIds: products.map((product) => product.id) })
      });
    }
    await load();
  }

  async function confirmManualPrint() {
    if (!batch) return;
    setBusy("confirm-print");
    setError("");
    try {
      await markPrinted(batch.products.filter((product) => product.barcode));
      setNotice("已确认标签打印完成。请按每张卡片的大号货架位归位。 ");
    } catch (caught) {
      setError(errorMessage(caught, "无法确认打印。"));
    } finally {
      setBusy("");
    }
  }

  async function confirmPlacedAndPublish() {
    if (!batch) return;
    if (!window.confirm(`确认本批 ${batch.targetCount} 件 AI 陈列图无异常，并已按货架号归位？确认后将直接入仓并发布。`)) return;
    setBusy("publish");
    setError("");
    setNotice("");
    try {
      await request(`/operations/product-batches/${batch.id}/complete-and-publish`, {
        method: "POST",
        body: JSON.stringify(ids)
      });
      await load();
      setNotice(`本批 ${batch.targetCount} 件已完成入仓并发布。`);
    } catch (caught) {
      await load().catch(() => undefined);
      setError(errorMessage(caught, "无法完成入仓与发布。已完成的动作会保留，可修复后继续。"));
    } finally {
      setBusy("");
    }
  }

  if (!batch) return <StatusMessage tone={error ? "danger" : "neutral"}>{error || "正在读取打印与归位工作台..."}</StatusMessage>;

  const barcodeCount = batch.products.filter((product) => product.barcode).length;
  const locationCount = batch.products.filter((product) => product.inventoryItem?.location?.locationCode).length;
  const printedCount = batch.products.filter((product) => product.labelPrintedAt).length;
  const publishedCount = batch.products.filter((product) => product.status === "PUBLISHED").length;
  const allCalibrated = batch.products.every((product) => product.status === "CALIBRATED");
  const allBarcodesReady = barcodeCount === batch.targetCount;
  const allLocationsReady = locationCount === batch.targetCount;
  const allPrinted = printedCount === batch.targetCount;
  const readyToPublish = allBarcodesReady && allLocationsReady && allPrinted && allAiDisplaysReady;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href={`/product/batches/${encodeURIComponent(batch.id)}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeftIcon className="size-3" />返回批次</Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">{batch.batchCode} · 第 3 步：打印、归位并发布</h1>
          <p className="mt-1 text-sm text-muted-foreground">Barcode、AI 陈列图和货架位已集中在一个页面；正常商品不再进入第二轮详情审批。</p>
        </div>
        {publishedCount < batch.targetCount ? (
          <Button variant="outline" asChild><Link href={`/product/review?batchId=${encodeURIComponent(batch.id)}`}><AlertTriangleIcon data-icon="inline-start" />发现异常，进入单件处理</Link></Button>
        ) : null}
      </header>

      <div className="grid grid-cols-3 gap-2">
        <ProgressMetric label="Barcode" value={barcodeCount} total={batch.targetCount} />
        <ProgressMetric label="货架位" value={locationCount} total={batch.targetCount} />
        <ProgressMetric label="已打印" value={printedCount} total={batch.targetCount} />
      </div>
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      {notice ? <StatusMessage tone="neutral">{notice}</StatusMessage> : null}

      {!allBarcodesReady || !allLocationsReady ? (
        <section className="rounded-md border p-4">
          <h2 className="font-semibold">生成 Barcode 并预留货架位</h2>
          <p className="mt-1 text-sm text-muted-foreground">本批全部完成人工尺码确认后，系统一次生成 Barcode，并立即显示每件衣服应放的位置。</p>
          <Button className="mt-4" disabled={Boolean(busy) || (!allCalibrated && barcodeCount === 0)} onClick={() => void generateBarcodesAndLocations()}>
            {busy === "generate" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <BarcodeIcon data-icon="inline-start" />}
            生成 Barcode 与货架位
          </Button>
        </section>
      ) : null}

      {allBarcodesReady ? (
        <>
          <section className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">打印并按大号货架位归位</h2>
              <p className="mt-1 text-sm text-muted-foreground">模板 {DEFAULT_LABEL_SIZE} mm · Deli DL-720C · Barcode、尺码和货架位同时打印。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => window.print()}><PrinterIcon data-icon="inline-start" />打印预览</Button>
              <Button disabled={Boolean(busy) || !allLocationsReady} onClick={() => void printProducts(batch.products)}><PrinterIcon data-icon="inline-start" />发送到打印机</Button>
              <Button variant="outline" disabled={Boolean(busy) || allPrinted} onClick={() => void confirmManualPrint()}>确认已打印</Button>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-2">
            {batch.products.map((product) => (
              <LabelPreview
                key={product.id}
                batchCode={batch.batchCode}
                product={product}
                comparison={comparisons[product.id]}
                targetCount={batch.targetCount}
                disabled={Boolean(busy)}
                onPrint={() => void printProducts([product])}
              />
            ))}
          </section>

          {!allAiDisplaysReady ? (
            <StatusMessage tone="neutral">
              <span className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-2"><LoaderCircleIcon className="size-4 animate-spin" />AI 陈列图与详情仍在生成，完成后本页自动更新。</span>
                <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void rerunDetails()}><RefreshCwIcon data-icon="inline-start" />补生成</Button>
              </span>
            </StatusMessage>
          ) : null}

          {publishedCount < batch.targetCount ? (
            <section className="rounded-md border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold">最后一次批量确认</h2>
                  <p className="mt-1 text-sm text-muted-foreground">只需确认标签已贴、衣服已按货架号放好、AI 陈列图无明显异常；详情无需再次逐件审批。</p>
                </div>
                <Button disabled={Boolean(busy) || !readyToPublish} onClick={() => void confirmPlacedAndPublish()}>
                  {busy === "publish" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <PackageCheckIcon data-icon="inline-start" />}
                  确认已归位并发布
                </Button>
              </div>
              {!readyToPublish ? <p className="mt-3 text-xs text-muted-foreground">还需完成：{pendingLabels({ allLocationsReady, allPrinted, allAiDisplaysReady }).join("、")}。</p> : null}
            </section>
          ) : (
            <StatusMessage tone="neutral"><span className="flex items-center gap-2"><CheckCircle2Icon className="size-4 text-emerald-600" />本批已全部入仓并发布。</span></StatusMessage>
          )}
        </>
      ) : null}
    </div>
  );
}

function LabelPreview(props: {
  batchCode: string;
  product: ProductRecord;
  comparison?: ProductImageComparisonResponse;
  targetCount: number;
  disabled: boolean;
  onPrint: () => void;
}) {
  const locationCode = props.product.inventoryItem?.location?.locationCode || "待分配";
  const whiteUrl = comparisonUrl(props.comparison?.cutoutWhite?.publicUrl);
  const aiUrl = comparisonUrl(props.comparison?.aiDisplayMain?.publicUrl);
  return (
    <article className={cn("overflow-hidden rounded-md border bg-white text-black", props.product.labelPrintedAt && "border-emerald-500")}>
      <div className="grid grid-cols-[112px_1fr] gap-3 p-3">
        <div className="grid grid-rows-2 gap-1 print:hidden">
          <ProductThumb src={whiteUrl} alt={`${props.product.productCode} 白底正面`} label="白底" />
          <ProductThumb src={aiUrl} alt={`${props.product.productCode} AI 陈列图`} label="AI 陈列" />
        </div>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2 text-xs">
            <span className="font-semibold">{props.batchCode}</span>
            <span>第 {props.product.batchItemNumber ?? "-"}/{props.targetCount} 件</span>
          </div>
          <div className="mt-1 truncate text-sm font-semibold">{shortTitle(props.product.title || props.product.productCode)}</div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><MapPinIcon className="size-4" />货架位</div>
          <div className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{locationCode}</div>
          <BarcodeGraphic value={props.product.barcode || ""} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs print:hidden">
        <Badge variant={props.product.labelPrintedAt ? "default" : "outline"}>
          {props.product.labelPrintedAt ? "已打印" : productStatusLabel(props.product.status)}
        </Badge>
        <Button size="sm" variant="ghost" disabled={props.disabled || locationCode === "待分配"} onClick={props.onPrint}><PrinterIcon data-icon="inline-start" />单张打印</Button>
      </div>
    </article>
  );
}

function ProductThumb({ src, alt, label }: { src: string; alt: string; label: string }) {
  return (
    <div className="relative flex min-h-24 items-center justify-center overflow-hidden rounded border bg-white">
      {src ? <img src={src} alt={alt} className="size-full object-contain" /> : <span className="text-xs text-muted-foreground">生成中</span>}
      <span className="absolute bottom-1 left-1 rounded bg-white/90 px-1 text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function BarcodeGraphic({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    JsBarcode(ref.current, value, { format: "CODE128", displayValue: true, fontSize: 12, height: 42, margin: 0, width: 1.5 });
  }, [value]);
  return value ? <svg ref={ref} className="mt-3 h-16 w-full" aria-label={`Barcode ${value}`} /> : <div className="mt-4 text-center text-xs text-red-600">Barcode 未生成</div>;
}

function ProgressMetric({ label, value, total }: { label: string; value: number; total: number }) {
  return <div className="rounded-md border p-3 text-center"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold tabular-nums">{value}/{total}</div></div>;
}

function StatusMessage({ tone, children }: { tone: "danger" | "neutral"; children: ReactNode }) {
  return <div className={cn("rounded-md border px-4 py-3 text-sm", tone === "danger" ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted/40 text-muted-foreground")}>{children}</div>;
}

function pendingLabels(input: { allLocationsReady: boolean; allPrinted: boolean; allAiDisplaysReady: boolean }) {
  const pending = [];
  if (!input.allLocationsReady) pending.push("货架位分配");
  if (!input.allPrinted) pending.push("标签打印");
  if (!input.allAiDisplaysReady) pending.push("AI 陈列图生成");
  return pending;
}

function comparisonUrl(value?: string | null) {
  return value ? `${API_PROXY_URL}${value}` : "";
}

function shortTitle(value: string) {
  const clean = value.trim();
  return clean.length > 36 ? `${clean.slice(0, 33)}...` : clean;
}

function translateApiError(value: string) {
  const translations: Array<[RegExp, string]> = [
    [/Print the label/i, "请先完成标签打印。"],
    [/must be approved/i, "本批商品必须全部确认通过。"],
    [/complete storage/i, "请先按货架号完成归位。"]
  ];
  return translations.find(([pattern]) => pattern.test(value))?.[1] ?? value;
}

function errorMessage(value: unknown, fallback: string) {
  return value instanceof Error ? value.message : fallback;
}
