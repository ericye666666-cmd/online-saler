"use client";
import { BAG_STYLES, BAG_STYLE_LABELS } from "@online-saler/shared-types";


import { operationsFetch } from "@/lib/operations-api";

import Link from "next/link";
import { BatchDisplayProgress } from "./product-background-display";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  isShoeCategory,
  AI_AUDIENCES,
  AI_COLORS,
  AI_KIDS_AGE_RANGES,
  AI_PATTERNS,
  AI_SLEEVE_TYPES,
  PRODUCT_AI_PROMPT_VERSION,
  PRODUCT_CATEGORY_OPTIONS,
  PRODUCT_FABRIC_WEIGHTS,
  PRODUCT_FIT_TYPES,
  PRODUCT_MATERIAL_OPTIONS,
  PRODUCT_STRETCH_LEVELS,
  PRODUCT_SUBCATEGORIES_BY_CATEGORY,
  PRODUCT_TAG_OPTIONS,
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
  ScissorsIcon,
  WandSparklesIcon
} from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  buildCalibrationBody,
  calibrationValidationIssues,
  calibrationValidationReasons,
  formFromProductAndAi,
  measurementFields,
  measurementRequirements,
  normalizedAiOutput,
  normalizeWorkspaceForm,
  stringValue,
  syncSizeFields,
  type JsonRecord,
  type WorkspaceForm
} from "../operations-workspace-flow";
import { ShoeCalibrationFields } from "./shoe-calibration-fields";
import { BagStrapField } from "./bag-strap-field";
import { ApparelSizeField } from "./apparel-size-field";
import { kidsAgeRangeLabels } from "./apparel-size";
import { resolveCalibrationProductIndex } from "./product-factory-batch-display";
import { productStatusLabel } from "./product-factory-display";
import { t } from "@/i18n/runtime";

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
  variant?: string;
  publicUrl?: string | null;
  createdAt?: string;
};

