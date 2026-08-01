"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import JsBarcode from "jsbarcode";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  LoaderCircleIcon,
  PrinterIcon,
  ScanBarcodeIcon
} from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DEFAULT_LABEL_SIZE,
  DEFAULT_PRINT_AGENT_URL,
  DEFAULT_PRINTER_NAME,
  buildLabelPrintPayload,
  printerList,
  selectDeliPrinter
} from "../local-label-print";
import { labelScanIssue, normalizeLabelScan } from "./product-factory-barcode-flow";
import { productStatusLabel } from "./product-factory-display";

const API_PROXY_URL = "/api-proxy";

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
  labelAppliedAt?: string | null;
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

export function ProductBatchBarcodePage({ batchId }: { batchId: string }) {
  const ids = useOperationIds();
  const scanRef = useRef<HTMLInputElement>(null);
  const [batch, setBatch] = useState<ProductBatch | null>(null);
  const [scanValue, setScanValue] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    setBatch(await loadBatch(batchId, ids.adminUserId));
  }, [batchId, ids.adminUserId]);

  useEffect(() => {
    void load().catch((caught) => setError(errorMessage(caught, "无法读取 Barcode 工位。")));
  }, [load]);

  async function generateBarcodes() {
    if (!batch) return;
    setBusy("generate");
    setError("");
    setNotice("");
    try {
      await request(`/operations/product-batches/${batch.id}/generate-barcodes`, {
        method: "POST",
        body: JSON.stringify(ids)
      });
      await load();
      setNotice("本批 10 个 Barcode 已生成并与商品固定绑定。");
    } catch (caught) {
      setError(errorMessage(caught, "无法生成 Barcode。"));
    } finally {
      setBusy("");
    }
  }

  async function printProducts(products: ProductRecord[]) {
    if (!batch || products.length === 0) return;
    setBusy(products.length === 1 ? `print-${products[0].id}` : "print-all");
    setError("");
    setNotice("");
    try {
      const health = await fetch(`${DEFAULT_PRINT_AGENT_URL}/health`);
      if (!health.ok) throw new Error("本机打印代理未就绪。");
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
      setError(errorMessage(caught, "打印失败。请启动本机打印代理并确认 Deli DL-720C 已连接。"));
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
      setNotice("已确认本批标签完成打印。现在请按商品顺序贴码并逐件扫描确认。");
      window.setTimeout(() => scanRef.current?.focus(), 0);
    } catch (caught) {
      setError(errorMessage(caught, "无法确认打印。"));
    } finally {
      setBusy("");
    }
  }

  async function confirmScan() {
    if (!batch) return;
    const issue = labelScanIssue(scanValue, batch.products);
    if (issue) {
      setError(issue);
      setNotice("");
      setScanValue("");
      scanRef.current?.focus();
      return;
    }
    setBusy("scan");
    setError("");
    setNotice("");
    try {
      const barcode = normalizeLabelScan(scanValue);
      const product = batch.products.find((item) => normalizeLabelScan(item.barcode ?? "") === barcode);
      await request(`/operations/product-batches/${batch.id}/confirm-label`, {
        method: "POST",
        body: JSON.stringify({ ...ids, barcode })
      });
      setNotice(`第 ${product?.batchItemNumber ?? "-"} 件贴码确认成功。`);
      setScanValue("");
      await load();
    } catch (caught) {
      setError(errorMessage(caught, "贴码确认失败。"));
      setScanValue("");
    } finally {
      setBusy("");
      window.setTimeout(() => scanRef.current?.focus(), 0);
    }
  }

  if (!batch) return <StatusMessage tone={error ? "danger" : "neutral"}>{error || "正在读取 Barcode 工位..."}</StatusMessage>;

  const barcodeCount = batch.products.filter((product) => product.barcode).length;
  const printedCount = batch.products.filter((product) => product.labelPrintedAt).length;
  const appliedCount = batch.products.filter((product) => product.labelAppliedAt).length;
  const allCalibrated = batch.products.every((product) => product.status === "CALIBRATED");
  const readyForReview = appliedCount === batch.targetCount;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href={`/product/batches/${encodeURIComponent(batch.id)}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeftIcon className="size-3" />返回批次</Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">{batch.batchCode} · Barcode 与贴码</h1>
          <p className="mt-1 text-sm text-muted-foreground">已生成 {barcodeCount}/{batch.targetCount} · 已打印 {printedCount}/{batch.targetCount} · 已贴码确认 {appliedCount}/{batch.targetCount}</p>
        </div>
        {readyForReview ? <Button asChild><Link href={`/product/review?batchId=${encodeURIComponent(batch.id)}`}>进入商品审核<ArrowRightIcon data-icon="inline-end" /></Link></Button> : null}
      </header>

      <div className="grid grid-cols-3 gap-2">
        <ProgressMetric label="生成" value={barcodeCount} total={batch.targetCount} />
        <ProgressMetric label="打印" value={printedCount} total={batch.targetCount} />
        <ProgressMetric label="贴码" value={appliedCount} total={batch.targetCount} />
      </div>
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      {notice ? <StatusMessage tone="neutral">{notice}</StatusMessage> : null}

      {barcodeCount < batch.targetCount ? (
        <section className="rounded-md border p-4">
          <h2 className="font-semibold">1. 生成本批 Barcode</h2>
          <p className="mt-1 text-sm text-muted-foreground">只有本批 {batch.targetCount} 件全部完成人工校准后才允许生成。生成后每个码永久绑定一件商品。</p>
          <Button className="mt-4" disabled={Boolean(busy) || !allCalibrated} onClick={() => void generateBarcodes()}>
            {busy === "generate" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <ScanBarcodeIcon data-icon="inline-start" />}
            生成 {batch.targetCount} 个 Barcode
          </Button>
          {!allCalibrated ? <p className="mt-2 text-xs text-destructive">尚有商品未完成人工校准，暂不能生成。</p> : null}
        </section>
      ) : null}

      {barcodeCount === batch.targetCount ? (
        <>
          <section className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">2. 打印并按顺序贴码</h2>
              <p className="mt-1 text-sm text-muted-foreground">模板 {DEFAULT_LABEL_SIZE} mm · Deli DL-720C · 批次号、序号、短标题与 Barcode 同时打印。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => window.print()}><PrinterIcon data-icon="inline-start" />打印预览</Button>
              <Button disabled={Boolean(busy)} onClick={() => void printProducts(batch.products)}><PrinterIcon data-icon="inline-start" />发送到打印机</Button>
              <Button variant="outline" disabled={Boolean(busy) || printedCount === batch.targetCount} onClick={() => void confirmManualPrint()}>确认已打印</Button>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-2">
            {batch.products.map((product) => (
              <LabelPreview key={product.id} batchCode={batch.batchCode} product={product} targetCount={batch.targetCount} disabled={Boolean(busy)} onPrint={() => void printProducts([product])} />
            ))}
          </section>

          <section className="rounded-md border p-4">
            <h2 className="font-semibold">3. 扫描确认贴码</h2>
            <p className="mt-1 text-sm text-muted-foreground">每贴好一件，立即扫描衣服上的 Barcode。系统会阻止错批次和重复扫描。</p>
            <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void confirmScan(); }}>
              <Input ref={scanRef} autoFocus autoComplete="off" className="font-mono" placeholder="点击此处后扫描 Barcode" value={scanValue} disabled={Boolean(busy) || printedCount === 0 || readyForReview} onChange={(event) => setScanValue(event.target.value)} />
              <Button type="submit" disabled={Boolean(busy) || !scanValue.trim() || readyForReview}>{busy === "scan" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <ScanBarcodeIcon data-icon="inline-start" />}确认贴码</Button>
            </form>
            {printedCount === 0 ? <p className="mt-2 text-xs text-destructive">先完成打印确认，扫描框才会启用。</p> : null}
          </section>
        </>
      ) : null}

      {readyForReview ? <StatusMessage tone="neutral"><span className="flex items-center gap-2"><CheckCircle2Icon className="size-4 text-emerald-600" />本批 {batch.targetCount} 件已全部贴码确认，可以进入审核。</span></StatusMessage> : null}
    </div>
  );
}

function LabelPreview(props: { batchCode: string; product: ProductRecord; targetCount: number; disabled: boolean; onPrint: () => void }) {
  return (
    <article className={cn("overflow-hidden rounded-md border bg-white text-black", props.product.labelAppliedAt && "border-emerald-500")}>
      <div className="aspect-[3/2] p-3">
        <div className="flex items-start justify-between gap-2 text-xs">
          <span className="font-semibold">{props.batchCode}</span>
          <span>第 {props.product.batchItemNumber ?? "-"}/{props.targetCount} 件</span>
        </div>
        <div className="mt-1 truncate text-sm font-semibold">{shortTitle(props.product.title || props.product.productCode)}</div>
        <BarcodeGraphic value={props.product.barcode || ""} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs print:hidden">
        <Badge variant={props.product.labelAppliedAt ? "default" : props.product.labelPrintedAt ? "secondary" : "outline"}>
          {props.product.labelAppliedAt ? "已贴码" : props.product.labelPrintedAt ? "已打印" : productStatusLabel(props.product.status)}
        </Badge>
        <Button size="sm" variant="ghost" disabled={props.disabled} onClick={props.onPrint}><PrinterIcon data-icon="inline-start" />单张打印</Button>
      </div>
    </article>
  );
}

function BarcodeGraphic({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    JsBarcode(ref.current, value, { format: "CODE128", displayValue: true, fontSize: 12, height: 42, margin: 0, width: 1.5 });
  }, [value]);
  return value ? <svg ref={ref} className="mt-2 h-16 w-full" aria-label={`Barcode ${value}`} /> : <div className="mt-4 text-center text-xs text-red-600">Barcode 未生成</div>;
}

function ProgressMetric({ label, value, total }: { label: string; value: number; total: number }) {
  return <div className="rounded-md border p-3 text-center"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold tabular-nums">{value}/{total}</div></div>;
}

function StatusMessage({ tone, children }: { tone: "danger" | "neutral"; children: ReactNode }) {
  return <div className={cn("rounded-md border px-4 py-3 text-sm", tone === "danger" ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted/40 text-muted-foreground")}>{children}</div>;
}

function shortTitle(value: string) {
  const clean = value.trim();
  return clean.length > 36 ? `${clean.slice(0, 33)}...` : clean;
}

function translateApiError(value: string) {
  const translations: Array<[RegExp, string]> = [
    [/belongs to another batch/i, "该 Barcode 属于其他批次。"],
    [/does not match this batch/i, "该 Barcode 不属于当前批次。"],
    [/already confirmed/i, "该 Barcode 已经确认贴码，请勿重复扫描。"],
    [/Print the label/i, "请先完成标签打印。"]
  ];
  return translations.find(([pattern]) => pattern.test(value))?.[1] ?? value;
}

function errorMessage(value: unknown, fallback: string) {
  return value instanceof Error ? value.message : fallback;
}
