"use client";

import { operationsFetch } from "@/lib/operations-api";

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
  SendIcon,
  XCircleIcon
} from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { normalizedAiOutput, stringValue, type JsonRecord } from "../operations-workspace-flow";
import { productStatusLabel } from "./product-factory-display";
import { batchStorageCompletionIssue, needsBatchStoragePreparation } from "./product-factory-storage-flow";
import { t } from "@/i18n/runtime";

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
  material?: string | null;
  tags?: string[];
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
  labelPrintedAt?: string | null;
};
type ProductBatch = { id: string; batchCode: string; targetCount: number; stage: string; stageLabel: string; products: ProductRecord[] };
type ImageTab = { key: string; label: string; url: string; transparent?: boolean; selected?: boolean };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await operationsFetch(`${API_PROXY_URL}${path}`, {
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
  const [batchComparisons, setBatchComparisons] = useState<Record<string, ProductImageComparisonResponse>>({});
  const [activeImage, setActiveImage] = useState("white");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    const query = new URLSearchParams({ adminUserId: ids.adminUserId });
    let next = await request<ProductBatch>(`/operations/product-batches/${encodeURIComponent(batchId)}?${query.toString()}`);
    next.products = [...next.products].sort((left, right) => Number(left.batchItemNumber ?? 0) - Number(right.batchItemNumber ?? 0));
    if (needsBatchStoragePreparation(next.products, next.targetCount)) {
      await request(`/operations/product-batches/${next.id}/prepare-storage`, {
        method: "POST",
        body: JSON.stringify(ids)
      });
      next = await request<ProductBatch>(`/operations/product-batches/${encodeURIComponent(batchId)}?${query.toString()}`);
      next.products = [...next.products].sort((left, right) => Number(left.batchItemNumber ?? 0) - Number(right.batchItemNumber ?? 0));
    }
    setBatch(next);
    const comparisonEntries = await Promise.all(next.products.map(async (item) => {
      try {
        const itemComparison = await request<ProductImageComparisonResponse>(`/products/${item.id}/image-comparison`, {
          headers: { "X-Admin-User-Id": ids.adminUserId }
        });
        return [item.id, itemComparison] as const;
      } catch {
        return null;
      }
    }));
    setBatchComparisons(Object.fromEntries(comparisonEntries.filter((entry): entry is readonly [string, ProductImageComparisonResponse] => Boolean(entry))));
    const firstReviewable = next.products.findIndex((product) => isReviewable(product.status));
    if (firstReviewable >= 0) setCurrentIndex((current) => isReviewable(next.products[current]?.status ?? "") ? current : firstReviewable);
  }, [batchId, ids.adminUserId]);

  useEffect(() => { void load().catch((caught) => setError(errorMessage(caught, t("无法读取审核批次。")))); }, [load]);

  const product = batch?.products[currentIndex] ?? null;
  useEffect(() => {
    setActiveImage("white");
    setComparison(null);
    if (!product || !ids.adminUserId) return;
    void request<ProductImageComparisonResponse>(`/products/${product.id}/image-comparison`, {
      headers: { "X-Admin-User-Id": ids.adminUserId }
    }).then(setComparison).catch((caught) => setError(errorMessage(caught, t("无法读取图片版本。"))));
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
      setError(errorMessage(caught, t("操作失败。")));
    } finally {
      setBusy("");
    }
  }

  async function review(result: "APPROVED" | "REWORK_REQUIRED" | "REJECTED") {
    if (!product) return;
    if (result !== "APPROVED" && !reason.trim()) {
      setError(t("退回或拒绝时必须填写原因。"));
      return;
    }
    await run(`review-${result}`, async () => {
      if (result === "APPROVED" && comparison?.aiDisplayMain?.selectedAsMain) {
        await request(`/products/${product.id}/main-image`, {
          method: "POST",
          headers: { "X-Admin-User-Id": ids.adminUserId },
          body: JSON.stringify({ imageId: comparison.aiDisplayMain.imageId, humanConfirmed: true })
        });
      }
      await request(`/operations/product-batches/products/${product.id}/review`, {
        method: "POST",
        body: JSON.stringify({ ...ids, result, reason: reason.trim() || undefined })
      });
      setReason("");
      setCurrentIndex((index) => Math.min(index + 1, (batch?.products.length ?? 1) - 1));
    }, result === "APPROVED" ? t("第 {batchItemNumber} 件审核通过。", { batchItemNumber: product.batchItemNumber }) : t("第 {batchItemNumber} 件已{v1}。", { batchItemNumber: product.batchItemNumber, v1: result === "REJECTED" ? t("拒绝") : t("退回返工") }));
  }

  async function completeStorage() {
    if (!batch) return;
    const issue = batchStorageCompletionIssue(batch.products, batch.targetCount);
    if (issue) { setError(issue); setNotice(""); return; }
    await run("stock-in", async () => {
      await request(`/operations/product-batches/${batch.id}/stock-in`, {
        method: "POST",
        body: JSON.stringify(ids)
      });
    }, t("本批 {targetCount} 件已全部完成入库。", { targetCount: batch.targetCount }));
  }

  async function publishBatch() {
    if (!batch) return;
    await run("publish", async () => {
      await request(`/operations/product-batches/${batch.id}/publish`, { method: "POST", body: JSON.stringify(ids) });
    }, t("本批 {targetCount} 件已发布并完成。", { targetCount: batch.targetCount }) );
  }

  async function confirmAndApproveBatch() {
    if (!batch) return;
    const reviewable = batch.products.filter((item) => isReviewable(item.status));
    if (!reviewable.length) return;
    if (!window.confirm(t("已逐件对照原图与 AI 陈列主图，并确认本批 {length} 件商品信息无异常？", { length: reviewable.length }))) return;

    await run("approve-batch", async () => {
      const generatedMainImages = reviewable.flatMap((item) => {
        const itemComparison = batchComparisons[item.id];
        const imageId = itemComparison?.aiDisplayMain?.selectedAsMain
          ? itemComparison.aiDisplayMain.imageId
          : "";
        return imageId ? [{ productId: item.id, imageId }] : [];
      });
      await Promise.all(generatedMainImages.map(({ productId, imageId }) => request(`/products/${productId}/main-image`, {
        method: "POST",
        headers: { "X-Admin-User-Id": ids.adminUserId },
        body: JSON.stringify({ imageId, humanConfirmed: true })
      })));
      await request(`/operations/product-batches/${batch.id}/detail-generation/approve`, {
        method: "POST",
        headers: { "X-Admin-User-Id": ids.adminUserId },
        body: JSON.stringify({ employeeId: ids.employeeId })
      }).catch(() => null);
      await Promise.all(reviewable.map((item) => request(`/operations/product-batches/products/${item.id}/review`, {
        method: "POST",
        body: JSON.stringify({ ...ids, result: "APPROVED" })
      })));
    }, t("本批 {length} 件 AI 主图与商品信息已人工确认。", { length: reviewable.length }));
  }

  async function completeStorageAndPublish() {
    if (!batch) return;
    const issue = batchStorageCompletionIssue(batch.products, batch.targetCount);
    if (issue) { setError(issue); setNotice(""); return; }
    if (!window.confirm(t("已按货架号放置本批 {targetCount} 件商品，确认入库并发布？", { targetCount: batch.targetCount }))) return;
    await run("stock-and-publish", async () => {
      await request(`/operations/product-batches/${batch.id}/stock-in`, {
        method: "POST",
        body: JSON.stringify(ids)
      });
      await request(`/operations/product-batches/${batch.id}/publish`, {
        method: "POST",
        body: JSON.stringify(ids)
      });
    }, t("本批 {targetCount} 件已入库并发布。", { targetCount: batch.targetCount }));
  }

  if (!batch || !product) return <StatusMessage tone={error ? "danger" : "neutral"}>{error || t("正在读取审核与入仓工作台...")}</StatusMessage>;

  const approvedCount = batch.products.filter((item) => ["APPROVED", "READY_FOR_STORAGE", "PUBLISHED"].includes(item.status)).length;
  const availableCount = batch.products.filter((item) => item.inventoryItem?.status === "AVAILABLE").length;
  const publishedCount = batch.products.filter((item) => item.status === "PUBLISHED").length;
  const hasException = batch.products.some((item) => ["REWORK_REQUIRED", "ARCHIVED"].includes(item.status));
  const allApproved = approvedCount === batch.targetCount;
  const allPrepared = batch.products.every((item) => item.status === "READY_FOR_STORAGE" || item.status === "PUBLISHED");
  const allAssigned = batch.products.every((item) => Boolean(item.inventoryItem?.locationId));
  const allAvailable = availableCount === batch.targetCount;
  const imageTabs = buildImageTabs(product, comparison);
  const currentImage = imageTabs.find((tab) => tab.key === activeImage) ?? imageTabs[0];
  const aiOutput = normalizedAiOutput(product.aiExtractions?.[0] ?? null);
  const reviewableCount = batch.products.filter((item) => isReviewable(item.status)).length;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href={`/product/batches/${encodeURIComponent(batch.id)}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeftIcon className="size-3" />{t("返回批次")}</Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">{batch.batchCode}  {t("· 第 3 步：异常确认并发布")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("审核")} {approvedCount}/{batch.targetCount}  {t("· 入仓")} {availableCount}/{batch.targetCount}  {t("· 发布")} {publishedCount}/{batch.targetCount}</p>
        </div>
        <Badge variant="outline">{batch.stageLabel}</Badge>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <ProgressMetric label={t("审核")} value={approvedCount} total={batch.targetCount} />
        <ProgressMetric label={t("入仓")} value={availableCount} total={batch.targetCount} />
        <ProgressMetric label={t("发布")} value={publishedCount} total={batch.targetCount} />
      </div>
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      {notice ? <StatusMessage tone="neutral">{notice}</StatusMessage> : null}
      {hasException ? <StatusMessage tone="danger">{t("本批存在退回返工或拒绝商品。修复异常前不能整批入仓和发布。")}</StatusMessage> : null}

      {reviewableCount > 0 ? (
        <section className="rounded-md border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold">{t("候选主图整批确认")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("左侧原图、右侧 AI 陈列主图。逐件核对 Logo、图案、结构、磨损和瑕疵；有异常时使用下方单件审核。")}</p>
            </div>
            <Button disabled={Boolean(busy)} onClick={() => void confirmAndApproveBatch()}>
              {busy === "approve-batch" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <CheckCircle2Icon data-icon="inline-start" />}
              
              {t("确认本批无异常")}
            </Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {batch.products.map((item) => {
              const itemComparison = batchComparisons[item.id];
              return (
                <article key={item.id} className="overflow-hidden rounded-md border">
                  <div className="grid grid-cols-2 gap-px bg-border">
                    <div className="aspect-[4/5] bg-white"><SafeProductImage src={comparisonImageUrl(itemComparison?.original)} alt={t("{productCode} 原图", { productCode: item.productCode })} /></div>
                    <div className="aspect-[4/5] bg-white"><SafeProductImage src={comparisonImageUrl(itemComparison?.aiDisplayMain)} alt={t("{productCode} 白底展示图", { productCode: item.productCode })} /></div>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t px-2 py-2 text-xs">
                    <span>{t("第")} {item.batchItemNumber ?? "-"}  {t("件")}</span>
                    <Badge variant={itemComparison?.aiDisplayMain ? "secondary" : "destructive"}>{itemComparison?.aiDisplayMain ? t("待确认") : t("缺 AI 主图")}</Badge>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {!allApproved ? (
        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,.9fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">{t("第")} {product.batchItemNumber}/{batch.targetCount}  {t("件")}</h2>
                <p className="text-xs text-muted-foreground">{product.productCode} · {product.labelPrintedAt && product.status === "BARCODE_ASSIGNED" ? t("待审核") : productStatusLabel(product.status)}</p>
              </div>
              <div className="flex gap-2">
                <Button size="icon" variant="outline" title={t("上一件")} disabled={currentIndex === 0 || Boolean(busy)} onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}><ArrowLeftIcon /></Button>
                <Button size="icon" variant="outline" title={t("下一件")} disabled={currentIndex === batch.products.length - 1 || Boolean(busy)} onClick={() => setCurrentIndex((index) => Math.min(batch.products.length - 1, index + 1))}><ArrowRightIcon /></Button>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {imageTabs.map((tab) => <Button key={tab.key} size="sm" variant={activeImage === tab.key ? "default" : "outline"} className="shrink-0" onClick={() => setActiveImage(tab.key)}>{tab.label}{tab.selected ? " ✓" : ""}</Button>)}
            </div>
            <div className={cn("flex aspect-[4/5] max-h-[70vh] min-h-80 items-center justify-center overflow-hidden rounded-md border bg-muted/20", currentImage?.transparent && "bg-[linear-gradient(45deg,#eee_25%,transparent_25%),linear-gradient(-45deg,#eee_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#eee_75%),linear-gradient(-45deg,transparent_75%,#eee_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0]") }>
              <SafeProductImage src={currentImage?.url ?? ""} alt={t("{productCode} {v1}", { productCode: product.productCode, v1: currentImage?.label ?? t("图片") })} />
            </div>
            {currentImage?.key === "ai-display" ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">{t("白底展示图是生成式候选图。审核时必须与原图核对 Logo、口袋、纽扣、拉链、抽绳、纹理、磨损和瑕疵。")}</div>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <section className="rounded-md border p-4">
              <h2 className="font-semibold">{t("最终商品信息")}</h2>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Fact label={t("标题")} value={product.title} wide />
                <Fact label={t("分类")} value={labelValue(product.category)} />
                <Fact label={t("子分类")} value={labelValue(product.subcategory)} />
                <Fact label={t("适用人群")} value={labelValue(product.gender)} />
                <Fact label={t("品牌")} value={product.brand} />
                <Fact label={t("颜色")} value={labelValue(product.color)} />
                <Fact label={t("图案")} value={labelValue(product.pattern)} />
                <Fact label={t("袖型")} value={labelValue(product.sleeveType)} />
                <Fact label={t("面料")} value={labelValue(product.material)} />
                <Fact label={t("商品标签")} value={(product.tags ?? []).map(labelValue).join("、")} wide />
                <Fact label={t("标签尺码")} value={product.tagSize} />
                <Fact label={t("平台尺码")} value={product.finalSizeLabel} />
                <Fact label={t("成色")} value={labelValue(product.conditionGrade)} />
                <Fact label={t("价格")} value={product.priceKsh ? `KSh ${product.priceKsh}` : ""} />
                <Fact label="Barcode" value={product.barcode} wide mono />
                <Fact label={t("描述")} value={product.description} wide />
              </div>
            </section>

            <section className="rounded-md border p-4">
              <h2 className="font-semibold">{t("AI 建议与实测")}</h2>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Fact label={t("AI 标题")} value={aiValue(aiOutput, "title")} wide />
                <Fact label={t("AI 分类")} value={labelValue(aiValue(aiOutput, "category"))} />
                <Fact label={t("AI 人群")} value={labelValue(aiValue(aiOutput, "audience"))} />
                <Fact label={t("AI 颜色")} value={labelValue(aiValue(aiOutput, "primaryColor"))} />
                <Fact label={t("AI 面料")} value={labelValue(aiValue(aiOutput, "material"))} />
                <Fact label={t("AI 标签")} value={aiArrayValue(aiOutput, "tags").map(labelValue).join("、")} wide />
                <Fact label={t("AI 尺码")} value={aiValue(aiOutput, "sizeLabel")} />
                {(product.measurements ?? []).map((measurement) => <Fact key={measurement.measurementType} label={measurementLabel(measurement.measurementType)} value={measurement.finalValueCm == null ? "" : `${measurement.finalValueCm} cm`} />)}
              </div>
            </section>

            <section className="rounded-md border p-4">
              <h2 className="font-semibold">{t("瑕疵与审核记录")}</h2>
              <div className="mt-3 space-y-2 text-sm">
                {(product.defects ?? []).length ? product.defects?.map((defect, index) => <p key={`${defect.defectType}-${index}`}>{defect.description || defect.customerSafeDescription || labelValue(defect.defectType)}</p>) : <p className="text-muted-foreground">{t("未记录瑕疵")}</p>}
                {product.reviews?.[0] ? <p className="text-xs text-muted-foreground">{t("最近审核：")}{labelValue(product.reviews[0].result)}{product.reviews[0].reason ? ` · ${product.reviews[0].reason}` : ""}</p> : null}
              </div>
            </section>

            {isReviewable(product.status) ? (
              <section className="rounded-md border p-4">
                <label className="text-sm font-medium">{t("退回或拒绝原因")}</label>
                <Textarea className="mt-2" rows={2} placeholder={t("审核通过无需填写；退回或拒绝必须填写。")} value={reason} onChange={(event) => setReason(event.target.value)} />
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Button variant="outline" disabled={Boolean(busy)} onClick={() => void review("REWORK_REQUIRED")}>{t("退回返工")}</Button>
                  <Button variant="outline" disabled={Boolean(busy)} onClick={() => void review("REJECTED")}><XCircleIcon data-icon="inline-start" />{t("拒绝")}</Button>
                  <Button disabled={Boolean(busy)} onClick={() => void review("APPROVED")}>{busy === "review-APPROVED" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <CheckCircle2Icon data-icon="inline-start" />}{t("通过并下一件")}</Button>
                </div>
              </section>
            ) : <StatusMessage tone="neutral">{t("该商品已完成当前审核动作。可用上一件/下一件继续检查批次。")}</StatusMessage>}
          </div>
        </section>
      ) : null}

      {allApproved && !allPrepared ? (
        <section className="rounded-md border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircleIcon className="size-4 animate-spin" />{t("正在为本批商品分配货架号...")}</div>
        </section>
      ) : null}

      {allPrepared && !allAvailable ? (
        <section className="rounded-md border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">{t("按货架号归位")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("将每件商品放到对应货架，放完后统一确认。")}</p>
            </div>
            <Button disabled={Boolean(busy) || !allAssigned} onClick={() => void completeStorageAndPublish()}>
              {busy === "stock-and-publish" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <PackageCheckIcon data-icon="inline-start" />}
              
              {t("确认入库并发布")}
            </Button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {batch.products.map((item) => (
              <div key={item.id} className={cn("rounded-md border px-3 py-3", item.inventoryItem?.status === "AVAILABLE" && "border-emerald-500 bg-emerald-50/50")}>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{t("第")} {item.batchItemNumber}/{batch.targetCount}  {t("件")}</span>
                  {item.inventoryItem?.status === "AVAILABLE" ? <span className="text-emerald-700">{t("已完成")}</span> : null}
                </div>
                <div className="mt-2 text-xl font-semibold tabular-nums">{item.inventoryItem?.location?.locationCode ?? t("待分配")}</div>
                <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{item.barcode}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {allAvailable && publishedCount < batch.targetCount ? (
        <section className="rounded-md border p-4">
          <h2 className="font-semibold">{t("库存确认完成")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("本批")} {batch.targetCount}  {t("件均已绑定实际货位并进入可用库存。发布前系统会再次校验图片、标题、分类、尺码、尺寸、成色和价格。")}</p>
          <Button className="mt-4" disabled={Boolean(busy)} onClick={() => void publishBatch()}>{busy === "publish" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}{t("发布本批")} {batch.targetCount}  {t("件")}</Button>
        </section>
      ) : null}

      {publishedCount === batch.targetCount ? <StatusMessage tone="neutral"><span className="flex items-center gap-2"><CheckCircle2Icon className="size-4 text-emerald-600" />{t("本批已全部入仓并发布。")}<Link className="underline" href="/product/completed">{t("查看已完成批次")}</Link></span></StatusMessage> : null}
    </div>
  );
}

function SafeProductImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground"><ImageOffIcon className="size-6" />{t("图片缺失")}</div>;
  return <img src={src} alt={alt} className="size-full object-contain" onError={() => setFailed(true)} />;
}

function Fact({ label, value, wide = false, mono = false }: { label: string; value: unknown; wide?: boolean; mono?: boolean }) {
  const display = value == null || value === "" ? "-" : String(value);
  return <div className={wide ? "col-span-2" : ""}><div className="text-xs text-muted-foreground">{label}</div><div className={cn("mt-0.5 break-words", mono && "font-mono text-xs")}>{display}</div></div>;
}

function ProgressMetric({ label, value, total }: { label: string; value: number; total: number }) {
  return <div className="rounded-md border p-3 text-center"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold tabular-nums">{value}/{total}</div></div>;
}

function StatusMessage({ tone, children }: { tone: "danger" | "neutral"; children: ReactNode }) {
  return <div className={cn("rounded-md border px-4 py-3 text-sm", tone === "danger" ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted/40 text-muted-foreground")}>{children}</div>;
}

function isReviewable(status: string) { return status === "BARCODE_ASSIGNED" || status === "REVIEW_PENDING"; }

function buildImageTabs(product: ProductRecord, comparison: ProductImageComparisonResponse | null): ImageTab[] {
  const tabs = [
    variantTab("white", t("正面原图"), comparison?.original ?? null),
    variantTab("back-white", t("背面原图"), comparison?.backOriginal ?? null),
    variantTab("ai-display", t("白底展示图"), comparison?.aiDisplayMain ?? null)
  ].filter((tab) => tab.url);
  for (const [type, label] of [["LABEL", t("标签")], ["DEFECT", t("瑕疵")], ["DETAIL", t("细节")]] as const) {
    const image = product.images?.find((candidate) => candidate.type === type);
    if (image?.publicUrl) tabs.push({ key: type.toLowerCase(), label, url: `${API_PROXY_URL}${image.publicUrl}` });
  }
  return tabs.length ? tabs : [{ key: "missing", label: t("图片"), url: "" }];
}

function variantTab(key: string, label: string, asset: ProductImageVariantRecord | null): ImageTab {
  return { key, label, url: asset?.publicUrl ? `${API_PROXY_URL}${asset.publicUrl}` : "", selected: Boolean(asset?.selectedAsMain) };
}

function comparisonImageUrl(asset?: ProductImageVariantRecord | null) {
  if (!asset?.publicUrl) return "";
  return asset.publicUrl.startsWith("http") ? asset.publicUrl : `${API_PROXY_URL}${asset.publicUrl}`;
}

function aiValue(output: JsonRecord | null, key: string) {
  const field = output?.[key];
  if (field && typeof field === "object" && !Array.isArray(field)) return stringValue((field as JsonRecord).value);
  return stringValue(field);
}

function aiArrayValue(output: JsonRecord | null, key: string) {
  const field = output?.[key];
  if (!field || typeof field !== "object" || Array.isArray(field)) return [];
  const value = (field as JsonRecord).value;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function labelValue(value: unknown) {
  const text = stringValue(value);
  return text ? text.replaceAll("_", " ") : "";
}

function measurementLabel(value?: string) {
  return ({ LENGTH: t("衣长"), CHEST_WIDTH: t("胸宽"), SHOULDER_WIDTH: t("肩宽"), SLEEVE_LENGTH: t("袖长"), WAIST: t("腰宽"), HIP: t("臀宽"), INSEAM: t("内长"), OUTSEAM: t("裤长"), LEG_OPENING: t("裤脚宽") } as Record<string, string>)[value ?? ""] ?? labelValue(value);
}

function translateApiError(value: string) {
  const translations: Array<[RegExp, string]> = [
    [/belongs to another batch/i, t("该 Barcode 属于其他批次。")],
    [/does not match this batch/i, t("该 Barcode 不属于当前批次。")],
    [/already confirmed in storage/i, t("该商品已经完成入仓，请勿重复扫描。")],
    [/location is not active or does not exist/i, t("货位码不存在或未启用。")],
    [/Approve the product/i, t("商品必须先通过审核。")],
    [/must be approved/i, t("本批商品必须全部审核通过。")],
    [/must have assigned shelf locations/i, t("本批仍有商品未分配货架号。")],
    [/must complete storage/i, t("本批商品必须全部完成入库。")]
  ];
  return translations.find(([pattern]) => pattern.test(value))?.[1] ?? value;
}

function errorMessage(value: unknown, fallback: string) { return value instanceof Error ? value.message : fallback; }