type ProductRecord = JsonRecord & {
  id: string;
  productCode: string;
  batchItemNumber?: number | null;
  status: string;
  images?: ProductImage[];
  measurements?: Array<{
    measurementType?: string;
    aiValueCm?: unknown;
    aiConfidence?: unknown;
    finalValueCm?: unknown;
    manualLineImageId?: unknown;
    manualLineStartX?: unknown;
    manualLineStartY?: unknown;
    manualLineEndX?: unknown;
    manualLineEndY?: unknown;
  }>;
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
type ProductTaxonomy = { groups: Record<"CATEGORY" | "SUBCATEGORY" | "COLOR" | "MATERIAL" | "TAG" | "SIZE" | "CONDITION" | "DEFECT", TaxonomyOption[]> };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await operationsFetch(`${API_PROXY_URL}${path}`, {
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

export function ProductBatchCalibrationPage({
  batchId,
  initialProductId
}: {
  batchId: string;
  initialProductId?: string;
}) {
  const ids = useOperationIds();
  const router = useRouter();
  const imagePanelRef = useRef<HTMLDivElement>(null);
  const [batch, setBatch] = useState<ProductBatch | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [form, setForm] = useState<WorkspaceForm>(() => formFromProductAndAi(null, null));
  const [comparison, setComparison] = useState<ProductImageComparisonResponse | null>(null);
  const [taxonomy, setTaxonomy] = useState<ProductTaxonomy | null>(null);
  const [activeImage, setActiveImage] = useState("original-FRONT");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formProductId, setFormProductId] = useState("");

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    const loaded = await loadBatch(batchId, ids.adminUserId);
    setBatch(loaded);
    setCurrentIndex(resolveCalibrationProductIndex(loaded.products, initialProductId ?? "", isCalibratable));
  }, [batchId, ids.adminUserId, initialProductId]);

  useEffect(() => {
    void load().catch((caught) => setError(errorMessage(caught, t("无法读取批次。"))));
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
  const shoes = isShoeCategory(form.category);
  const draftKey = product ? `operations.product.calibration.manual-size-draft.${product.id}` : "";

  useEffect(() => {
    if (!product) return;
    const query = new URLSearchParams({ batchId, productId: product.id });
    router.replace(`/product/calibration?${query.toString()}`, { scroll: false });
  }, [batchId, product?.id, router]);

  useEffect(() => {
    if (!product || !ids.adminUserId) return;
    setComparison(null);
    setError("");
    setNotice("");
    const baseForm = formForProduct(product, latestExtraction);
    const saved = localStorage.getItem(`operations.product.calibration.manual-size-draft.${product.id}`);
    let nextForm = baseForm;
    if (saved) {
      try {
        const savedForm = JSON.parse(saved) as Partial<WorkspaceForm>;
        nextForm = normalizeWorkspaceForm({ ...baseForm, ...savedForm });
      } catch {
        localStorage.removeItem(`operations.product.calibration.manual-size-draft.${product.id}`);
      }
    }
    setForm(nextForm);
    setFormProductId(product.id);
    void loadComparison(product.id, ids.adminUserId)
      .then((value) => {
        setComparison(value);
        setActiveImage("original-FRONT");
      })
      .catch((caught) => setError(errorMessage(caught, t("无法读取图片版本。"))));
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

  const imageTabs = useMemo(
    () => buildImageTabs(comparison, product),
    [comparison, product, shoes]
  );
  const currentImage = imageTabs.find((item) => item.key === activeImage) ?? imageTabs[0] ?? null;
  const reasons = calibrationValidationReasons(form, {
    hasPhoto: Boolean(product?.images?.length),
    hasAi: Boolean(latestExtraction && (latestExtraction.status === "SUCCEEDED" || aiOutput))
  });
  const validationIssues = calibrationValidationIssues(form, {
    hasPhoto: Boolean(product?.images?.length),
    hasAi: Boolean(latestExtraction && (latestExtraction.status === "SUCCEEDED" || aiOutput))
  });
  const completedCount = batch?.products.filter((item) => isCalibrationComplete(item.status)).length ?? 0;
  const readOnly = Boolean(product && isCalibrationComplete(product.status));
  const taxonomyLabels = useMemo(() => taxonomyLabelMap(taxonomy), [taxonomy]);
  const materialLabels = useMemo(
    () => ({ ...taxonomyLabels, DENIM: taxonomyLabels.DENIM ?? t("牛仔布") }),
    [taxonomyLabels]
  );
  const categoryOptions = activeValues(taxonomy, "CATEGORY", PRODUCT_CATEGORY_OPTIONS, form.category);
  const visibleMeasurementFields = measurementFields(form);
  const requiredMeasurementKeys = new Set(measurementRequirements(form).map((item) => item.key));
  const colorOptions = activeValues(taxonomy, "COLOR", AI_COLORS, form.color);
  const conditionOptions = activeValues(taxonomy, "CONDITION", ["LIKE_NEW", "EXCELLENT", "GOOD", "FAIR"], form.conditionGrade);
  const materialOptions = activeValues(taxonomy, "MATERIAL", PRODUCT_MATERIAL_OPTIONS, form.material);
  const tagOptions = activeValues(taxonomy, "TAG", PRODUCT_TAG_OPTIONS);
  const subcategoryOptions = taxonomy
    ? activeSubcategories(taxonomy, form.category, form.subcategory)
    : subcategoriesFor(form.category, form.subcategory);

  function updateForm(key: Exclude<keyof WorkspaceForm, "tags" | "shoePairConfirmed">, value: string) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "category") {
        const options = taxonomy ? activeSubcategories(taxonomy, value) : subcategoriesFor(value);
        next.subcategory = options.includes(next.subcategory) ? next.subcategory : options[0] ?? "OTHER";
      }
      return syncSizeFields(normalizeWorkspaceForm(next, current.category), key);
    });
    if (key === "category") {
      setActiveImage("original-FRONT");
    }
    setNotice("");
  }

  function updateTags(tag: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      tags: checked
        ? [...new Set([...current.tags, tag])].slice(0, 8)
        : current.tags.filter((value) => value !== tag)
    }));
    setNotice("");
  }

  function saveDraft() {
    if (!draftKey) return;
    localStorage.setItem(draftKey, JSON.stringify(form));
    setNotice(t("草稿已保存在本机，可稍后继续。"));
  }

  async function saveAndNext() {
    if (!product || readOnly) return;
    if (reasons.length) {
      setError(reasons.join(" "));
      focusValidationIssue(validationIssues[0], imagePanelRef.current);
      return;
    }
    const extractionId = stringValue(latestExtraction?.extractionId) || stringValue(latestExtraction?.id);
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const calibrationBody = buildCalibrationBody({ employeeId: ids.employeeId, extractionId, form });
      await request(`/products/${product.id}/calibrate`, {
        method: "POST",
        body: JSON.stringify({
          ...calibrationBody,
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
      if (firstPending >= 0 || next >= 0) {
        setNotice(t("已确认，进入下一件。"));
      } else {
        // Do not await the whole batch: originals are already generating while
        // staff enter facts. Sales details now run alongside image review.
        void request(`/operations/product-batches/${batchId}/detail-generation/run`, {
          method: "POST", headers: { "X-Admin-User-Id": ids.adminUserId }, body: "{}", keepalive: true
        }).catch(() => {
          sessionStorage.setItem(`product-factory-notice:${batchId}`, t("销售详情尚未完成，可在审核页重试；白底图审核可以继续。"));
        });
        router.push(`/product/display-review?batchId=${encodeURIComponent(batchId)}`);
      }
    } catch (caught) {
      setError(errorMessage(caught, t("无法保存校准。")));
    } finally {
      setBusy("");
    }
  }

  async function rerunAiMeasurements() {
    if (!product) return;
    const imageIds = (product.images ?? []).map((image) => image.id).filter(Boolean);
    if (!imageIds.length) {
      setError(t("请先上传商品照片。"));
      return;
    }
    setBusy("ai-measurements");
    setError("");
    setNotice("");
    try {
      await request("/ai-jobs", {
        method: "POST",
        body: JSON.stringify({
          adminUserId: ids.adminUserId,
          productId: product.id,
          imageIds,
          promptVersion: PRODUCT_AI_PROMPT_VERSION
        })
      });
      await load();
      setNotice(shoes ? t("AI 鞋类识别已更新，请对照原图核对鞋码、鞋款和成双情况。") : t("AI 商品资料已更新，尺码仍由员工填写。"));
    } catch (caught) {
      setError(errorMessage(caught, t("AI 商品识别失败。")));
    } finally {
      setBusy("");
    }
  }

  async function markRetake() {
    if (!product) return;
    const reason = window.prompt(t("填写重拍原因"), t("图片模糊、裁切不完整或商品摆放不合格"));
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
      setError(errorMessage(caught, t("无法标记重拍。")));
      setBusy("");
    }
  }

  if (!batch || !product) {
    return <StatusMessage tone={error ? "danger" : "neutral"}>{error || t("正在读取校准工作台...")}</StatusMessage>;
  }

  const allComplete = completedCount === batch.targetCount;
  const finalPendingItem = !readOnly && completedCount === batch.targetCount - 1;

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-20 lg:pb-6">
      <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link href={`/product/batches/${encodeURIComponent(batch.id)}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-3" />{t("返回批次")}
          </Link>
          <h1 className="mt-2 truncate text-2xl font-semibold tracking-normal">{batch.batchCode}  {t("· 第 3 步：校准商品信息、填写尺码")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("第")} {currentIndex + 1}/{batch.targetCount} {shoes ? t("双") : t("件")}  {t("· 已完成")} {completedCount}/{batch.targetCount} · {productStatusLabel(product.status)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" title={t("上一件")} disabled={currentIndex === 0 || Boolean(busy)} onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}><ArrowLeftIcon /></Button>
          <Button variant="outline" size="icon" title={t("下一件")} disabled={currentIndex === batch.products.length - 1 || Boolean(busy)} onClick={() => setCurrentIndex((index) => Math.min(batch.products.length - 1, index + 1))}><ArrowRightIcon /></Button>
        </div>
      </header>

      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${batch.targetCount ? (completedCount / batch.targetCount) * 100 : 0}%` }} /></div>
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      {notice ? <StatusMessage tone="neutral">{notice}</StatusMessage> : null}

      <BatchDisplayProgress batch={batch} />

      {allComplete ? (
        <div className="flex flex-col gap-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2 font-medium"><CheckCircle2Icon className="size-5" />{t("本批")} {batch.targetCount}  {t("件已完成商品信息确认")}</span>
          <Button asChild><Link href={`/product/display-review?batchId=${encodeURIComponent(batch.id)}`}>{t("继续白底展示图审核")}<ArrowRightIcon data-icon="inline-end" /></Link></Button>
        </div>
      ) : null}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,55fr)_minmax(420px,45fr)]">
        <section className="min-w-0 space-y-3" aria-label={t("商品图片校准")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">{t("图片确认")}</h2>
              <p className="text-xs text-muted-foreground">{shoes ? t("核对整双、侧面、鞋底和尺码标原图。整批确认后生成白底展示图，再逐双对照原图审核。") : t("对照原图核对商品信息并手填尺码；整批确认后，系统直接使用原图生成白底展示图。")}</p>
            </div>
            <Badge variant="secondary">{t("对照原图校准商品信息")}</Badge>
          </div>

          <Tabs value={activeImage} onValueChange={setActiveImage}>
            <TabsList className="h-auto w-full justify-start overflow-x-auto">
              {imageTabs.map((image) => <TabsTrigger key={image.key} value={image.key} className="shrink-0">{image.label}</TabsTrigger>)}
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
            <Button size="sm" variant="outline" disabled={!currentImage?.url} onClick={() => void imagePanelRef.current?.requestFullscreen()}><ExpandIcon data-icon="inline-start" />{t("全屏")}</Button>
            {currentImage?.url ? <Button asChild size="sm" variant="outline"><a href={currentImage.url} target="_blank" rel="noreferrer" download><DownloadIcon data-icon="inline-start" />{t("下载")}</a></Button> : null}
          </div>


        </section>

        <section className="min-w-0 space-y-5" aria-label={t("商品信息校准")}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold">{t("商品信息")}</h2>
              <p className="text-xs text-muted-foreground">{t("字段中的内容是最终值；下方灰字保留 AI 建议，人工修改不会覆盖 AI 原始记录。")}</p>
            </div>
            {!readOnly ? (
              <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void rerunAiMeasurements()}>
                {busy === "ai-measurements" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <WandSparklesIcon data-icon="inline-start" />}
                {shoes ? t("重新 AI 识别鞋子") : t("重新 AI 识别商品")}
              </Button>
            ) : null}
          </div>

          <FormInput fieldKey="title" label={t("标题")} value={form.title} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "title")} onChange={(value) => updateForm("title", value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect fieldKey="category" label={t("分类")} value={form.category} values={categoryOptions} labels={taxonomyLabels} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "category")} onChange={(value) => updateForm("category", value)} />
            <FormSelect fieldKey="subcategory" label={form.category === "BAG" ? t("包款式") : t("子分类")} value={form.subcategory} values={form.category === "BAG" ? BAG_STYLES : subcategoryOptions} labels={form.category === "BAG" ? BAG_STYLE_LABELS : taxonomyLabels} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "subcategory")} onChange={(value) => updateForm("subcategory", value)} />
            <FormSelect fieldKey="audience" label={t("适用人群")} value={form.audience} values={AI_AUDIENCES} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "audience")} onChange={(value) => updateForm("audience", value)} />
            <FormSelect fieldKey="color" label={t("颜色")} value={form.color} values={colorOptions} labels={taxonomyLabels} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "primaryColor")} onChange={(value) => updateForm("color", value)} />
            {!shoes && form.category !== "BAG" && form.audience === "KIDS" ? <FormSelect fieldKey="kidsAgeRange" label={t("儿童年龄段")} value={form.kidsAgeRange} values={AI_KIDS_AGE_RANGES} labels={kidsAgeRangeLabels()} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "kidsAgeRange")} onChange={(value) => updateForm("kidsAgeRange", value)} /> : null}
            {!shoes && form.category !== "BAG" ? <>
              <ApparelSizeField category={form.category} audience={form.audience} value={form.sizeLabel} disabled={readOnly} onChange={(value) => updateForm("sizeLabel", value)} />
              <details className="sm:col-span-2">
                <summary className="cursor-pointer text-sm text-muted-foreground">{t("原标签记录（可选）")}</summary>
                <div className="pt-3"><FormInput fieldKey="tagSize" label={t("原标尺码")} value={form.tagSize} disabled={readOnly} onChange={(value) => updateForm("tagSize", value)} /></div>
              </details>
            </> : null}
          </div>

          {form.category === "BAG" ? <BagStrapField tags={form.tags} disabled={readOnly} onChange={(tags) => setForm((current) => ({ ...current, tags }))} /> : null}
          {shoes ? (
            <ShoeCalibrationFields
              form={form}
              disabled={readOnly}
              onChange={updateForm}
              onPairConfirmed={(confirmed) => setForm((current) => ({ ...current, shoePairConfirmed: confirmed }))}
            />
          ) : (
            <div className="border-t pt-4">
              <h3 className="mb-3 text-sm font-semibold">{t("人工实测尺寸（cm，可选）")}</h3>
              <p className="text-xs text-muted-foreground">{t("仅填写人工实测值，未测量可留空。包的高度不包含提手。")}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {visibleMeasurementFields.map((field) => (
                  <FormInput
                    key={field.key}
                    fieldKey={field.key}
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
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect fieldKey="conditionGrade" label={t("成色")} value={form.conditionGrade} values={conditionOptions} labels={taxonomyLabels} required disabled={readOnly} onChange={(value) => updateForm("conditionGrade", value)} />
            <FormInput fieldKey="brand" label={t("品牌")} value={form.brand} disabled={readOnly} suggestion={aiSuggestion(aiOutput, "brandLabel")} onChange={(value) => updateForm("brand", value)} />
            <FormInput fieldKey="priceKsh" label={t("价格（KSh）")} value={form.priceKsh} required inputMode="numeric" disabled={readOnly} onChange={(value) => updateForm("priceKsh", value)} />
            <FormSelect fieldKey="pattern" label={t("图案")} value={form.pattern} values={AI_PATTERNS} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "pattern")} onChange={(value) => updateForm("pattern", value)} />
            {!shoes && form.category !== "BAG" ? <>
              <FormSelect fieldKey="sleeveType" label={t("袖型")} value={form.sleeveType} values={AI_SLEEVE_TYPES} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "sleeveType")} onChange={(value) => updateForm("sleeveType", value)} />
              <FormSelect fieldKey="fitType" label={t("版型")} value={form.fitType} values={PRODUCT_FIT_TYPES} labels={FACT_LABELS} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "fitType")} onChange={(value) => updateForm("fitType", value)} />
              <FormSelect fieldKey="stretchLevel" label={t("弹性")} value={form.stretchLevel} values={PRODUCT_STRETCH_LEVELS} labels={FACT_LABELS} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "stretchLevel")} onChange={(value) => updateForm("stretchLevel", value)} />
              <FormSelect fieldKey="fabricWeight" label={t("面料厚度")} value={form.fabricWeight} values={PRODUCT_FABRIC_WEIGHTS} labels={FACT_LABELS} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "fabricWeight")} onChange={(value) => updateForm("fabricWeight", value)} />
            </> : null}
            <FormSelect fieldKey="material" label={shoes ? t("材质") : t("面料")} value={form.material} values={materialOptions} labels={materialLabels} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "material")} onChange={(value) => updateForm("material", value)} />
          </div>

          {!shoes && form.category !== "BAG" ? (
            <FormTagPicker
              fieldKey="tags"
              label={t("商品标签")}
              values={tagOptions}
              selected={form.tags}
              labels={taxonomyLabels}
              suggestion={aiArraySuggestion(aiOutput, "tags")}
              disabled={readOnly}
              onChange={updateTags}
            />
          ) : null}

          <FormTextarea fieldKey="defects" label={t("瑕疵")} value={form.defects} required disabled={readOnly} hint={t("没有瑕疵请填写 None。")} onChange={(value) => updateForm("defects", value)} />
          {reasons.length && !readOnly ? <StatusMessage tone="danger">{reasons.join(" ")}</StatusMessage> : null}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur lg:sticky lg:inset-auto lg:px-0">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          {!readOnly ? (
            <p className={cn("text-xs", validationIssues.length ? "font-medium text-destructive" : "text-emerald-700")}>
              {validationIssues.length
                ? t("还差：{v0}", { v0: [...new Set(validationIssues.map((issue) => issue.label))].join("、") })
                : finalPendingItem ? t("最后一件确认后，系统将自动生成详情与 Barcode。") : t("必填信息已完整，可以确认并进入下一件。")}
            </p>
          ) : <span />}
          <div className="grid grid-cols-3 gap-2 lg:flex">
            <Button variant="outline" disabled={Boolean(busy) || readOnly} onClick={saveDraft}><SaveIcon data-icon="inline-start" />{t("保存草稿")}</Button>
            <Button disabled={Boolean(busy) || readOnly} onClick={() => void saveAndNext()}>
              {busy === "save" || busy === "finalize" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <CheckCircle2Icon data-icon="inline-start" />}
              {readOnly ? t("本件已确认") : finalPendingItem ? t("确认本件并自动生成") : t("确认并下一件")}
            </Button>
            <Button variant="outline" disabled={Boolean(busy) || readOnly} onClick={() => void markRetake()}><RotateCcwIcon data-icon="inline-start" />{t("标记重拍")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormInput(props: {
  fieldKey?: keyof WorkspaceForm;
  label: string;
  value: string;
  required?: boolean;
  disabled?: boolean;
  inputMode?: "text" | "numeric" | "decimal";
  suggestion?: string;
  suggestionLabel?: string;
  hint?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0 text-sm font-medium" data-field-key={props.fieldKey}>
      <span>{props.label}{props.required ? " *" : ""}</span>
      <Input className="mt-2" value={props.value} disabled={props.disabled} inputMode={props.inputMode} onChange={(event) => props.onChange(event.target.value)} />
      {props.suggestion ? <span className="mt-1 block text-xs font-normal text-muted-foreground">{props.suggestionLabel ?? t("AI 建议")}：{props.suggestion}</span> : null}
      {props.hint ? <span className="mt-1 block text-xs font-normal text-muted-foreground">{props.hint}</span> : null}
    </label>
  );
}

function FormSelect(props: {
  fieldKey?: keyof WorkspaceForm;
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
    <label className="block min-w-0 text-sm font-medium" data-field-key={props.fieldKey}>
      <span>{props.label}{props.required ? " *" : ""}</span>
      <NativeSelect className="mt-2 w-full" value={props.value} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value)}>
        {props.required ? <NativeSelectOption value="" disabled>{t("请选择")}{props.label}</NativeSelectOption> : null}
        {props.values.map((value) => <NativeSelectOption key={value} value={value}>{props.labels?.[value] ? t(props.labels[value]) : enumLabel(value, props.fieldKey)}</NativeSelectOption>)}
      </NativeSelect>
      {props.suggestion ? <span className="mt-1 block text-xs font-normal text-muted-foreground">{t("AI 建议：")}{enumLabel(props.suggestion, props.fieldKey)}</span> : null}
    </label>
  );
}

