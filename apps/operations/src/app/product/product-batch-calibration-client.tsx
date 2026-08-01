"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AI_AUDIENCES,
  AI_COLORS,
  AI_KIDS_AGE_RANGES,
  AI_PATTERNS,
  AI_SLEEVE_TYPES,
  PRODUCT_CATEGORY_OPTIONS,
  PRODUCT_FABRIC_WEIGHTS,
  PRODUCT_FIT_TYPES,
  PRODUCT_STRETCH_LEVELS,
  PRODUCT_SUBCATEGORIES_BY_CATEGORY,
  type BackgroundRemovalMode,
  type ImageProcessingJobRecord,
  type ImageProcessingOperation,
  type ProductImageComparisonResponse,
  type ProductImageVariantRecord
} from "@online-saler/shared-types";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  DownloadIcon,
  ExpandIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SaveIcon,
  WandSparklesIcon
} from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  buildCalibrationBody,
  calibrationValidationReasons,
  formFromProductAndAi,
  measurementFields,
  measurementRequirements,
  normalizedAiOutput,
  stringValue,
  type JsonRecord,
  type WorkspaceForm
} from "../operations-workspace-flow";
import { imageIssueLabel, productStatusLabel } from "./product-factory-display";

const API_PROXY_URL = "/api-proxy";
const CALIBRATION_COMPLETE_STATUSES = new Set([
  "CALIBRATED",
  "BARCODE_ASSIGNED",
  "REVIEW_PENDING",
  "APPROVED",
  "READY_FOR_STORAGE",
  "PUBLISHED",
  "UNPUBLISHED",
  "ARCHIVED"
]);
const FACT_LABELS: Record<string, string> = {
  SLIM: "修身",
  REGULAR: "常规",
  RELAXED: "宽松",
  OVERSIZED: "超宽松",
  NONE: "无弹",
  LOW: "微弹",
  MEDIUM: "中等弹性",
  HIGH: "高弹",
  LIGHT: "轻薄",
  HEAVY: "厚实",
  UNKNOWN: "未知"
};

type ProductImage = {
  id: string;
  type: string;
  publicUrl?: string | null;
  createdAt?: string;
};

type ProductRecord = JsonRecord & {
  id: string;
  productCode: string;
  batchItemNumber?: number | null;
  status: string;
  images?: ProductImage[];
  measurements?: Array<{ measurementType?: string; finalValueCm?: unknown }>;
  defects?: Array<{ description?: string }>;
  aiExtractions?: JsonRecord[];
};

type ProductBatch = {
  id: string;
  batchCode: string;
  targetCount: number;
  stage: string;
  stageLabel: string;
  products: ProductRecord[];
};

type ImageTab = {
  key: string;
  label: string;
  url: string;
  imageId: string;
  selectable: boolean;
  selected: boolean;
  transparent?: boolean;
};

type TaxonomyOption = { code: string; displayName: string; parentCode?: string | null; active: boolean };
type ProductTaxonomy = { groups: Record<"CATEGORY" | "SUBCATEGORY" | "COLOR" | "SIZE" | "CONDITION" | "DEFECT", TaxonomyOption[]> };

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
    throw new Error(message);
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
  const batch = await request<ProductBatch>(
    `/operations/product-batches/${encodeURIComponent(batchId)}?${query.toString()}`
  );
  return {
    ...batch,
    products: [...batch.products].sort((left, right) =>
      Number(left.batchItemNumber ?? 0) - Number(right.batchItemNumber ?? 0)
    )
  };
}

async function loadComparison(productId: string, adminUserId: string) {
  return request<ProductImageComparisonResponse>(`/products/${productId}/image-comparison`, {
    headers: { "X-Admin-User-Id": adminUserId }
  });
}

async function runImageOperation(
  productId: string,
  sourceImageId: string,
  operation: ImageProcessingOperation,
  adminUserId: string,
  backgroundRemovalMode?: BackgroundRemovalMode
) {
  const job = await request<ImageProcessingJobRecord>(
    `/products/${productId}/images/${sourceImageId}/processing-jobs`,
    {
      method: "POST",
      headers: { "X-Admin-User-Id": adminUserId },
      body: JSON.stringify({ operation })
    }
  );
  const completed = await request<ImageProcessingJobRecord>(`/image-processing-jobs/${job.id}/run`, {
    method: "POST",
    headers: { "X-Admin-User-Id": adminUserId },
    body: JSON.stringify(backgroundRemovalMode ? { backgroundRemovalMode } : {})
  });
  if (completed.status !== "SUCCEEDED" || !completed.outputImageId) {
    throw new Error(completed.errorMessage || `${operation} 处理失败`);
  }
  return completed;
}

