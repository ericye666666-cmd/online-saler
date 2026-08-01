"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ProductImageComparisonResponse, ProductImageVariantRecord } from "@online-saler/shared-types";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ImageOffIcon,
  LoaderCircleIcon,
  PackageCheckIcon,
  ScanLineIcon,
  SendIcon,
  XCircleIcon
} from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { normalizedAiOutput, stringValue, type JsonRecord } from "../operations-workspace-flow";
import { productStatusLabel } from "./product-factory-display";
import { normalizeStorageScan, storageScanIssue } from "./product-factory-storage-flow";

const API_PROXY_URL = "/api-proxy";

type ProductImage = { id: string; type: string; publicUrl?: string | null };
type InventoryItem = { status?: string | null; checkedInAt?: string | null; locationId?: string | null; location?: { locationCode?: string | null } | null };
type ProductRecord = JsonRecord & {
  id: string;
  productCode: string;
  batchItemNumber?: number | null;
  status: string;
  barcode?: string | null;
  title?: string | null;
  category?: string | null;
  subcategory?: string | null;
  gender?: string | null;
  color?: string | null;
  pattern?: string | null;
  sleeveType?: string | null;
  brand?: string | null;
  tagSize?: string | null;
  finalSizeLabel?: string | null;
  conditionGrade?: string | null;
  priceKsh?: number | null;
  description?: string | null;
  images?: ProductImage[];
  measurements?: Array<{ measurementType?: string; aiValueCm?: unknown; finalValueCm?: unknown }>;
  defects?: Array<{ defectType?: string; severity?: string; description?: string; customerSafeDescription?: string | null }>;
  reviews?: Array<{ result?: string; reason?: string | null; createdAt?: string }>;
  aiExtractions?: JsonRecord[];
  inventoryItem?: InventoryItem | null;
  labelAppliedAt?: string | null;
};
type ProductBatch = { id: string; batchCode: string; targetCount: number; stage: string; stageLabel: string; products: ProductRecord[] };
type ImageTab = { key: string; label: string; url: string; transparent?: boolean; selected?: boolean };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_PROXY_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) }
  });
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text || `Request failed: ${response.status}` }; }
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body ? String((body as { message?: unknown }).message) : `Request failed: ${response.status}`;
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