function FormTextarea(props: { fieldKey?: keyof WorkspaceForm; label: string; value: string; required?: boolean; disabled?: boolean; hint?: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-medium" data-field-key={props.fieldKey}>
      <span>{props.label}{props.required ? " *" : ""}</span>
      <Textarea className="mt-2" rows={3} value={props.value} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value)} />
      {props.hint ? <span className="mt-1 block text-xs font-normal text-muted-foreground">{props.hint}</span> : null}
    </label>
  );
}

function FormTagPicker(props: {
  fieldKey?: keyof WorkspaceForm;
  label: string;
  values: readonly string[];
  selected: string[];
  labels?: Record<string, string>;
  suggestion?: string[];
  disabled?: boolean;
  onChange: (value: string, checked: boolean) => void;
}) {
  return (
    <fieldset className="min-w-0 rounded-md border p-3" data-field-key={props.fieldKey}>
      <legend className="px-1 text-sm font-medium">{props.label} <span className="font-normal text-muted-foreground">{t("（最多 8 个）")}</span></legend>
      {props.suggestion?.length ? (
        <p className="mb-3 text-xs text-muted-foreground">{t("AI 建议：")}{props.suggestion.map((value) => (props.labels?.[value] ? t(props.labels[value]) : enumLabel(value))).join("、")}</p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {props.values.map((value) => {
          const checked = props.selected.includes(value);
          const atLimit = props.selected.length >= 8 && !checked;
          return (
            <label key={value} className="flex min-h-9 items-center gap-2 text-sm">
              <Checkbox disabled={props.disabled || atLimit} checked={checked} onCheckedChange={(next) => props.onChange(value, next === true)} />
              <span>{props.labels?.[value] ? t(props.labels[value]) : enumLabel(value)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function SafeProductImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <div className="text-sm text-muted-foreground">{t("图片缺失")}</div>;
  return <img src={src} alt={alt} className="size-full object-contain" onError={() => setFailed(true)} />;
}

function StatusMessage({ tone, children }: { tone: "danger" | "neutral"; children: ReactNode }) {
  return <div className={cn("rounded-md border px-4 py-3 text-sm", tone === "danger" ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted/40 text-muted-foreground")}>{children}</div>;
}

function buildImageTabs(comparison: ProductImageComparisonResponse | null, product: ProductRecord | null): ImageTab[] {
  const labels: Record<string, string> = isShoeCategory(stringValue(product?.category))
    ? { FRONT: t("整双原图"), BACK: t("侧面原图"), DETAIL: t("鞋底原图"), LABEL: t("尺码标原图"), DEFECT: t("瑕疵原图") }
    : { FRONT: t("正面原图"), BACK: t("背面原图"), LABEL: t("标签原图"), DETAIL: t("细节原图"), DEFECT: t("瑕疵原图") };
  return Object.entries(labels).flatMap(([type, label]) => {
    const source = product?.images?.find((item) => item.type === type && (!item.variant || item.variant === "ORIGINAL"));
    if (!source?.publicUrl) return [];
    return [{ key: `original-${type}`, label, url: source.publicUrl.startsWith("/") ? `${API_PROXY_URL}${source.publicUrl}` : source.publicUrl, imageId: source.id, selectable: false, selected: false }];
  });
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
    const measurement = measurements.find((item) => item.measurementType === type);
    const raw = measurement?.finalValueCm;
    return raw == null ? "" : String(raw);
  };
  return normalizeWorkspaceForm({
    ...base,
    insoleLengthCm: String(measurements.find((item) => item.measurementType === "INSOLE_LENGTH")?.finalValueCm ?? ""),
    lengthCm: value("LENGTH"),
    chestWidthCm: value("CHEST_WIDTH"),
    shoulderWidthCm: value("SHOULDER_WIDTH"),
    sleeveLengthCm: value("SLEEVE_LENGTH"),
    waistCm: value("WAIST"),
    hipCm: value("HIP"),
    thighWidthCm: value("THIGH_WIDTH"),
    legOpeningCm: value("LEG_OPENING"),
    inseamCm: value("INSEAM"),
    defects: product.defects?.length ? product.defects.map((defect) => defect.description).filter(Boolean).join("; ") : isShoeCategory(base.category) ? "" : "None"
  });
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

function aiArraySuggestion(output: JsonRecord | null, key: string) {
  const field = output?.[key];
  if (!field || typeof field !== "object" || Array.isArray(field)) return [];
  const value = (field as JsonRecord).value;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function focusValidationIssue(
  issue: ReturnType<typeof calibrationValidationIssues>[number] | undefined,
  imagePanel: HTMLDivElement | null
) {
  if (!issue) return;
  if (issue.field === "photo") {
    imagePanel?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const wrapper = document.querySelector<HTMLElement>(`[data-field-key="${issue.field}"]`);
  wrapper?.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => wrapper?.querySelector<HTMLElement>("input, select, textarea, [role=checkbox]")?.focus(), 250);
}

const ENUM_LABELS: Record<string, string> = {
  KIDS: "童装", PANTS: "长裤", JACKETS: "外套", DRESSES: "连衣裙与半身裙", LADY_TOPS: "女士上衣", SHIRTS: "衬衫", TSHIRTS: "T恤", SHORT: "短裤", TWO_PIECE: "两件套", SHOES: "鞋", BAG: "包", OTHERS: "其他配饰", TEXTILE: "家纺", OTHER: "其他",
  KIDS_DRESS: "童装裙", KIDS_JACKET_TOP: "童装外套与上衣", KIDS_PANTS: "童装裤", NEWBORN: "新生儿服装", MEN_JEANS: "男士牛仔裤", LADIES_PANTS_MIX: "女士裤", SWEAT_PANTS: "运动裤", CARGO_PANTS: "工装裤", OFFICIAL_PANTS: "正装裤", MEN_JACKETS: "男士外套", THICK_VEST: "厚马甲", LADIES_JACKETS: "女士外套", UNISEX_JACKETS: "中性外套", HOODIES: "连帽卫衣", SWEATSHIRTS: "卫衣", DENIM_JACKETS: "牛仔外套", LONG_DRESSES: "长裙", SHORT_DRESSES_SKIRTS: "短裙与半身裙", OFFICIAL_TOPS: "正装上衣", FANCY_TOPS: "时尚上衣", SHORT_SHIRTS: "短袖衬衫", LONG_SHIRTS: "长袖衬衫", TSHIRT: "T恤", SHORT_PANTS: "短裤", LONG_TWO_PIECE: "长款两件套", SHORT_TWO_PIECE: "短款两件套", MEN_SPORT_SHOES: "男士运动鞋", MEN_SHOES: "男鞋", LADIES_SHOES: "女鞋", KIDS_SHOES: "童鞋", OFFICIAL_SHOES: "正装鞋", LADIES_BAGS: "女包", SCHOOL_BAGS: "书包", PACKAGE_BAGS: "包装袋", HATS_CAPS: "帽子", SCARFS: "围巾", BODY_SHAPERS: "塑身衣", INNER_WARES: "内衣", BEDSHEETS: "床单", LIGHT_BLANKETS: "薄毯",
  KNITWEAR: "毛衣与针织衫", SUITS: "西装套装", TRACKSUITS: "运动套装", KIDS_SHORTS: "童装短裤", KIDS_SETS: "童装套装", KIDS_PYJAMAS: "童装睡衣", TRAVEL_BAG: "旅行包", WALLET: "钱包与卡包", BELTS: "腰带", SUNGLASSES: "太阳镜", WATCHES: "手表", JEWELLERY: "首饰", HAIR_ACCESSORIES: "发饰", GLOVES: "手套", SWIMWEAR: "泳装", CURTAINS: "窗帘", KIDS_TOPS: "童装上衣", KIDS_HOODIES: "童装连帽卫衣", KIDS_SKIRTS: "童装半身裙", WOMEN_JEANS: "女士牛仔裤", LEGGINGS: "打底裤", WIDE_LEG_PANTS: "阔腿裤", BLAZERS: "西装外套", PUFFER_JACKETS: "羽绒或棉服", WINDBREAKERS: "防风外套", RAIN_JACKETS: "雨衣外套", COATS: "大衣", CARDIGANS: "开衫", MIDI_DRESSES: "中长连衣裙", MINI_DRESSES: "短连衣裙", MAXI_SKIRTS: "长款半身裙", MIDI_SKIRTS: "中长半身裙", MINI_SKIRTS: "短款半身裙", JUMPSUITS: "连体裤", BLOUSES: "女式衬衣", TANK_TOPS: "背心上衣", CROP_TOPS: "短款上衣", SWEATERS: "毛衣", POLO_SHIRTS: "Polo衫", BASIC_TSHIRT: "基础T恤", GRAPHIC_TSHIRT: "印花T恤", DENIM_SHORTS: "牛仔短裤", CARGO_SHORTS: "工装短裤", SPORTS_SHORTS: "运动短裤",
  COTTON: "棉", COTTON_BLEND: "棉混纺", POLYESTER: "聚酯纤维", WOOL: "羊毛", WOOL_BLEND: "羊毛混纺", LINEN: "亚麻", VISCOSE_RAYON: "粘胶/人造丝", NYLON: "尼龙", LEATHER: "真皮", FAUX_LEATHER: "人造革", SILK: "真丝", SATIN: "缎面", FLEECE: "抓绒", VELVET: "天鹅绒", KNIT: "针织", ACRYLIC: "腈纶", SPANDEX_BLEND: "弹力混纺", LACE: "蕾丝", CHIFFON: "雪纺", CANVAS: "帆布", CORDUROY: "灯芯绒", MIXED: "混合面料", UNKNOWN: "无法确认",
  HOODED: "连帽", ZIP_FRONT: "前拉链", BUTTON_FRONT: "前纽扣", PULLOVER: "套头", COLLARED: "有领", V_NECK: "V领", CREW_NECK: "圆领", TURTLENECK: "高领", POCKETS: "有口袋", CARGO_POCKETS: "工装口袋", LINED: "有内衬", REVERSIBLE: "双面穿", WATER_RESISTANT: "防泼水", INSULATED: "保暖填充", LIGHTWEIGHT: "轻量", HIGH_WAIST: "高腰", ELASTIC_WAIST: "松紧腰", DRAWSTRING_WAIST: "抽绳腰", STRAIGHT_LEG: "直筒", WIDE_LEG: "阔腿", SKINNY_FIT: "紧身", FLARED: "喇叭型", CROPPED: "短款", MIDI_LENGTH: "中长款", MAXI_LENGTH: "长款", MINI_LENGTH: "短款长度", GRAPHIC_PRINT: "图案印花", EMBROIDERED: "刺绣", BEADED: "珠饰", CASUAL: "休闲", FORMAL: "正装", SPORTS: "运动", OUTDOOR: "户外", MATERNITY: "孕妇装",
  WOMEN: "女士", MEN: "男士", UNISEX: "中性", NOT_APPLICABLE: "不适用", BABY_0_12M: "婴儿 0-12月", TODDLER_1_3Y: "幼儿 1-3岁", PRESCHOOL_3_5Y: "学龄前 3-5岁", KIDS_6_8Y: "儿童 6-8岁", KIDS_9_12Y: "儿童 9-12岁", TEEN_13_16Y: "青少年 13-16岁",
  BLACK: "黑色", WHITE: "白色", OFF_WHITE: "米白", GREY: "灰色", BROWN: "棕色", BEIGE: "米色", CREAM: "奶油色", TAN: "棕褐色", KHAKI: "卡其色", RED: "红色", MAROON: "栗色", BURGUNDY: "酒红", ORANGE: "橙色", CORAL: "珊瑚色", PEACH: "桃色", YELLOW: "黄色", MUSTARD: "芥末黄", GREEN: "绿色", LIGHT_GREEN: "浅绿", DARK_GREEN: "深绿", OLIVE: "橄榄绿", BLUE: "蓝色", LIGHT_BLUE: "浅蓝", DARK_BLUE: "深蓝", NAVY: "藏青", DENIM: "牛仔蓝", TEAL: "蓝绿色", TURQUOISE: "青绿色", PURPLE: "紫色", LILAC: "丁香紫", PINK: "粉色", GOLD: "金色", SILVER: "银色", MULTICOLOR: "多色",
  SOLID: "纯色", STRIPED: "条纹", CHECKED: "格纹", FLORAL: "花卉", GRAPHIC: "图案印花", POLKA_DOT: "波点", ANIMAL_PRINT: "动物纹", ABSTRACT: "抽象图案", SLEEVELESS: "无袖", THREE_QUARTER: "七分袖", LONG: "长袖",
  LIKE_NEW: "近全新", EXCELLENT: "成色优秀", GOOD: "成色良好", FAIR: "有明显使用痕迹"
};

function enumLabel(value: string, fieldKey = "") {
  if (value === "SHORT") return fieldKey === "sleeveType" ? t("短袖") : t("短裤");
  return t(ENUM_LABELS[value] ?? value.replaceAll("_", " "));
}

function errorMessage(value: unknown, fallback: string) {
  return value instanceof Error ? value.message : fallback;
}