async function selectMainImage(productId: string, imageId: string, adminUserId: string) {
  return request<ProductImageComparisonResponse>(`/products/${productId}/main-image`, {
    method: "POST",
    headers: { "X-Admin-User-Id": adminUserId },
    body: JSON.stringify({ imageId })
  });
}

export function ProductBatchCalibrationPage({ batchId }: { batchId: string }) {
  const ids = useOperationIds();
  const router = useRouter();
  const imagePanelRef = useRef<HTMLDivElement>(null);
  const [batch, setBatch] = useState<ProductBatch | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [form, setForm] = useState<WorkspaceForm>(() => formFromProductAndAi(null, null));
  const [comparison, setComparison] = useState<ProductImageComparisonResponse | null>(null);
  const [taxonomy, setTaxonomy] = useState<ProductTaxonomy | null>(null);
  const [activeImage, setActiveImage] = useState("optimized");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    const loaded = await loadBatch(batchId, ids.adminUserId);
    setBatch(loaded);
    setCurrentIndex((index) => {
      if (!loaded.products.length) return 0;
      if (index > 0 && index < loaded.products.length) return index;
      const pending = loaded.products.findIndex(isCalibratable);
      return pending === -1 ? 0 : pending;
    });
  }, [batchId, ids.adminUserId]);

  useEffect(() => {
    void load().catch((caught) => setError(errorMessage(caught, "无法读取批次。")));
  }, [load]);

  useEffect(() => {
    if (!ids.adminUserId) return;
    const query = new URLSearchParams({ adminUserId: ids.adminUserId });
    void request<ProductTaxonomy>(`/operations/product-factory-admin/taxonomy?${query.toString()}`)
      .then(setTaxonomy)
      .catch(() => setTaxonomy(null));
  }, [ids.adminUserId]);

  const product = batch?.products[currentIndex] ?? null;
  const latestExtraction = product?.aiExtractions?.[0] ?? null;
  const aiOutput = normalizedAiOutput(latestExtraction);
  const draftKey = product ? `operations.product.calibration.draft.${product.id}` : "";

  useEffect(() => {
    if (!product || !ids.adminUserId) return;
    setComparison(null);
    setError("");
    setNotice("");
    const saved = localStorage.getItem(`operations.product.calibration.draft.${product.id}`);
    if (saved) {
      try {
        setForm({ ...formForProduct(product, latestExtraction), ...(JSON.parse(saved) as Partial<WorkspaceForm>) });
      } catch {
        localStorage.removeItem(`operations.product.calibration.draft.${product.id}`);
        setForm(formForProduct(product, latestExtraction));
      }
    } else {
      setForm(formForProduct(product, latestExtraction));
    }
    void loadComparison(product.id, ids.adminUserId)
      .then((value) => {
        setComparison(value);
        setActiveImage(value.optimizedMain ? "optimized" : "original");
      })
      .catch((caught) => setError(errorMessage(caught, "无法读取图片版本。")));
  }, [ids.adminUserId, latestExtraction, product]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "enter") {
        event.preventDefault();
        void saveAndNext();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const imageTabs = useMemo(() => buildImageTabs(product, comparison), [comparison, product]);
  const currentImage = imageTabs.find((item) => item.key === activeImage) ?? imageTabs[0] ?? null;
  const reasons = calibrationValidationReasons(form, {
    hasPhoto: Boolean(product?.images?.length),
    hasAi: Boolean(latestExtraction && (latestExtraction.status === "SUCCEEDED" || aiOutput))
  });
  const completedCount = batch?.products.filter((item) => isCalibrationComplete(item.status)).length ?? 0;
  const readOnly = Boolean(product && isCalibrationComplete(product.status));
  const taxonomyLabels = useMemo(() => taxonomyLabelMap(taxonomy), [taxonomy]);
  const categoryOptions = activeValues(taxonomy, "CATEGORY", PRODUCT_CATEGORY_OPTIONS, form.category);
  const visibleMeasurementFields = measurementFields(form);
  const requiredMeasurementKeys = new Set(measurementRequirements(form).map((item) => item.key));
  const colorOptions = activeValues(taxonomy, "COLOR", AI_COLORS, form.color);
  const sizeOptions = activeValues(taxonomy, "SIZE", ["XS", "S", "M", "L", "XL", "XXL"], form.sizeLabel);
  const conditionOptions = activeValues(taxonomy, "CONDITION", ["LIKE_NEW", "EXCELLENT", "GOOD", "FAIR"], form.conditionGrade);
  const subcategoryOptions = taxonomy
    ? activeSubcategories(taxonomy, form.category, form.subcategory)
    : subcategoriesFor(form.category, form.subcategory);

  function updateForm(key: keyof WorkspaceForm, value: string) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "category") {
        const options = taxonomy ? activeSubcategories(taxonomy, value) : subcategoriesFor(value);
        next.subcategory = options.includes(next.subcategory) ? next.subcategory : options[0] ?? "OTHER";
      }
      if (key === "audience" && value !== "KIDS") next.kidsAgeRange = "NOT_APPLICABLE";
      return next;
    });
    setNotice("");
  }

  function saveDraft() {
    if (!draftKey) return;
    localStorage.setItem(draftKey, JSON.stringify(form));
    setNotice("草稿已保存在本机，可稍后继续。");
  }

  async function saveAndNext() {
    if (!product || readOnly) return;
    if (reasons.length) {
      setError(reasons.join(" "));
      return;
    }
    if (!comparison?.selectedMainImageId) {
      setError("请选择原图、白底图或优化主图作为商城主图。");
      return;
    }
    const extractionId = stringValue(latestExtraction?.extractionId) || stringValue(latestExtraction?.id);
    setBusy("save");
    setError("");
    setNotice("");
    try {
      await request(`/products/${product.id}/calibrate`, {
        method: "POST",
        body: JSON.stringify({
          ...buildCalibrationBody({ employeeId: ids.employeeId, extractionId, form }),
          adminUserId: ids.adminUserId
        })
      });
      if (draftKey) localStorage.removeItem(draftKey);
      const updated = await loadBatch(batchId, ids.adminUserId);
      setBatch(updated);
      const next = updated.products.findIndex((item, index) => index > currentIndex && isCalibratable(item));
      const firstPending = updated.products.findIndex(isCalibratable);
      if (next >= 0) setCurrentIndex(next);
      else if (firstPending >= 0) setCurrentIndex(firstPending);
      else setCurrentIndex(Math.min(currentIndex, updated.products.length - 1));
      setNotice(firstPending >= 0 || next >= 0 ? "已保存，进入下一件。" : `本批 ${updated.targetCount} 件已全部校准。`);
    } catch (caught) {
      setError(errorMessage(caught, "无法保存校准。"));
    } finally {
      setBusy("");
    }
  }

  async function processImages(mode: BackgroundRemovalMode) {
    if (!product) return;
    const sourceId = comparison?.original?.imageId || newestImage(product, "FRONT")?.id;
    if (!sourceId) {
      setError("请先上传正面原图。");
      return;
    }
    setBusy(mode);
    setError("");
    try {
      const cutout = await runImageOperation(product.id, sourceId, "REMOVE_BACKGROUND", ids.adminUserId, mode);
      const white = await runImageOperation(product.id, cutout.outputImageId!, "COMPOSE_WHITE_BACKGROUND", ids.adminUserId);
      const optimized = await runImageOperation(product.id, white.outputImageId!, "OPTIMIZE_MAIN_IMAGE", ids.adminUserId);
      const updated = await selectMainImage(product.id, optimized.outputImageId!, ids.adminUserId);
      setComparison(updated);
      setActiveImage("optimized");
      setNotice(mode === "rembg_birefnet" ? "已使用 BiRefNet 重新处理。" : "已使用 lightweight OpenCV 重新处理。");
    } catch (caught) {
      setError(errorMessage(caught, "图片处理失败。"));
    } finally {
      setBusy("");
    }
  }

  async function chooseMain(image: ImageTab) {
    if (!product || !image.selectable || !image.imageId) return;
    setBusy(`main-${image.imageId}`);
    setError("");
    try {
      setComparison(await selectMainImage(product.id, image.imageId, ids.adminUserId));
      setNotice(`${image.label}已设为商城主图。`);
    } catch (caught) {
      setError(errorMessage(caught, "无法选择商城主图。"));
    } finally {
      setBusy("");
    }
  }

  async function markRetake() {
    if (!product) return;
    const reason = window.prompt("填写重拍原因", "图片模糊、裁切不完整或商品摆放不合格");
    if (!reason?.trim()) return;
    setBusy("retake");
    setError("");
    try {
      await request(`/operations/product-batches/products/${product.id}/retake`, {
        method: "POST",
        body: JSON.stringify({ ...ids, reason: reason.trim() })
      });
      if (draftKey) localStorage.removeItem(draftKey);
      router.push(`/product/batches/${encodeURIComponent(batchId)}/upload?productId=${encodeURIComponent(product.id)}`);
    } catch (caught) {
      setError(errorMessage(caught, "无法标记重拍。"));
      setBusy("");
    }
  }

  if (!batch || !product) {
    return <StatusMessage tone={error ? "danger" : "neutral"}>{error || "正在读取校准工作台..."}</StatusMessage>;
  }

  const latestRemovalJob = comparison?.jobs.find((job) => job.operation === "REMOVE_BACKGROUND");
  const allComplete = completedCount === batch.targetCount;

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-20 lg:pb-6">
      <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link href={`/product/batches/${encodeURIComponent(batch.id)}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-3" />返回批次
          </Link>
          <h1 className="mt-2 truncate text-2xl font-semibold tracking-normal">{batch.batchCode} · 人工校准</h1>
          <p className="mt-1 text-sm text-muted-foreground">第 {currentIndex + 1}/{batch.targetCount} 件 · 已完成 {completedCount}/{batch.targetCount} · {productStatusLabel(product.status)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" title="上一件" disabled={currentIndex === 0 || Boolean(busy)} onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}><ArrowLeftIcon /></Button>
          <Button variant="outline" size="icon" title="下一件" disabled={currentIndex === batch.products.length - 1 || Boolean(busy)} onClick={() => setCurrentIndex((index) => Math.min(batch.products.length - 1, index + 1))}><ArrowRightIcon /></Button>
        </div>
      </header>

      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${batch.targetCount ? (completedCount / batch.targetCount) * 100 : 0}%` }} /></div>
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      {notice ? <StatusMessage tone="neutral">{notice}</StatusMessage> : null}

      {allComplete ? (
        <div className="flex flex-col gap-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2 font-medium"><CheckCircle2Icon className="size-5" />本批 {batch.targetCount} 件已完成人工校准</span>
          <Button asChild><Link href={`/product/batches/${encodeURIComponent(batch.id)}`}>完成本批校准<ArrowRightIcon data-icon="inline-end" /></Link></Button>
        </div>
      ) : null}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,55fr)_minmax(420px,45fr)]">
        <section className="min-w-0 space-y-3" aria-label="商品图片校准">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">图片确认</h2>
              <p className="text-xs text-muted-foreground">原图永久保留；透明抠图、白底图和优化主图都是独立版本。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void processImages("lightweight")}><RefreshCwIcon data-icon="inline-start" />重跑 lightweight</Button>
              <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void processImages("rembg_birefnet")}><WandSparklesIcon data-icon="inline-start" />强制 BiRefNet</Button>
            </div>
          </div>

          <Tabs value={activeImage} onValueChange={setActiveImage}>
            <TabsList className="h-auto w-full justify-start overflow-x-auto">
              {imageTabs.map((image) => <TabsTrigger key={image.key} value={image.key} className="shrink-0">{image.label}{image.selected ? " · 主图" : ""}</TabsTrigger>)}
            </TabsList>
            {imageTabs.map((image) => (
              <TabsContent key={image.key} value={image.key}>
                <div ref={image.key === activeImage ? imagePanelRef : undefined} className={cn("relative flex aspect-[4/5] max-h-[70vh] items-center justify-center overflow-hidden rounded-md border bg-white", image.transparent && "bg-muted") }>
                  <SafeProductImage src={image.url} alt={image.label} />
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <div className="flex flex-wrap gap-2">
            {currentImage?.selectable ? <Button size="sm" disabled={Boolean(busy) || currentImage.selected} onClick={() => void chooseMain(currentImage)}>{currentImage.selected ? "已是商城主图" : "设为商城主图"}</Button> : null}
            <Button size="sm" variant="outline" disabled={!currentImage?.url} onClick={() => void imagePanelRef.current?.requestFullscreen()}><ExpandIcon data-icon="inline-start" />全屏</Button>
            {currentImage?.url ? <Button asChild size="sm" variant="outline"><a href={currentImage.url} target="_blank" rel="noreferrer" download><DownloadIcon data-icon="inline-start" />下载</a></Button> : null}
          </div>

          {latestRemovalJob ? <ProcessingSummary job={latestRemovalJob} /> : <StatusMessage tone="neutral">还没有图片处理记录。</StatusMessage>}
          <details className="rounded-md border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">处理历史（{comparison?.jobs.length ?? 0}）</summary>
            <div className="mt-2 space-y-2">
              {comparison?.jobs.map((job) => (
                <div key={job.id} className="grid gap-1 border-t pt-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <span>{operationLabel(job.operation)}</span><span>{statusLabel(job.status)}</span><span>{providerLabel(job.provider)}</span>
                </div>
              ))}
            </div>
          </details>
        </section>

        <section className="min-w-0 space-y-5" aria-label="商品信息校准">
          <div>
            <h2 className="font-semibold">商品信息</h2>
            <p className="text-xs text-muted-foreground">字段中的内容是最终值；下方灰字保留 AI 建议，人工修改不会覆盖 AI 原始记录。</p>
          </div>

          <FormInput label="标题" value={form.title} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "title")} onChange={(value) => updateForm("title", value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect label="分类" value={form.category} values={categoryOptions} labels={taxonomyLabels} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "category")} onChange={(value) => updateForm("category", value)} />
            <FormSelect label="子分类" value={form.subcategory} values={subcategoryOptions} labels={taxonomyLabels} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "subcategory")} onChange={(value) => updateForm("subcategory", value)} />
            <FormSelect label="适用人群" value={form.audience} values={AI_AUDIENCES} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "audience")} onChange={(value) => updateForm("audience", value)} />
            <FormSelect label="颜色" value={form.color} values={colorOptions} labels={taxonomyLabels} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "primaryColor")} onChange={(value) => updateForm("color", value)} />
            {form.audience === "KIDS" ? <FormSelect label="儿童年龄段" value={form.kidsAgeRange} values={AI_KIDS_AGE_RANGES} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "kidsAgeRange")} onChange={(value) => updateForm("kidsAgeRange", value)} /> : null}
            <FormInput label="标签尺码" value={form.tagSize} disabled={readOnly} suggestion={aiSuggestion(aiOutput, "sizeLabel")} onChange={(value) => updateForm("tagSize", value)} />
            <FormSelect label="平台推荐尺码" value={form.sizeLabel} values={sizeOptions} labels={taxonomyLabels} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "sizeLabel")} onChange={(value) => updateForm("sizeLabel", value)} />
          </div>

          <div className="border-t pt-4">
            <h3 className="mb-3 text-sm font-semibold">尺寸（cm）</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {visibleMeasurementFields.map((field) => (
                <FormInput
                  key={field.key}
                  label={field.label}
                  value={form[field.key]}
                  required={requiredMeasurementKeys.has(field.key)}
                  inputMode="decimal"
                  disabled={readOnly}
                  onChange={(value) => updateForm(field.key, value)}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect label="成色" value={form.conditionGrade} values={conditionOptions} labels={taxonomyLabels} required disabled={readOnly} onChange={(value) => updateForm("conditionGrade", value)} />
            <FormInput label="品牌" value={form.brand} disabled={readOnly} suggestion={aiSuggestion(aiOutput, "brandLabel")} onChange={(value) => updateForm("brand", value)} />
            <FormInput label="价格（KSh）" value={form.priceKsh} required inputMode="numeric" disabled={readOnly} onChange={(value) => updateForm("priceKsh", value)} />
            <FormSelect label="图案" value={form.pattern} values={AI_PATTERNS} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "pattern")} onChange={(value) => updateForm("pattern", value)} />
            <FormSelect label="袖型" value={form.sleeveType} values={AI_SLEEVE_TYPES} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "sleeveType")} onChange={(value) => updateForm("sleeveType", value)} />
            <FormSelect label="版型" value={form.fitType} values={PRODUCT_FIT_TYPES} labels={FACT_LABELS} required disabled={readOnly} onChange={(value) => updateForm("fitType", value)} />
            <FormSelect label="弹性" value={form.stretchLevel} values={PRODUCT_STRETCH_LEVELS} labels={FACT_LABELS} required disabled={readOnly} onChange={(value) => updateForm("stretchLevel", value)} />
            <FormSelect label="面料厚度" value={form.fabricWeight} values={PRODUCT_FABRIC_WEIGHTS} labels={FACT_LABELS} required disabled={readOnly} onChange={(value) => updateForm("fabricWeight", value)} />
          </div>

          <FormTextarea label="瑕疵" value={form.defects} required disabled={readOnly} hint="没有瑕疵请填写 None。" onChange={(value) => updateForm("defects", value)} />
          <FormTextarea label="商品描述" value={form.description} disabled={readOnly} onChange={(value) => updateForm("description", value)} />
          {reasons.length && !readOnly ? <StatusMessage tone="danger">{reasons.join(" ")}</StatusMessage> : null}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur lg:sticky lg:inset-auto lg:flex lg:justify-end lg:gap-2 lg:px-0">
        <div className="mx-auto grid max-w-6xl grid-cols-3 gap-2 lg:mx-0 lg:flex">
          <Button variant="outline" disabled={Boolean(busy) || readOnly} onClick={saveDraft}><SaveIcon data-icon="inline-start" />保存草稿</Button>
          <Button disabled={Boolean(busy) || readOnly || reasons.length > 0 || !comparison?.selectedMainImageId} onClick={() => void saveAndNext()}>
            {busy === "save" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <CheckCircle2Icon data-icon="inline-start" />}
            {readOnly ? "本件已校准" : "保存并下一件"}
          </Button>
          <Button variant="outline" disabled={Boolean(busy) || readOnly} onClick={() => void markRetake()}><RotateCcwIcon data-icon="inline-start" />标记重拍</Button>
        </div>
      </div>
    </div>
  );
}