export function ProductBatchReviewPage({ batchId }: { batchId: string }) {
  const ids = useOperationIds();
  const [batch, setBatch] = useState<ProductBatch | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [comparison, setComparison] = useState<ProductImageComparisonResponse | null>(null);
  const [activeImage, setActiveImage] = useState("original");
  const [reason, setReason] = useState("");
  const [barcode, setBarcode] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    const query = new URLSearchParams({ adminUserId: ids.adminUserId });
    const next = await request<ProductBatch>(`/operations/product-batches/${encodeURIComponent(batchId)}?${query.toString()}`);
    next.products = [...next.products].sort((left, right) => Number(left.batchItemNumber ?? 0) - Number(right.batchItemNumber ?? 0));
    setBatch(next);
    const firstReviewable = next.products.findIndex((product) => isReviewable(product.status));
    if (firstReviewable >= 0) setCurrentIndex((current) => isReviewable(next.products[current]?.status ?? "") ? current : firstReviewable);
  }, [batchId, ids.adminUserId]);

  useEffect(() => { void load().catch((caught) => setError(errorMessage(caught, "无法读取审核批次。"))); }, [load]);

  const product = batch?.products[currentIndex] ?? null;
  useEffect(() => {
    setActiveImage("original");
    setComparison(null);
    if (!product || !ids.adminUserId) return;
    void request<ProductImageComparisonResponse>(`/products/${product.id}/image-comparison`, {
      headers: { "X-Admin-User-Id": ids.adminUserId }
    }).then(setComparison).catch((caught) => setError(errorMessage(caught, "无法读取图片版本。")));
  }, [ids.adminUserId, product]);

  async function run(action: string, operation: () => Promise<void>, success: string) {
    setBusy(action);
    setError("");
    setNotice("");
    try {
      await operation();
      await load();
      setNotice(success);
    } catch (caught) {
      setError(errorMessage(caught, "操作失败。"));
    } finally {
      setBusy("");
    }
  }

  async function review(result: "APPROVED" | "REWORK_REQUIRED" | "REJECTED") {
    if (!product) return;
    if (result !== "APPROVED" && !reason.trim()) {
      setError("退回或拒绝时必须填写原因。");
      return;
    }
    await run(`review-${result}`, async () => {
      await request(`/operations/product-batches/products/${product.id}/review`, {
        method: "POST",
        body: JSON.stringify({ ...ids, result, reason: reason.trim() || undefined })
      });
      setReason("");
      setCurrentIndex((index) => Math.min(index + 1, (batch?.products.length ?? 1) - 1));
    }, result === "APPROVED" ? `第 ${product.batchItemNumber} 件审核通过。` : `第 ${product.batchItemNumber} 件已${result === "REJECTED" ? "拒绝" : "退回返工"}。`);
  }

  async function prepareStorage() {
    if (!batch) return;
    await run("prepare-storage", async () => {
      await request(`/operations/product-batches/${batch.id}/prepare-storage`, { method: "POST", body: JSON.stringify(ids) });
    }, "本批已完成入仓准备，请逐件扫描商品和货位。");
  }

  async function confirmStorage() {
    if (!batch) return;
    const issue = storageScanIssue(barcode, locationCode, batch.products);
    if (issue) { setError(issue); setNotice(""); return; }
    const normalizedBarcode = normalizeStorageScan(barcode);
    const scanned = batch.products.find((item) => normalizeStorageScan(item.barcode ?? "") === normalizedBarcode);
    await run("confirm-storage", async () => {
      await request(`/operations/product-batches/${batch.id}/confirm-storage`, {
        method: "POST",
        body: JSON.stringify({ ...ids, barcode: normalizedBarcode, locationCode: normalizeStorageScan(locationCode) })
      });
      setBarcode("");
      setLocationCode("");
    }, `第 ${scanned?.batchItemNumber ?? "-"} 件已入仓。`);
  }

  async function publishBatch() {
    if (!batch) return;
    await run("publish", async () => {
      await request(`/operations/product-batches/${batch.id}/publish`, { method: "POST", body: JSON.stringify(ids) });
    }, "本批 10 件已发布并完成。" );
  }

  if (!batch || !product) return <StatusMessage tone={error ? "danger" : "neutral"}>{error || "正在读取审核与入仓工作台..."}</StatusMessage>;

  const approvedCount = batch.products.filter((item) => ["APPROVED", "READY_FOR_STORAGE", "PUBLISHED"].includes(item.status)).length;
  const availableCount = batch.products.filter((item) => item.inventoryItem?.status === "AVAILABLE").length;
  const publishedCount = batch.products.filter((item) => item.status === "PUBLISHED").length;
  const hasException = batch.products.some((item) => ["REWORK_REQUIRED", "ARCHIVED"].includes(item.status));
  const allApproved = approvedCount === batch.targetCount;
  const allPrepared = batch.products.every((item) => item.status === "READY_FOR_STORAGE" || item.status === "PUBLISHED");
  const allAvailable = availableCount === batch.targetCount;
  const imageTabs = buildImageTabs(product, comparison);
  const currentImage = imageTabs.find((tab) => tab.key === activeImage) ?? imageTabs[0];
  const aiOutput = normalizedAiOutput(product.aiExtractions?.[0] ?? null);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href={`/product/batches/${encodeURIComponent(batch.id)}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeftIcon className="size-3" />返回批次</Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">{batch.batchCode} · 审核、入仓与发布</h1>
          <p className="mt-1 text-sm text-muted-foreground">审核 {approvedCount}/10 · 入仓 {availableCount}/10 · 发布 {publishedCount}/10</p>
        </div>
        <Badge variant="outline">{batch.stageLabel}</Badge>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <ProgressMetric label="审核" value={approvedCount} />
        <ProgressMetric label="入仓" value={availableCount} />
        <ProgressMetric label="发布" value={publishedCount} />
      </div>
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      {notice ? <StatusMessage tone="neutral">{notice}</StatusMessage> : null}
      {hasException ? <StatusMessage tone="danger">本批存在退回返工或拒绝商品。修复异常前不能整批入仓和发布。</StatusMessage> : null}

      {!allApproved ? (
        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,.9fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">第 {product.batchItemNumber}/10 件</h2>
                <p className="text-xs text-muted-foreground">{product.productCode} · {product.labelAppliedAt && product.status === "BARCODE_ASSIGNED" ? "待审核" : productStatusLabel(product.status)}</p>
              </div>
              <div className="flex gap-2">
                <Button size="icon" variant="outline" title="上一件" disabled={currentIndex === 0 || Boolean(busy)} onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}><ArrowLeftIcon /></Button>
                <Button size="icon" variant="outline" title="下一件" disabled={currentIndex === batch.products.length - 1 || Boolean(busy)} onClick={() => setCurrentIndex((index) => Math.min(batch.products.length - 1, index + 1))}><ArrowRightIcon /></Button>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {imageTabs.map((tab) => <Button key={tab.key} size="sm" variant={activeImage === tab.key ? "default" : "outline"} className="shrink-0" onClick={() => setActiveImage(tab.key)}>{tab.label}{tab.selected ? " ✓" : ""}</Button>)}
            </div>
            <div className={cn("flex aspect-[4/5] max-h-[70vh] min-h-80 items-center justify-center overflow-hidden rounded-md border bg-muted/20", currentImage?.transparent && "bg-[linear-gradient(45deg,#eee_25%,transparent_25%),linear-gradient(-45deg,#eee_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#eee_75%),linear-gradient(-45deg,transparent_75%,#eee_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0]") }>
              <SafeProductImage src={currentImage?.url ?? ""} alt={`${product.productCode} ${currentImage?.label ?? "图片"}`} />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <section className="rounded-md border p-4">
              <h2 className="font-semibold">最终商品信息</h2>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Fact label="标题" value={product.title} wide />
                <Fact label="分类" value={labelValue(product.category)} />
                <Fact label="子分类" value={labelValue(product.subcategory)} />
                <Fact label="适用人群" value={labelValue(product.gender)} />
                <Fact label="品牌" value={product.brand} />
                <Fact label="颜色" value={labelValue(product.color)} />
                <Fact label="图案" value={labelValue(product.pattern)} />
                <Fact label="袖型" value={labelValue(product.sleeveType)} />
                <Fact label="标签尺码" value={product.tagSize} />
                <Fact label="平台尺码" value={product.finalSizeLabel} />
                <Fact label="成色" value={labelValue(product.conditionGrade)} />
                <Fact label="价格" value={product.priceKsh ? `KSh ${product.priceKsh}` : ""} />
                <Fact label="Barcode" value={product.barcode} wide mono />
                <Fact label="描述" value={product.description} wide />
              </div>
            </section>

            <section className="rounded-md border p-4">
              <h2 className="font-semibold">AI 建议与实测</h2>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Fact label="AI 标题" value={aiValue(aiOutput, "title")} wide />
                <Fact label="AI 分类" value={labelValue(aiValue(aiOutput, "category"))} />
                <Fact label="AI 人群" value={labelValue(aiValue(aiOutput, "audience"))} />
                <Fact label="AI 颜色" value={labelValue(aiValue(aiOutput, "primaryColor"))} />
                <Fact label="AI 尺码" value={aiValue(aiOutput, "sizeLabel")} />
                {(product.measurements ?? []).map((measurement) => <Fact key={measurement.measurementType} label={measurementLabel(measurement.measurementType)} value={measurement.finalValueCm == null ? "" : `${measurement.finalValueCm} cm`} />)}
              </div>
            </section>

            <section className="rounded-md border p-4">
              <h2 className="font-semibold">瑕疵与审核记录</h2>
              <div className="mt-3 space-y-2 text-sm">
                {(product.defects ?? []).length ? product.defects?.map((defect, index) => <p key={`${defect.defectType}-${index}`}>{defect.description || defect.customerSafeDescription || labelValue(defect.defectType)}</p>) : <p className="text-muted-foreground">未记录瑕疵</p>}
                {product.reviews?.[0] ? <p className="text-xs text-muted-foreground">最近审核：{labelValue(product.reviews[0].result)}{product.reviews[0].reason ? ` · ${product.reviews[0].reason}` : ""}</p> : null}
              </div>
            </section>

            {isReviewable(product.status) ? (
              <section className="rounded-md border p-4">
                <label className="text-sm font-medium">退回或拒绝原因</label>
                <Textarea className="mt-2" rows={2} placeholder="审核通过无需填写；退回或拒绝必须填写。" value={reason} onChange={(event) => setReason(event.target.value)} />
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Button variant="outline" disabled={Boolean(busy)} onClick={() => void review("REWORK_REQUIRED")}>退回返工</Button>
                  <Button variant="outline" disabled={Boolean(busy)} onClick={() => void review("REJECTED")}><XCircleIcon data-icon="inline-start" />拒绝</Button>
                  <Button disabled={Boolean(busy)} onClick={() => void review("APPROVED")}>{busy === "review-APPROVED" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <CheckCircle2Icon data-icon="inline-start" />}通过并下一件</Button>
                </div>
              </section>
            ) : <StatusMessage tone="neutral">该商品已完成当前审核动作。可用上一件/下一件继续检查批次。</StatusMessage>}
          </div>
        </section>
      ) : null}

      {allApproved && !allPrepared ? (
        <section className="rounded-md border p-4">
          <h2 className="font-semibold">审核完成</h2>
          <p className="mt-1 text-sm text-muted-foreground">10 件均已通过审核。下一步将状态统一转为待入仓，不会自动分配货位。</p>
          <Button className="mt-4" disabled={Boolean(busy)} onClick={() => void prepareStorage()}><PackageCheckIcon data-icon="inline-start" />准备扫码入仓</Button>
        </section>
      ) : null}

      {allPrepared && !allAvailable ? (
        <section className="rounded-md border p-4">
          <h2 className="font-semibold">扫描入仓</h2>
          <p className="mt-1 text-sm text-muted-foreground">先扫描衣服 Barcode，再扫描实际货位码。系统不会随机分配货位。</p>
          <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); void confirmStorage(); }}>
            <Input autoFocus autoComplete="off" className="font-mono" placeholder="商品 Barcode" value={barcode} onChange={(event) => setBarcode(event.target.value)} />
            <Input autoComplete="off" className="font-mono" placeholder="货位码，例如 A-010101" value={locationCode} onChange={(event) => setLocationCode(event.target.value)} />
            <Button type="submit" disabled={Boolean(busy)}>{busy === "confirm-storage" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <ScanLineIcon data-icon="inline-start" />}确认入仓</Button>
          </form>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {batch.products.map((item) => <div key={item.id} className={cn("rounded-md border px-3 py-2 text-xs", item.inventoryItem?.status === "AVAILABLE" && "border-emerald-500 bg-emerald-50/50")}><div className="font-medium">第 {item.batchItemNumber}/10 件</div><div className="mt-1 font-mono text-muted-foreground">{item.barcode}</div><div className="mt-1">{item.inventoryItem?.status === "AVAILABLE" ? `已入 ${item.inventoryItem.location?.locationCode ?? "货位"}` : "待扫描"}</div></div>)}
          </div>
        </section>
      ) : null}

      {allAvailable && publishedCount < batch.targetCount ? (
        <section className="rounded-md border p-4">
          <h2 className="font-semibold">库存确认完成</h2>
          <p className="mt-1 text-sm text-muted-foreground">10 件均已绑定实际货位并进入可用库存。发布前系统会再次校验图片、标题、分类、尺码、尺寸、成色和价格。</p>
          <Button className="mt-4" disabled={Boolean(busy)} onClick={() => void publishBatch()}>{busy === "publish" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}发布本批 10 件</Button>
        </section>
      ) : null}

      {publishedCount === batch.targetCount ? <StatusMessage tone="neutral"><span className="flex items-center gap-2"><CheckCircle2Icon className="size-4 text-emerald-600" />本批已全部入仓并发布。<Link className="underline" href="/product/completed">查看已完成批次</Link></span></StatusMessage> : null}
    </div>
  );
}

function SafeProductImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground"><ImageOffIcon className="size-6" />图片缺失</div>;
  return <img src={src} alt={alt} className="size-full object-contain" onError={() => setFailed(true)} />;
}

function Fact({ label, value, wide = false, mono = false }: { label: string; value: unknown; wide?: boolean; mono?: boolean }) {
  const display = value == null || value === "" ? "-" : String(value);
  return <div className={wide ? "col-span-2" : ""}><div className="text-xs text-muted-foreground">{label}</div><div className={cn("mt-0.5 break-words", mono && "font-mono text-xs")}>{display}</div></div>;
}

function ProgressMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border p-3 text-center"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold tabular-nums">{value}/10</div></div>;
}

function StatusMessage({ tone, children }: { tone: "danger" | "neutral"; children: ReactNode }) {
  return <div className={cn("rounded-md border px-4 py-3 text-sm", tone === "danger" ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted/40 text-muted-foreground")}>{children}</div>;
}

function isReviewable(status: string) { return status === "BARCODE_ASSIGNED" || status === "REVIEW_PENDING"; }

function buildImageTabs(product: ProductRecord, comparison: ProductImageComparisonResponse | null): ImageTab[] {
  const tabs = [
    variantTab("original", "原图", comparison?.original ?? null),
    variantTab("transparent", "透明抠图", comparison?.cutoutTransparent ?? null, true),
    variantTab("white", "白底图", comparison?.cutoutWhite ?? null),
    variantTab("optimized", "优化主图", comparison?.optimizedMain ?? null)
  ].filter((tab) => tab.url);
  for (const [type, label] of [["BACK", "背面"], ["LABEL", "标签"], ["DEFECT", "瑕疵"], ["DETAIL", "细节"]] as const) {
    const image = product.images?.find((candidate) => candidate.type === type);
    if (image?.publicUrl) tabs.push({ key: type.toLowerCase(), label, url: `${API_PROXY_URL}${image.publicUrl}` });
  }
  return tabs.length ? tabs : [{ key: "missing", label: "图片", url: "" }];
}

function variantTab(key: string, label: string, asset: ProductImageVariantRecord | null, transparent = false): ImageTab {
  return { key, label, url: asset?.publicUrl ? `${API_PROXY_URL}${asset.publicUrl}` : "", transparent, selected: Boolean(asset?.selectedAsMain) };
}

function aiValue(output: JsonRecord | null, key: string) {
  const field = output?.[key];
  if (field && typeof field === "object" && !Array.isArray(field)) return stringValue((field as JsonRecord).value);
  return stringValue(field);
}

function labelValue(value: unknown) {
  const text = stringValue(value);
  return text ? text.replaceAll("_", " ") : "";
}

function measurementLabel(value?: string) {
  return ({ LENGTH: "衣长", CHEST_WIDTH: "胸宽", SHOULDER_WIDTH: "肩宽", SLEEVE_LENGTH: "袖长", WAIST: "腰宽", HIP: "臀宽", INSEAM: "内长", OUTSEAM: "裤长", LEG_OPENING: "裤脚宽" } as Record<string, string>)[value ?? ""] ?? labelValue(value);
}

function translateApiError(value: string) {
  const translations: Array<[RegExp, string]> = [
    [/belongs to another batch/i, "该 Barcode 属于其他批次。"],
    [/does not match this batch/i, "该 Barcode 不属于当前批次。"],
    [/already confirmed in storage/i, "该商品已经完成入仓，请勿重复扫描。"],
    [/location is not active or does not exist/i, "货位码不存在或未启用。"],
    [/Approve the product/i, "商品必须先通过审核。"],
    [/must be approved/i, "本批 10 件必须全部审核通过。"],
    [/must be scanned into storage/i, "本批 10 件必须全部扫码入仓。"]
  ];
  return translations.find(([pattern]) => pattern.test(value))?.[1] ?? value;
}

function errorMessage(value: unknown, fallback: string) { return value instanceof Error ? value.message : fallback; }