function ProcessingSummary({ job }: { job: ImageProcessingJobRecord }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-xs">
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <span>处理引擎：<strong>{providerLabel(job.provider)}</strong></span>
        <span>质量分：<strong>{job.qualityScore == null ? "-" : Math.round(job.qualityScore * 100)}</strong></span>
        {job.fallbackFrom ? <span>自动回退：<strong>{providerLabel(job.fallbackFrom)} → {providerLabel(job.provider)}</strong></span> : null}
        {job.fallbackReason ? <span>回退原因：<strong>{job.fallbackReason}</strong></span> : null}
      </div>
      {job.qualityIssues.length ? <div className="mt-2 flex flex-wrap gap-1">{job.qualityIssues.map((issue) => <Badge key={issue} variant="secondary">{imageIssueLabel(issue)}</Badge>)}</div> : null}
    </div>
  );
}

function FormInput(props: {
  label: string;
  value: string;
  required?: boolean;
  disabled?: boolean;
  inputMode?: "text" | "numeric" | "decimal";
  suggestion?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0 text-sm font-medium">
      <span>{props.label}{props.required ? " *" : ""}</span>
      <Input className="mt-2" value={props.value} disabled={props.disabled} inputMode={props.inputMode} onChange={(event) => props.onChange(event.target.value)} />
      {props.suggestion ? <span className="mt-1 block text-xs font-normal text-muted-foreground">AI 建议：{props.suggestion}</span> : null}
    </label>
  );
}

function FormSelect(props: {
  label: string;
  value: string;
  values: readonly string[];
  required?: boolean;
  disabled?: boolean;
  suggestion?: string;
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0 text-sm font-medium">
      <span>{props.label}{props.required ? " *" : ""}</span>
      <NativeSelect className="mt-2 w-full" value={props.value} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value)}>
        {props.values.map((value) => <NativeSelectOption key={value} value={value}>{props.labels?.[value] ?? enumLabel(value, props.label)}</NativeSelectOption>)}
      </NativeSelect>
      {props.suggestion ? <span className="mt-1 block text-xs font-normal text-muted-foreground">AI 建议：{enumLabel(props.suggestion, props.label)}</span> : null}
    </label>
  );
}

function FormTextarea(props: { label: string; value: string; required?: boolean; disabled?: boolean; hint?: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-medium">
      <span>{props.label}{props.required ? " *" : ""}</span>
      <Textarea className="mt-2" rows={3} value={props.value} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value)} />
      {props.hint ? <span className="mt-1 block text-xs font-normal text-muted-foreground">{props.hint}</span> : null}
    </label>
  );
}

function SafeProductImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <div className="text-sm text-muted-foreground">图片缺失</div>;
  return <img src={src} alt={alt} className="size-full object-contain" onError={() => setFailed(true)} />;
}

function StatusMessage({ tone, children }: { tone: "danger" | "neutral"; children: ReactNode }) {
  return <div className={cn("rounded-md border px-4 py-3 text-sm", tone === "danger" ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted/40 text-muted-foreground")}>{children}</div>;
}

function buildImageTabs(product: ProductRecord | null, comparison: ProductImageComparisonResponse | null): ImageTab[] {
  const tabs: ImageTab[] = [
    variantTab("original", "原图", comparison?.original ?? null, true),
    variantTab("transparent", "透明抠图", comparison?.cutoutTransparent ?? null, false, true),
    variantTab("white", "白底图", comparison?.cutoutWhite ?? null, true),
    variantTab("optimized", "优化主图", comparison?.optimizedMain ?? null, true)
  ];
  for (const [type, label] of [["BACK", "背面"], ["LABEL", "标签"], ["DEFECT", "瑕疵"], ["DETAIL", "细节"]] as const) {
    const image = newestImage(product, type);
    if (image) tabs.push({ key: type.toLowerCase(), label, url: image.publicUrl ? `${API_PROXY_URL}${image.publicUrl}` : "", imageId: image.id, selectable: false, selected: false });
  }
  return tabs;
}

function variantTab(key: string, label: string, asset: ProductImageVariantRecord | null, selectable: boolean, transparent = false): ImageTab {
  return {
    key,
    label,
    url: asset?.publicUrl ? `${API_PROXY_URL}${asset.publicUrl}` : "",
    imageId: asset?.imageId ?? "",
    selectable: selectable && Boolean(asset),
    selected: Boolean(asset?.selectedAsMain),
    transparent
  };
}

function formForProduct(product: ProductRecord, extraction: JsonRecord | null): WorkspaceForm {
  const base = formFromProductAndAi(product, extraction);
  const measurements = product.measurements ?? [];
  const value = (type: string) => {
    const raw = measurements.find((item) => item.measurementType === type)?.finalValueCm;
    return raw == null ? "" : String(raw);
  };
  return {
    ...base,
    lengthCm: value("LENGTH"),
    chestWidthCm: value("CHEST_WIDTH"),
    shoulderWidthCm: value("SHOULDER_WIDTH"),
    sleeveLengthCm: value("SLEEVE_LENGTH"),
    waistCm: value("WAIST"),
    hipCm: value("HIP"),
    thighWidthCm: value("THIGH_WIDTH"),
    legOpeningCm: value("LEG_OPENING"),
    inseamCm: value("INSEAM"),
    defects: product.defects?.length ? product.defects.map((defect) => defect.description).filter(Boolean).join("; ") : "None"
  };
}

function newestImage(product: ProductRecord | null, type: string) {
  return product?.images?.find((image) => image.type === type) ?? null;
}

function isCalibratable(product: ProductRecord) {
  return ["AI_PROCESSED", "CALIBRATION_PENDING"].includes(product.status);
}

function isCalibrationComplete(status: string) {
  return CALIBRATION_COMPLETE_STATUSES.has(status);
}

function subcategoriesFor(category: string, current = "") {
  const lookup = PRODUCT_SUBCATEGORIES_BY_CATEGORY as Record<string, readonly string[]>;
  const values = [...(lookup[category] ?? ["OTHER"])];
  return current && !values.includes(current) ? [current, ...values] : values;
}

function activeValues(
  taxonomy: ProductTaxonomy | null,
  group: keyof ProductTaxonomy["groups"],
  fallback: readonly string[],
  current = ""
) {
  const configured = taxonomy?.groups[group].filter((option) => option.active).map((option) => option.code);
  const values = configured?.length ? configured : [...fallback];
  return current && !values.includes(current) ? [current, ...values] : values;
}

function activeSubcategories(taxonomy: ProductTaxonomy, category: string, current = "") {
  const values = taxonomy.groups.SUBCATEGORY
    .filter((option) => option.active && (!option.parentCode || option.parentCode === category))
    .map((option) => option.code);
  if (!values.length) values.push("OTHER");
  return current && !values.includes(current) ? [current, ...values] : values;
}

function taxonomyLabelMap(taxonomy: ProductTaxonomy | null) {
  if (!taxonomy) return {};
  return Object.fromEntries(Object.values(taxonomy.groups).flat().map((option) => [option.code, option.displayName]));
}

function aiSuggestion(output: JsonRecord | null, key: string) {
  const field = output?.[key];
  if (!field || typeof field !== "object" || Array.isArray(field)) return "";
  const value = (field as JsonRecord).value;
  return typeof value === "string" ? value : "";
}

function providerLabel(provider: string | null) {
  if (!provider) return "-";
  if (provider.includes("rembg") || provider.includes("birefnet")) return "rembg + BiRefNet";
  if (provider.includes("lightweight") || provider.includes("opencv")) return "lightweight OpenCV";
  return provider;
}

function operationLabel(value: string) {
  return ({ REMOVE_BACKGROUND: "去除背景", COMPOSE_WHITE_BACKGROUND: "生成白底图", OPTIMIZE_MAIN_IMAGE: "优化主图" } as Record<string, string>)[value] ?? value;
}

function statusLabel(value: string) {
  return ({ PENDING: "等待", RUNNING: "处理中", SUCCEEDED: "成功", FAILED: "失败" } as Record<string, string>)[value] ?? value;
}

const ENUM_LABELS: Record<string, string> = {
  KIDS: "童装", PANTS: "长裤", JACKETS: "外套", DRESSES: "连衣裙与半身裙", LADY_TOPS: "女士上衣", SHIRTS: "衬衫", TSHIRTS: "T恤", SHORT: "短裤", TWO_PIECE: "两件套", SHOES: "鞋", BAG: "包", OTHERS: "其他配饰", TEXTILE: "家纺", OTHER: "其他",
  KIDS_DRESS: "童装裙", KIDS_JACKET_TOP: "童装外套与上衣", KIDS_PANTS: "童装裤", NEWBORN: "新生儿服装", MEN_JEANS: "男士牛仔裤", LADIES_PANTS_MIX: "女士裤", SWEAT_PANTS: "运动裤", CARGO_PANTS: "工装裤", OFFICIAL_PANTS: "正装裤", MEN_JACKETS: "男士外套", THICK_VEST: "厚马甲", LADIES_JACKETS: "女士外套", UNISEX_JACKETS: "中性外套", HOODIES: "连帽卫衣", SWEATSHIRTS: "卫衣", DENIM_JACKETS: "牛仔外套", LONG_DRESSES: "长裙", SHORT_DRESSES_SKIRTS: "短裙与半身裙", OFFICIAL_TOPS: "正装上衣", FANCY_TOPS: "时尚上衣", SHORT_SHIRTS: "短袖衬衫", LONG_SHIRTS: "长袖衬衫", TSHIRT: "T恤", SHORT_PANTS: "短裤", LONG_TWO_PIECE: "长款两件套", SHORT_TWO_PIECE: "短款两件套", MEN_SPORT_SHOES: "男士运动鞋", MEN_SHOES: "男鞋", LADIES_SHOES: "女鞋", KIDS_SHOES: "童鞋", OFFICIAL_SHOES: "正装鞋", LADIES_BAGS: "女包", SCHOOL_BAGS: "书包", PACKAGE_BAGS: "包装袋", HATS_CAPS: "帽子", SCARFS: "围巾", BODY_SHAPERS: "塑身衣", INNER_WARES: "内衣", BEDSHEETS: "床单", LIGHT_BLANKETS: "薄毯",
  WOMEN: "女士", MEN: "男士", UNISEX: "中性", NOT_APPLICABLE: "不适用", BABY_0_12M: "婴儿 0-12月", TODDLER_1_3Y: "幼儿 1-3岁", PRESCHOOL_3_5Y: "学龄前 3-5岁", KIDS_6_8Y: "儿童 6-8岁", KIDS_9_12Y: "儿童 9-12岁", TEEN_13_16Y: "青少年 13-16岁",
  BLACK: "黑色", WHITE: "白色", OFF_WHITE: "米白", GREY: "灰色", BROWN: "棕色", BEIGE: "米色", CREAM: "奶油色", TAN: "棕褐色", KHAKI: "卡其色", RED: "红色", MAROON: "栗色", BURGUNDY: "酒红", ORANGE: "橙色", CORAL: "珊瑚色", PEACH: "桃色", YELLOW: "黄色", MUSTARD: "芥末黄", GREEN: "绿色", LIGHT_GREEN: "浅绿", DARK_GREEN: "深绿", OLIVE: "橄榄绿", BLUE: "蓝色", LIGHT_BLUE: "浅蓝", DARK_BLUE: "深蓝", NAVY: "藏青", DENIM: "牛仔蓝", TEAL: "蓝绿色", TURQUOISE: "青绿色", PURPLE: "紫色", LILAC: "丁香紫", PINK: "粉色", GOLD: "金色", SILVER: "银色", MULTICOLOR: "多色",
  SOLID: "纯色", STRIPED: "条纹", CHECKED: "格纹", FLORAL: "花卉", GRAPHIC: "图案印花", POLKA_DOT: "波点", ANIMAL_PRINT: "动物纹", ABSTRACT: "抽象图案", SLEEVELESS: "无袖", THREE_QUARTER: "七分袖", LONG: "长袖",
  LIKE_NEW: "近全新", EXCELLENT: "成色优秀", GOOD: "成色良好", FAIR: "有明显使用痕迹"
};

function enumLabel(value: string, fieldLabel = "") {
  if (value === "SHORT") return fieldLabel === "袖型" ? "短袖" : "短裤";
  return ENUM_LABELS[value] ?? value.replaceAll("_", " ");
}

function errorMessage(value: unknown, fallback: string) {
  return value instanceof Error ? value.message : fallback;
}
