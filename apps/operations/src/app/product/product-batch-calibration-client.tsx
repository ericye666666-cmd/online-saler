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
  PRODUCT_AI_PROMPT_VERSION,
  PRODUCT_CATEGORY_OPTIONS,
  PRODUCT_FABRIC_WEIGHTS,
  PRODUCT_FIT_TYPES,
  PRODUCT_MATERIAL_OPTIONS,
  PRODUCT_STRETCH_LEVELS,
  PRODUCT_SUBCATEGORIES_BY_CATEGORY,
  PRODUCT_TAG_OPTIONS,
  type BackgroundRemovalMode,
  type ImageProcessingJobRecord,
  type ImageProcessingOperation,
  type ProductImageComparisonResponse,
  type ProductImageVariantRecord
} from "@online-saler/shared-types";
import { recommendPlatformSize, recommendUkSize } from "@online-saler/business-rules";
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
  stringValue,
  type JsonRecord,
  type WorkspaceForm
} from "../operations-workspace-flow";
import { GarmentMeasurementGuide } from "./garment-measurement-guide";
import { cutoutQualityWarning } from "./image-processing-quality";
import { ManualCutoutEditor, type GuidedCutoutPoint } from "./manual-cutout-editor";
import { ManualMeasurementEditor } from "./manual-measurement-editor";
import {
  aiMeasurementSeed,
  calibrationLinePayload,
  manualMeasurementValueUpdates,
  type ManualMeasurementLine
} from "./manual-measurement-lines";
import { manualMeasurementAction, resolveCalibrationProductIndex } from "./product-factory-batch-display";
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

async function uploadManualCutout(
  productId: string,
  sourceImageId: string,
  image: Blob,
  adminUserId: string
) {
  const response = await fetch(
    `${API_PROXY_URL}/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(sourceImageId)}/manual-cutout`,
    {
      method: "POST",
      headers: { "Content-Type": "image/png", "X-Admin-User-Id": adminUserId },
      body: image
    }
  );
  const body = await response.json().catch(() => ({})) as { message?: unknown } & Partial<ImageProcessingJobRecord>;
  if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "无法保存修正版抠图。");
  if (body.status !== "SUCCEEDED" || !body.outputImageId) throw new Error("修正版抠图没有正确保存。");
  return body as ImageProcessingJobRecord;
}

async function runGuidedCutout(
  productId: string,
  sourceImageId: string,
  points: GuidedCutoutPoint[],
  adminUserId: string
) {
  return request<ImageProcessingJobRecord>(
    `/products/${productId}/images/${sourceImageId}/guided-cutout`,
    {
      method: "POST",
      headers: { "X-Admin-User-Id": adminUserId },
      body: JSON.stringify({ points })
    }
  );
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
  const [activeImage, setActiveImage] = useState("optimized");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [manualEditorOpen, setManualEditorOpen] = useState(false);
  const [manualMeasurementEditorOpen, setManualMeasurementEditorOpen] = useState(false);
  const [manualMeasurementLines, setManualMeasurementLines] = useState<ManualMeasurementLine[]>([]);
  const [formProductId, setFormProductId] = useState("");
  const [platformSizeManuallyEdited, setPlatformSizeManuallyEdited] = useState(false);
  const [ukSizeManuallyEdited, setUkSizeManuallyEdited] = useState(false);

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    const loaded = await loadBatch(batchId, ids.adminUserId);
    setBatch(loaded);
    setCurrentIndex(resolveCalibrationProductIndex(loaded.products, initialProductId ?? "", isCalibratable));
  }, [batchId, ids.adminUserId, initialProductId]);

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
  const measurementDraftKey = product ? `operations.product.calibration.measurement-lines.${product.id}` : "";

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
    const saved = localStorage.getItem(`operations.product.calibration.draft.${product.id}`);
    let nextForm = baseForm;
    let savedSizeLabel = "";
    let savedUkSizeLabel = "";
    if (saved) {
      try {
        const savedForm = JSON.parse(saved) as Partial<WorkspaceForm>;
        nextForm = { ...baseForm, ...savedForm };
        savedSizeLabel = typeof savedForm.sizeLabel === "string" ? savedForm.sizeLabel : "";
        savedUkSizeLabel = typeof savedForm.ukSizeLabel === "string" ? savedForm.ukSizeLabel : "";
      } catch {
        localStorage.removeItem(`operations.product.calibration.draft.${product.id}`);
      }
    }
    setForm(nextForm);
    setFormProductId(product.id);
    setPlatformSizeManuallyEdited(Boolean(stringValue(product.finalSizeLabel) || savedSizeLabel));
    setUkSizeManuallyEdited(Boolean(stringValue(product.ukSizeLabel) || savedUkSizeLabel));
    const persistedLines = manualLinesFromProduct(product, measurementFields(baseForm));
    const savedLines = localStorage.getItem(`operations.product.calibration.measurement-lines.${product.id}`);
    setManualMeasurementLines(savedLines ? parseManualMeasurementLines(savedLines, persistedLines) : persistedLines);
    void loadComparison(product.id, ids.adminUserId)
      .then((value) => {
        setComparison(value);
        setActiveImage(
          value.optimizedBalancedMain
            ? "balanced"
            : value.optimizedMain
              ? "optimized"
              : "original"
        );
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

  const latestRemovalJob = comparison?.jobs.find((job) =>
    job.operation === "REMOVE_BACKGROUND" && job.sourceImageId === comparison.original?.imageId
  ) ?? null;
  const cutoutWarning = latestRemovalJob ? cutoutQualityWarning(latestRemovalJob) : null;
  const imageTabs = useMemo(
    () => buildImageTabs(product, comparison),
    [comparison, product]
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
  const platformSizeRecommendation = useMemo(() => recommendPlatformSize({
    category: form.category,
    subcategory: form.subcategory,
    audience: form.audience,
    kidsAgeRange: form.kidsAgeRange,
    fitType: form.fitType,
    sleeveType: form.sleeveType,
    tags: form.tags,
    measurements: {
      lengthCm: form.lengthCm,
      chestWidthCm: form.chestWidthCm,
      shoulderWidthCm: form.shoulderWidthCm,
      sleeveLengthCm: form.sleeveLengthCm,
      waistCm: form.waistCm,
      hipCm: form.hipCm
    }
  }), [
    form.audience,
    form.category,
    form.chestWidthCm,
    form.fitType,
    form.hipCm,
    form.kidsAgeRange,
    form.lengthCm,
    form.shoulderWidthCm,
    form.sleeveLengthCm,
    form.sleeveType,
    form.subcategory,
    form.tags,
    form.waistCm
  ]);
  const platformSizeBasis = platformSizeRecommendation
    ? platformSizeRecommendation.measurementsUsed.map(platformSizeMeasurementText).join("、")
    : "";
  const ukSizeRecommendation = useMemo(() => recommendUkSize({
    platformSize: form.sizeLabel || platformSizeRecommendation?.size,
    category: form.category,
    subcategory: form.subcategory,
    audience: form.audience,
    kidsAgeRange: form.kidsAgeRange,
    measurements: { waistCm: form.waistCm }
  }), [
    form.audience,
    form.category,
    form.kidsAgeRange,
    form.sizeLabel,
    form.subcategory,
    form.waistCm,
    platformSizeRecommendation?.size
  ]);
  const measurementAction = manualMeasurementAction(
    product?.status ?? "",
    Boolean(comparison?.original?.publicUrl)
  );
  const taxonomyLabels = useMemo(() => taxonomyLabelMap(taxonomy), [taxonomy]);
  const materialLabels = useMemo(
    () => ({ ...taxonomyLabels, DENIM: taxonomyLabels.DENIM ?? "牛仔布" }),
    [taxonomyLabels]
  );
  const categoryOptions = activeValues(taxonomy, "CATEGORY", PRODUCT_CATEGORY_OPTIONS, form.category);
  const visibleMeasurementFields = measurementFields(form);
  const measurementSuggestions = visibleMeasurementFields.map((field) => ({
    ...field,
    ...aiMeasurementSuggestion(product, aiOutput, field.type, field.key)
  }));
  const measurementKeySignature = measurementSuggestions.map((item) => item.key).join("|");
  const measurementOriginalImageId = comparison?.original?.imageId ?? newestImage(product, "FRONT")?.id ?? "";
  const aiMeasurement = useMemo(
    () => aiMeasurementSeed(
      aiOutput,
      measurementOriginalImageId,
      measurementKeySignature.split("|").filter(Boolean)
    ),
    [aiOutput, measurementKeySignature, measurementOriginalImageId]
  );
  const hasAiMeasurements = measurementSuggestions.some((item) => Boolean(item.aiValue));
  const requiredMeasurementKeys = new Set(measurementRequirements(form).map((item) => item.key));
  const colorOptions = activeValues(taxonomy, "COLOR", AI_COLORS, form.color);
  const sizeOptions = activeValues(taxonomy, "SIZE", ["XS", "S", "M", "L", "XL", "XXL"], form.sizeLabel);
  const conditionOptions = activeValues(taxonomy, "CONDITION", ["LIKE_NEW", "EXCELLENT", "GOOD", "FAIR"], form.conditionGrade);
  const materialOptions = activeValues(taxonomy, "MATERIAL", PRODUCT_MATERIAL_OPTIONS, form.material);
  const tagOptions = activeValues(taxonomy, "TAG", PRODUCT_TAG_OPTIONS);
  const subcategoryOptions = taxonomy
    ? activeSubcategories(taxonomy, form.category, form.subcategory)
    : subcategoriesFor(form.category, form.subcategory);

  useEffect(() => {
    if (
      !product ||
      formProductId !== product.id ||
      readOnly ||
      platformSizeManuallyEdited ||
      !platformSizeRecommendation
    ) return;
    setForm((current) => current.sizeLabel === platformSizeRecommendation.size
      ? current
      : { ...current, sizeLabel: platformSizeRecommendation.size });
  }, [formProductId, platformSizeManuallyEdited, platformSizeRecommendation, product, readOnly]);

  useEffect(() => {
    if (
      !product ||
      formProductId !== product.id ||
      readOnly ||
      ukSizeManuallyEdited ||
      !ukSizeRecommendation
    ) return;
    setForm((current) => current.ukSizeLabel === ukSizeRecommendation.size
      ? current
      : { ...current, ukSizeLabel: ukSizeRecommendation.size });
  }, [formProductId, product, readOnly, ukSizeManuallyEdited, ukSizeRecommendation]);

  function updateForm(key: Exclude<keyof WorkspaceForm, "tags">, value: string) {
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

  function updateTags(tag: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      tags: checked
        ? [...new Set([...current.tags, tag])].slice(0, 8)
        : current.tags.filter((value) => value !== tag)
    }));
    setNotice("");
  }

  function useMeasuredPlatformSize() {
    if (!platformSizeRecommendation) return;
    setPlatformSizeManuallyEdited(false);
    updateForm("sizeLabel", platformSizeRecommendation.size);
  }

  function useRecommendedUkSize() {
    if (!ukSizeRecommendation) return;
    setUkSizeManuallyEdited(false);
    updateForm("ukSizeLabel", ukSizeRecommendation.size);
  }

  function saveDraft() {
    if (!draftKey) return;
    localStorage.setItem(draftKey, JSON.stringify(form));
    if (measurementDraftKey) localStorage.setItem(measurementDraftKey, JSON.stringify(manualMeasurementLines));
    setNotice("草稿已保存在本机，可稍后继续。");
  }

  function applyManualMeasurementLines(
    manualLines: ManualMeasurementLine[],
    resolvedLines: ManualMeasurementLine[]
  ) {
    setManualMeasurementLines(manualLines);
    const updates = manualMeasurementValueUpdates(resolvedLines, measurementSuggestions.map((item) => item.key));
    setForm((current) => ({ ...current, ...updates }));
    setNotice("人工连线厘米值已写入尺寸字段，请检查后保存本件。");
  }

  async function openManualMeasurementCalibration() {
    if (!product || !measurementAction) return;
    if (measurementAction === "EDIT") {
      setManualMeasurementEditorOpen(true);
      return;
    }
    if (!window.confirm("本件已完成校准。重新编辑测量线会将它退回待人工校准，保存后才能继续生成 Barcode。是否继续？")) return;

    setBusy("reopen-measurements");
    setError("");
    setNotice("");
    try {
      const updatedProduct = await request<ProductRecord>(
        `/operations/product-batches/products/${product.id}/recalibration`,
        {
          method: "POST",
          body: JSON.stringify({
            ...ids,
            reason: "修正人工测量定位"
          })
        }
      );
      setBatch((current) => current ? {
        ...current,
        products: current.products.map((item) => item.id === updatedProduct.id ? updatedProduct : item)
      } : current);
      setNotice("本件已退回待人工校准。请重新连接测量起点和终点，然后保存本件。");
      setManualMeasurementEditorOpen(true);
    } catch (caught) {
      setError(errorMessage(caught, "无法重新打开本件测量校准。"));
    } finally {
      setBusy("");
    }
  }

  async function saveAndNext() {
    if (!product || readOnly) return;
    if (cutoutWarning) {
      setError("抠图尚未通过质量检查。请手工修边或标记重拍后再继续。");
      imagePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
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
      const measurementKeys = new Map(visibleMeasurementFields.map((field) => [field.type, field.key]));
      const measurements = calibrationBody.measurements.map((measurement) => {
        const key = measurementKeys.get(measurement.type);
        const line = manualMeasurementLines.find((item) => item.key === key);
        return line ? { ...measurement, manualLine: calibrationLinePayload(line) } : measurement;
      });
      await request(`/products/${product.id}/calibrate`, {
        method: "POST",
        body: JSON.stringify({
          ...calibrationBody,
          measurements,
          adminUserId: ids.adminUserId
        })
      });
      if (draftKey) localStorage.removeItem(draftKey);
      if (measurementDraftKey) localStorage.removeItem(measurementDraftKey);
      const updated = await loadBatch(batchId, ids.adminUserId);
      setBatch(updated);
      const next = updated.products.findIndex((item, index) => index > currentIndex && isCalibratable(item));
      const firstPending = updated.products.findIndex(isCalibratable);
      if (next >= 0) setCurrentIndex(next);
      else if (firstPending >= 0) setCurrentIndex(firstPending);
      else setCurrentIndex(Math.min(currentIndex, updated.products.length - 1));
      if (firstPending >= 0 || next >= 0) {
        setNotice("已确认，进入下一件。");
      } else {
        setBusy("finalize");
        setNotice(`本批 ${updated.targetCount} 件已确认，正在自动生成销售详情与 Barcode。`);
        const [detailResult, barcodeResult] = await Promise.allSettled([
          request(`/operations/product-batches/${batchId}/detail-generation/run`, {
            method: "POST",
            headers: { "X-Admin-User-Id": ids.adminUserId },
            body: JSON.stringify({}),
            keepalive: true
          }),
          request(`/operations/product-batches/${batchId}/generate-barcodes`, {
            method: "POST",
            body: JSON.stringify(ids)
          })
        ]);
        if (barcodeResult.status === "rejected") throw barcodeResult.reason;
        if (detailResult.status === "rejected") {
          sessionStorage.setItem(
            `product-factory-notice:${batchId}`,
            "Barcode 已生成；个别销售详情生成失败，可在异常确认阶段重试，不会重复生成旧资产。"
          );
        }
        router.push(`/product/barcode?batchId=${encodeURIComponent(batchId)}`);
      }
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
      const warning = cutoutQualityWarning(cutout);
      if (warning) {
        setComparison(await loadComparison(product.id, ids.adminUserId));
        setActiveImage("transparent");
        throw new Error(warning);
      }
      await Promise.all([
        (async () => {
          const white = await runImageOperation(product.id, cutout.outputImageId!, "COMPOSE_WHITE_BACKGROUND", ids.adminUserId);
          await runImageOperation(product.id, white.outputImageId!, "OPTIMIZE_MAIN_IMAGE", ids.adminUserId);
        })(),
        runImageOperation(product.id, cutout.outputImageId!, "OPTIMIZE_BALANCED_MAIN_IMAGE", ids.adminUserId)
      ]);
      const updated = await loadComparison(product.id, ids.adminUserId);
      setComparison(updated);
      setActiveImage("balanced");
      const modeLabel = mode === "auto"
        ? "自动抠图链路"
        : mode === "rembg_birefnet"
          ? "BiRefNet"
          : "lightweight OpenCV";
      setNotice(`已使用${modeLabel}重新处理。请确认抠图边缘和白底结果；商城主图将在详情生成阶段选择。`);
    } catch (caught) {
      setError(errorMessage(caught, "图片处理失败。"));
    } finally {
      setBusy("");
    }
  }

  async function rerunBalancedMain() {
    if (!product) return;
    const sourceId = comparison?.cutoutTransparent?.imageId;
    if (!sourceId) {
      setError("请先生成并确认透明抠图。");
      return;
    }
    setBusy("balanced-main");
    setError("");
    setNotice("");
    try {
      await runImageOperation(
        product.id,
        sourceId,
        "OPTIMIZE_BALANCED_MAIN_IMAGE",
        ids.adminUserId
      );
      setComparison(await loadComparison(product.id, ids.adminUserId));
      setActiveImage("balanced");
      setNotice("白底均整图已使用当前透明抠图重新生成。请检查袖口、衣摆和服装轮廓。");
    } catch (caught) {
      setError(errorMessage(caught, "无法重新生成均整版。"));
    } finally {
      setBusy("");
    }
  }

  async function saveManualCorrection(image: Blob) {
    if (!product || !comparison?.original?.imageId) return;
    setBusy("manual-cutout");
    setError("");
    setNotice("");
    try {
      const cutout = await uploadManualCutout(
        product.id,
        comparison.original.imageId,
        image,
        ids.adminUserId
      );
      await Promise.all([
        (async () => {
          const white = await runImageOperation(product.id, cutout.outputImageId!, "COMPOSE_WHITE_BACKGROUND", ids.adminUserId);
          await runImageOperation(product.id, white.outputImageId!, "OPTIMIZE_MAIN_IMAGE", ids.adminUserId);
        })(),
        runImageOperation(product.id, cutout.outputImageId!, "OPTIMIZE_BALANCED_MAIN_IMAGE", ids.adminUserId)
      ]);
      const updated = await loadComparison(product.id, ids.adminUserId);
      setComparison(updated);
      setActiveImage("balanced");
      setManualEditorOpen(false);
      setNotice("修正版已保存，并重新生成白底图与两版白底优化图。请检查边缘和商品细节。");
    } catch (caught) {
      throw new Error(errorMessage(caught, "无法保存修正版抠图。"));
    } finally {
      setBusy("");
    }
  }

  async function saveGuidedCorrection(points: GuidedCutoutPoint[]) {
    if (!product || !comparison?.original?.imageId) return;
    setBusy("guided-cutout");
    setError("");
    setNotice("");
    try {
      const cutout = await runGuidedCutout(
        product.id,
        comparison.original.imageId,
        points,
        ids.adminUserId
      );
      if (cutout.status !== "SUCCEEDED" || !cutout.outputImageId) {
        throw new Error(cutout.errorMessage || "按轮廓自动抠图失败。");
      }
      await Promise.all([
        (async () => {
          const white = await runImageOperation(product.id, cutout.outputImageId!, "COMPOSE_WHITE_BACKGROUND", ids.adminUserId);
          await runImageOperation(product.id, white.outputImageId!, "OPTIMIZE_MAIN_IMAGE", ids.adminUserId);
        })(),
        runImageOperation(product.id, cutout.outputImageId!, "OPTIMIZE_BALANCED_MAIN_IMAGE", ids.adminUserId)
      ]);
      const updated = await loadComparison(product.id, ids.adminUserId);
      setComparison(updated);
      setActiveImage("balanced");
      setManualEditorOpen(false);
      setNotice("已按员工点选轮廓重新抠图，并生成白底图与两版白底优化图。请检查边缘和商品细节。");
    } catch (caught) {
      throw new Error(errorMessage(caught, "按轮廓自动抠图失败，请调整轮廓后重试。"));
    } finally {
      setBusy("");
    }
  }

  async function rerunAiMeasurements() {
    if (!product) return;
    const imageIds = (product.images ?? []).map((image) => image.id).filter(Boolean);
    if (!imageIds.length) {
      setError("请先上传商品照片。");
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
      setNotice("AI 商品识别与测量已更新，请对照尺寸示意确认。 ");
    } catch (caught) {
      setError(errorMessage(caught, "AI 测量失败。"));
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
      if (measurementDraftKey) localStorage.removeItem(measurementDraftKey);
      router.push(`/product/batches/${encodeURIComponent(batchId)}/upload?productId=${encodeURIComponent(product.id)}`);
    } catch (caught) {
      setError(errorMessage(caught, "无法标记重拍。"));
      setBusy("");
    }
  }

  if (!batch || !product) {
    return <StatusMessage tone={error ? "danger" : "neutral"}>{error || "正在读取校准工作台..."}</StatusMessage>;
  }

  const allComplete = completedCount === batch.targetCount;
  const finalPendingItem = !readOnly && completedCount === batch.targetCount - 1;

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-20 lg:pb-6">
      <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link href={`/product/batches/${encodeURIComponent(batch.id)}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-3" />返回批次
          </Link>
          <h1 className="mt-2 truncate text-2xl font-semibold tracking-normal">{batch.batchCode} · 第 3 步：异常确认并发布</h1>
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
          <span className="flex items-center gap-2 font-medium"><CheckCircle2Icon className="size-5" />本批 {batch.targetCount} 件已完成最终确认</span>
          <Button asChild><Link href={`/product/barcode?batchId=${encodeURIComponent(batch.id)}`}>继续打印和发布<ArrowRightIcon data-icon="inline-end" /></Link></Button>
        </div>
      ) : null}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,55fr)_minmax(420px,45fr)]">
        <section className="min-w-0 space-y-3" aria-label="商品图片校准">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">图片确认</h2>
              <p className="text-xs text-muted-foreground">原图永久保留；AI 陈列图已按默认风格生成并选为候选主图。这里只核对商品事实与异常，不再要求员工选择风格。</p>
            </div>
            {cutoutWarning ? <Badge variant="destructive">需要图片异常处理</Badge> : <Badge variant="secondary">自动图片处理通过</Badge>}
          </div>

          {cutoutWarning ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <p className="font-semibold">抠图未通过，已禁止继续使用这张处理图</p>
              <p className="mt-1 text-xs">{cutoutWarning}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void processImages("auto")} disabled={Boolean(busy) || readOnly}>
                  {busy === "auto" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}自动重试抠图
                </Button>
                <Button size="sm" onClick={() => setManualEditorOpen(true)} disabled={Boolean(busy) || !comparison?.original?.publicUrl}><ScissorsIcon data-icon="inline-start" />点选轮廓重新抠图</Button>
                <Button size="sm" variant="outline" onClick={() => void markRetake()} disabled={Boolean(busy) || readOnly}><RotateCcwIcon data-icon="inline-start" />无法修复，标记重拍</Button>
              </div>
            </div>
          ) : null}

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
            <Button size="sm" variant="outline" disabled={!currentImage?.url} onClick={() => void imagePanelRef.current?.requestFullscreen()}><ExpandIcon data-icon="inline-start" />全屏</Button>
            {currentImage?.url ? <Button asChild size="sm" variant="outline"><a href={currentImage.url} target="_blank" rel="noreferrer" download><DownloadIcon data-icon="inline-start" />下载</a></Button> : null}
            {!readOnly && !cutoutWarning && comparison?.original?.publicUrl ? (
              <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void processImages("auto")}>
                {busy === "auto" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}重新自动抠图
              </Button>
            ) : null}
            {!readOnly && comparison?.original?.publicUrl ? (
              <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => setManualEditorOpen(true)}>
                <ScissorsIcon data-icon="inline-start" />抠图不对，手动修正
              </Button>
            ) : null}
          </div>

          {latestRemovalJob ? <ProcessingSummary job={latestRemovalJob} warning={cutoutWarning} /> : <StatusMessage tone="neutral">还没有图片处理记录。</StatusMessage>}
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold">商品信息</h2>
              <p className="text-xs text-muted-foreground">字段中的内容是最终值；下方灰字保留 AI 建议，人工修改不会覆盖 AI 原始记录。</p>
            </div>
            {!readOnly ? (
              <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void rerunAiMeasurements()}>
                {busy === "ai-measurements" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <WandSparklesIcon data-icon="inline-start" />}
                重新 AI 识别与测量
              </Button>
            ) : null}
          </div>

          <FormInput fieldKey="title" label="标题" value={form.title} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "title")} onChange={(value) => updateForm("title", value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect fieldKey="category" label="分类" value={form.category} values={categoryOptions} labels={taxonomyLabels} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "category")} onChange={(value) => updateForm("category", value)} />
            <FormSelect fieldKey="subcategory" label="子分类" value={form.subcategory} values={subcategoryOptions} labels={taxonomyLabels} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "subcategory")} onChange={(value) => updateForm("subcategory", value)} />
            <FormSelect fieldKey="audience" label="适用人群" value={form.audience} values={AI_AUDIENCES} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "audience")} onChange={(value) => updateForm("audience", value)} />
            <FormSelect fieldKey="color" label="颜色" value={form.color} values={colorOptions} labels={taxonomyLabels} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "primaryColor")} onChange={(value) => updateForm("color", value)} />
            {form.audience === "KIDS" ? <FormSelect fieldKey="kidsAgeRange" label="儿童年龄段" value={form.kidsAgeRange} values={AI_KIDS_AGE_RANGES} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "kidsAgeRange")} onChange={(value) => updateForm("kidsAgeRange", value)} /> : null}
            <FormInput fieldKey="tagSize" label="标签尺码" value={form.tagSize} disabled={readOnly} suggestion={aiSuggestion(aiOutput, "sizeLabel")} onChange={(value) => updateForm("tagSize", value)} />
            <div className="min-w-0">
              <FormSelect
                fieldKey="sizeLabel"
                label="平台推荐尺码"
                value={form.sizeLabel}
                values={sizeOptions}
                labels={taxonomyLabels}
                required
                disabled={readOnly}
                suggestion={aiSuggestion(aiOutput, "sizeLabel")}
                onChange={(value) => {
                  setPlatformSizeManuallyEdited(true);
                  updateForm("sizeLabel", value);
                }}
              />
              {platformSizeRecommendation ? (
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal">
                  <span className={platformSizeRecommendation.requiresHumanReview ? "text-amber-700" : "text-emerald-700"}>
                    测量推荐：{platformSizeRecommendation.size}（{platformSizeBasis}）
                  </span>
                  {!platformSizeManuallyEdited && form.sizeLabel === platformSizeRecommendation.size ? (
                    <span className="text-muted-foreground">已自动填入，可人工修改</span>
                  ) : !readOnly && form.sizeLabel !== platformSizeRecommendation.size ? (
                    <Button type="button" size="sm" variant="link" className="h-auto p-0 text-xs" onClick={useMeasuredPlatformSize}>
                      采用测量推荐
                    </Button>
                  ) : null}
                  {platformSizeRecommendation.requiresHumanReview ? (
                    <span className="text-amber-700">比例存在冲突，请员工重点核对测量线和适用人群。</span>
                  ) : null}
                </div>
              ) : (
                <p className="mt-1 text-xs font-normal text-muted-foreground">
                  {platformSizePendingText(form)}
                </p>
              )}
            </div>
            <div className="min-w-0">
              <FormInput
                fieldKey="ukSizeLabel"
                label="英码"
                value={form.ukSizeLabel}
                disabled={readOnly}
                suggestion={aiSuggestion(aiOutput, "ukSizeLabel")}
                hint="例如 UK 12、UK W32 或 UK M。"
                onChange={(value) => {
                  setUkSizeManuallyEdited(true);
                  updateForm("ukSizeLabel", value);
                }}
              />
              {ukSizeRecommendation ? (
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal">
                  <span className="text-emerald-700">英码推荐：{ukSizeRecommendation.size}</span>
                  {!ukSizeManuallyEdited && form.ukSizeLabel === ukSizeRecommendation.size ? (
                    <span className="text-muted-foreground">已自动填入，可人工修改</span>
                  ) : !readOnly && form.ukSizeLabel !== ukSizeRecommendation.size ? (
                    <Button type="button" size="sm" variant="link" className="h-auto p-0 text-xs" onClick={useRecommendedUkSize}>
                      采用英码推荐
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="mb-3 text-sm font-semibold">尺寸（cm）</h3>
            <GarmentMeasurementGuide
              category={form.category}
              subcategory={form.subcategory}
              imageUrl={measurementGuideImage(imageTabs)}
              manualLines={manualMeasurementLines}
              aiLines={aiMeasurement.lines}
              onManualCalibrate={measurementAction ? () => void openManualMeasurementCalibration() : undefined}
              manualCalibrateLabel={manualMeasurementLines.length > 0
                ? "修正已有测量线"
                : aiMeasurement.lines.length > 0
                  ? "校正 AI 测量线"
                  : "打开测量板测量"}
              manualCalibrateDisabled={Boolean(busy)}
              measurements={measurementSuggestions.map((item) => ({
                key: item.key,
                label: item.label,
                value: form[item.key],
                aiValue: item.aiValue
              }))}
            />
            {!hasAiMeasurements && !readOnly ? (
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                AI 没有给出可靠厘米值。可直接用软尺实测并填写下方字段，也可打开测量板连接起点和终点，由系统按板面换算厘米。
              </div>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {measurementSuggestions.map((field) => (
                <FormInput
                  key={field.key}
                  fieldKey={field.key}
                  label={field.label}
                  value={form[field.key]}
                  required={requiredMeasurementKeys.has(field.key)}
                  inputMode="decimal"
                  disabled={readOnly}
                  suggestion={field.suggestion}
                  suggestionLabel="AI 测量"
                  onChange={(value) => updateForm(field.key, value)}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect fieldKey="conditionGrade" label="成色" value={form.conditionGrade} values={conditionOptions} labels={taxonomyLabels} required disabled={readOnly} onChange={(value) => updateForm("conditionGrade", value)} />
            <FormInput fieldKey="brand" label="品牌" value={form.brand} disabled={readOnly} suggestion={aiSuggestion(aiOutput, "brandLabel")} onChange={(value) => updateForm("brand", value)} />
            <FormInput fieldKey="priceKsh" label="价格（KSh）" value={form.priceKsh} required inputMode="numeric" disabled={readOnly} onChange={(value) => updateForm("priceKsh", value)} />
            <FormSelect fieldKey="pattern" label="图案" value={form.pattern} values={AI_PATTERNS} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "pattern")} onChange={(value) => updateForm("pattern", value)} />
            <FormSelect fieldKey="sleeveType" label="袖型" value={form.sleeveType} values={AI_SLEEVE_TYPES} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "sleeveType")} onChange={(value) => updateForm("sleeveType", value)} />
            <FormSelect fieldKey="fitType" label="版型" value={form.fitType} values={PRODUCT_FIT_TYPES} labels={FACT_LABELS} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "fitType")} onChange={(value) => updateForm("fitType", value)} />
            <FormSelect fieldKey="stretchLevel" label="弹性" value={form.stretchLevel} values={PRODUCT_STRETCH_LEVELS} labels={FACT_LABELS} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "stretchLevel")} onChange={(value) => updateForm("stretchLevel", value)} />
            <FormSelect fieldKey="fabricWeight" label="面料厚度" value={form.fabricWeight} values={PRODUCT_FABRIC_WEIGHTS} labels={FACT_LABELS} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "fabricWeight")} onChange={(value) => updateForm("fabricWeight", value)} />
            <FormSelect fieldKey="material" label="面料" value={form.material} values={materialOptions} labels={materialLabels} required disabled={readOnly} suggestion={aiSuggestion(aiOutput, "material")} onChange={(value) => updateForm("material", value)} />
          </div>

          <FormTagPicker
            fieldKey="tags"
            label="商品标签"
            values={tagOptions}
            selected={form.tags}
            labels={taxonomyLabels}
            suggestion={aiArraySuggestion(aiOutput, "tags")}
            disabled={readOnly}
            onChange={updateTags}
          />

          <FormTextarea fieldKey="defects" label="瑕疵" value={form.defects} required disabled={readOnly} hint="没有瑕疵请填写 None。" onChange={(value) => updateForm("defects", value)} />
          {reasons.length && !readOnly ? <StatusMessage tone="danger">{reasons.join(" ")}</StatusMessage> : null}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur lg:sticky lg:inset-auto lg:px-0">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          {!readOnly ? (
            <p className={cn("text-xs", cutoutWarning || validationIssues.length ? "font-medium text-destructive" : "text-emerald-700")}>
              {cutoutWarning
                ? "还差：修正抠图或标记重拍"
                : validationIssues.length
                ? `还差：${[...new Set(validationIssues.map((issue) => issue.label))].join("、")}`
                : finalPendingItem ? "最后一件确认后，系统将自动生成详情与 Barcode。" : "必填信息已完整，可以确认并进入下一件。"}
            </p>
          ) : <span />}
          <div className="grid grid-cols-3 gap-2 lg:flex">
            <Button variant="outline" disabled={Boolean(busy) || readOnly} onClick={saveDraft}><SaveIcon data-icon="inline-start" />保存草稿</Button>
            <Button disabled={Boolean(busy) || readOnly || Boolean(cutoutWarning)} onClick={() => void saveAndNext()}>
              {busy === "save" || busy === "finalize" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <CheckCircle2Icon data-icon="inline-start" />}
              {readOnly ? "本件已确认" : finalPendingItem ? "确认本件并自动生成" : "确认并下一件"}
            </Button>
            <Button variant="outline" disabled={Boolean(busy) || readOnly} onClick={() => void markRetake()}><RotateCcwIcon data-icon="inline-start" />标记重拍</Button>
          </div>
        </div>
      </div>
      <ManualCutoutEditor
        open={manualEditorOpen}
        originalUrl={comparison?.original?.publicUrl ? `${API_PROXY_URL}${comparison.original.publicUrl}` : ""}
        cutoutUrl={comparison?.cutoutTransparent?.publicUrl
          ? `${API_PROXY_URL}${comparison.cutoutTransparent.publicUrl}`
          : comparison?.original?.publicUrl
            ? `${API_PROXY_URL}${comparison.original.publicUrl}`
            : ""}
        saving={busy === "manual-cutout" || busy === "guided-cutout"}
        onOpenChange={setManualEditorOpen}
        onGuidedCutout={saveGuidedCorrection}
        onSave={saveManualCorrection}
      />
      <ManualMeasurementEditor
        open={manualMeasurementEditorOpen}
        imageUrl={comparison?.original?.publicUrl ? `${API_PROXY_URL}${comparison.original.publicUrl}` : ""}
        imageId={comparison?.original?.imageId ?? ""}
        measurements={measurementSuggestions.map((item) => ({
          key: item.key,
          label: item.label,
          value: form[item.key],
          aiValue: item.aiValue
        }))}
        initialLines={manualMeasurementLines}
        initialAiLines={aiMeasurement.lines}
        initialBoardCalibration={aiMeasurement.calibration}
        onOpenChange={setManualMeasurementEditorOpen}
        onApply={applyManualMeasurementLines}
      />
    </div>
  );
}

function ProcessingSummary({ job, warning }: { job: ImageProcessingJobRecord; warning: string | null }) {
  return (
    <div className={cn("rounded-md border p-3 text-xs", warning ? "border-destructive/40 bg-destructive/5" : "bg-muted/30")}>
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

function platformSizeMeasurementText(measurement: { type: string; value: number | string }): string {
  const label = ({
    LENGTH: "衣长",
    CHEST_WIDTH: "胸宽",
    SHOULDER_WIDTH: "肩宽",
    SLEEVE_LENGTH: "袖长",
    WAIST: "腰宽",
    HIP: "臀宽",
    KIDS_AGE_RANGE: "儿童年龄段"
  } as Record<string, string>)[measurement.type] ?? measurement.type;
  return measurement.type === "KIDS_AGE_RANGE"
    ? `${label} ${enumLabel(String(measurement.value))}`
    : `${label} ${measurement.value} cm`;
}

function platformSizePendingText(form: WorkspaceForm): string {
  if (form.audience === "KIDS" || form.category === "KIDS") return "确认儿童年龄段后自动推荐。";
  if (form.category === "PANTS" || form.category === "SHORT" || form.subcategory === "KIDS_PANTS") {
    return "确认腰宽或臀宽后自动推荐。";
  }
  if (form.category === "DRESSES") return "确认胸宽、腰宽或臀宽后自动推荐。";
  if (["TSHIRTS", "SHIRTS", "LADY_TOPS", "JACKETS", "TWO_PIECE"].includes(form.category)) {
    return "确认胸宽后自动推荐；衣长、有效肩宽和长袖袖长用于比例复核。";
  }
  return "该品类暂不自动推荐，请人工选择。";
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
      {props.suggestion ? <span className="mt-1 block text-xs font-normal text-muted-foreground">{props.suggestionLabel ?? "AI 建议"}：{props.suggestion}</span> : null}
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
        {props.required ? <NativeSelectOption value="" disabled>请选择{props.label}</NativeSelectOption> : null}
        {props.values.map((value) => <NativeSelectOption key={value} value={value}>{props.labels?.[value] ?? enumLabel(value, props.label)}</NativeSelectOption>)}
      </NativeSelect>
      {props.suggestion ? <span className="mt-1 block text-xs font-normal text-muted-foreground">AI 建议：{enumLabel(props.suggestion, props.label)}</span> : null}
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
      <legend className="px-1 text-sm font-medium">{props.label} <span className="font-normal text-muted-foreground">（最多 8 个）</span></legend>
      {props.suggestion?.length ? (
        <p className="mb-3 text-xs text-muted-foreground">AI 建议：{props.suggestion.map((value) => props.labels?.[value] ?? enumLabel(value)).join("、")}</p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {props.values.map((value) => {
          const checked = props.selected.includes(value);
          const atLimit = props.selected.length >= 8 && !checked;
          return (
            <label key={value} className="flex min-h-9 items-center gap-2 text-sm">
              <Checkbox disabled={props.disabled || atLimit} checked={checked} onCheckedChange={(next) => props.onChange(value, next === true)} />
              <span>{props.labels?.[value] ?? enumLabel(value)}</span>
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
  if (!src || failed) return <div className="text-sm text-muted-foreground">图片缺失</div>;
  return <img src={src} alt={alt} className="size-full object-contain" onError={() => setFailed(true)} />;
}

function StatusMessage({ tone, children }: { tone: "danger" | "neutral"; children: ReactNode }) {
  return <div className={cn("rounded-md border px-4 py-3 text-sm", tone === "danger" ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted/40 text-muted-foreground")}>{children}</div>;
}

function buildImageTabs(
  product: ProductRecord | null,
  comparison: ProductImageComparisonResponse | null
): ImageTab[] {
  const tabs: ImageTab[] = [
    variantTab("original", "原图", comparison?.original ?? null, false),
    variantTab("transparent", "透明抠图", comparison?.cutoutTransparent ?? null, false, true),
    variantTab("white", "白底图", comparison?.cutoutWhite ?? null, false),
    variantTab("optimized", "白底优化图", comparison?.optimizedMain ?? null, false),
    variantTab("balanced", "白底均整图", comparison?.optimizedBalancedMain ?? null, false),
    variantTab("back-original", "背面原图", comparison?.backOriginal ?? null, false),
    variantTab("back-transparent", "背面透明抠图", comparison?.backCutoutTransparent ?? null, false, true),
    variantTab("back-white", "背面白底", comparison?.backCutoutWhite ?? null, false)
  ];
  for (const [type, label] of [["LABEL", "标签"], ["DEFECT", "瑕疵"], ["DETAIL", "细节"]] as const) {
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
  const ai = normalizedAiOutput(extraction);
  const value = (type: string, fieldKey: string) => {
    const measurement = measurements.find((item) => item.measurementType === type);
    const aiField = ai?.[fieldKey];
    const aiFieldValue = aiField && typeof aiField === "object" && !Array.isArray(aiField)
      ? (aiField as JsonRecord).value
      : null;
    const raw = measurement?.finalValueCm ?? measurement?.aiValueCm ?? aiFieldValue;
    return raw == null ? "" : String(raw);
  };
  return {
    ...base,
    lengthCm: value("LENGTH", "lengthCm"),
    chestWidthCm: value("CHEST_WIDTH", "chestWidthCm"),
    shoulderWidthCm: value("SHOULDER_WIDTH", "shoulderWidthCm"),
    sleeveLengthCm: value("SLEEVE_LENGTH", "sleeveLengthCm"),
    waistCm: value("WAIST", "waistCm"),
    hipCm: value("HIP", "hipCm"),
    thighWidthCm: value("THIGH_WIDTH", "thighWidthCm"),
    legOpeningCm: value("LEG_OPENING", "legOpeningCm"),
    inseamCm: value("INSEAM", "inseamCm"),
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

function aiArraySuggestion(output: JsonRecord | null, key: string) {
  const field = output?.[key];
  if (!field || typeof field !== "object" || Array.isArray(field)) return [];
  const value = (field as JsonRecord).value;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function aiMeasurementSuggestion(
  product: ProductRecord | null,
  output: JsonRecord | null,
  measurementType: string,
  fieldKey: string
) {
  const persisted = product?.measurements?.find((item) => item.measurementType === measurementType);
  const aiField = output?.[fieldKey];
  const fieldRecord = aiField && typeof aiField === "object" && !Array.isArray(aiField) ? aiField as JsonRecord : null;
  const rawValue = persisted?.aiValueCm ?? fieldRecord?.value;
  const rawConfidence = persisted?.aiConfidence ?? fieldRecord?.confidence;
  const value = Number(rawValue);
  const confidence = Number(rawConfidence);
  if (!Number.isFinite(value) || value <= 0) return { aiValue: "", suggestion: "" };
  const aiValue = String(Math.round(value * 10) / 10);
  const confidenceText = Number.isFinite(confidence) ? ` · 置信度 ${Math.round(confidence * 100)}%` : "";
  return { aiValue, suggestion: `${aiValue} cm${confidenceText}` };
}

function measurementGuideImage(tabs: ImageTab[]) {
  return tabs.find((tab) => tab.key === "transparent" && tab.url)?.url ??
    tabs.find((tab) => tab.key === "balanced" && tab.url)?.url ??
    tabs.find((tab) => tab.key === "optimized" && tab.url)?.url ??
    tabs.find((tab) => tab.key === "white" && tab.url)?.url ??
    tabs.find((tab) => tab.key === "original" && tab.url)?.url ?? "";
}

function manualLinesFromProduct(
  product: ProductRecord,
  fields: Array<{ key: keyof WorkspaceForm; type: string }>
): ManualMeasurementLine[] {
  const keys = new Map(fields.map((field) => [field.type, String(field.key)]));
  return (product.measurements ?? []).flatMap((measurement) => {
    const key = keys.get(String(measurement.measurementType ?? ""));
    const imageId = String(measurement.manualLineImageId ?? "");
    const x1 = Number(measurement.manualLineStartX);
    const y1 = Number(measurement.manualLineStartY);
    const x2 = Number(measurement.manualLineEndX);
    const y2 = Number(measurement.manualLineEndY);
    const valueCm = Number(measurement.finalValueCm);
    if (!key || !imageId || ![x1, y1, x2, y2, valueCm].every(Number.isFinite)) return [];
    return [{
      key,
      imageId,
      valueCm: String(Math.round(valueCm * 10) / 10),
      x1: x1 * 100,
      y1: y1 * 100,
      x2: x2 * 100,
      y2: y2 * 100,
      labelX: (x1 + x2) * 50,
      labelY: Math.max(0, (y1 + y2) * 50 - 3),
      source: "MANUAL"
    }];
  });
}

function parseManualMeasurementLines(value: string, fallback: ManualMeasurementLine[]) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    const valid = parsed.filter((item): item is ManualMeasurementLine => {
      if (!item || typeof item !== "object") return false;
      const line = item as Partial<ManualMeasurementLine>;
      return typeof line.key === "string" && typeof line.imageId === "string" && typeof line.valueCm === "string" &&
        [line.x1, line.y1, line.x2, line.y2, line.labelX, line.labelY].every((coordinate) =>
          typeof coordinate === "number" && Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 100
        );
    });
    return valid.length
      ? valid.map((line) => ({ ...line, source: "MANUAL" as const }))
      : fallback;
  } catch {
    return fallback;
  }
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
  window.setTimeout(() => wrapper?.querySelector<HTMLElement>("input, select, textarea")?.focus(), 250);
}

function providerLabel(provider: string | null) {
  if (!provider) return "-";
  if (provider === "manual-guided-grabcut") return "员工轮廓引导抠图";
  if (provider === "manual-cutout-editor") return "员工手工修边";
  if (provider === "openai-image-edit") return "OpenAI 图片编辑";
  if (provider.includes("rembg") || provider.includes("birefnet")) return "rembg + BiRefNet";
  if (provider.includes("lightweight") || provider.includes("opencv")) return "lightweight OpenCV";
  return provider;
}

function operationLabel(value: string) {
  return ({ REMOVE_BACKGROUND: "去除背景", COMPOSE_WHITE_BACKGROUND: "生成白底图", OPTIMIZE_MAIN_IMAGE: "优化主图", OPTIMIZE_BALANCED_MAIN_IMAGE: "优化主图 2（均整版）", GENERATE_AI_DISPLAY_MAIN_IMAGE: "生成 AI 陈列图" } as Record<string, string>)[value] ?? value;
}

function statusLabel(value: string) {
  return ({ PENDING: "等待", RUNNING: "处理中", SUCCEEDED: "成功", FAILED: "失败" } as Record<string, string>)[value] ?? value;
}

const ENUM_LABELS: Record<string, string> = {
  KIDS: "童装", PANTS: "长裤", JACKETS: "外套", DRESSES: "连衣裙与半身裙", LADY_TOPS: "女士上衣", SHIRTS: "衬衫", TSHIRTS: "T恤", SHORT: "短裤", TWO_PIECE: "两件套", SHOES: "鞋", BAG: "包", OTHERS: "其他配饰", TEXTILE: "家纺", OTHER: "其他",
  KIDS_DRESS: "童装裙", KIDS_JACKET_TOP: "童装外套与上衣", KIDS_PANTS: "童装裤", NEWBORN: "新生儿服装", MEN_JEANS: "男士牛仔裤", LADIES_PANTS_MIX: "女士裤", SWEAT_PANTS: "运动裤", CARGO_PANTS: "工装裤", OFFICIAL_PANTS: "正装裤", MEN_JACKETS: "男士外套", THICK_VEST: "厚马甲", LADIES_JACKETS: "女士外套", UNISEX_JACKETS: "中性外套", HOODIES: "连帽卫衣", SWEATSHIRTS: "卫衣", DENIM_JACKETS: "牛仔外套", LONG_DRESSES: "长裙", SHORT_DRESSES_SKIRTS: "短裙与半身裙", OFFICIAL_TOPS: "正装上衣", FANCY_TOPS: "时尚上衣", SHORT_SHIRTS: "短袖衬衫", LONG_SHIRTS: "长袖衬衫", TSHIRT: "T恤", SHORT_PANTS: "短裤", LONG_TWO_PIECE: "长款两件套", SHORT_TWO_PIECE: "短款两件套", MEN_SPORT_SHOES: "男士运动鞋", MEN_SHOES: "男鞋", LADIES_SHOES: "女鞋", KIDS_SHOES: "童鞋", OFFICIAL_SHOES: "正装鞋", LADIES_BAGS: "女包", SCHOOL_BAGS: "书包", PACKAGE_BAGS: "包装袋", HATS_CAPS: "帽子", SCARFS: "围巾", BODY_SHAPERS: "塑身衣", INNER_WARES: "内衣", BEDSHEETS: "床单", LIGHT_BLANKETS: "薄毯",
  KIDS_TOPS: "童装上衣", KIDS_HOODIES: "童装连帽卫衣", KIDS_SKIRTS: "童装半身裙", WOMEN_JEANS: "女士牛仔裤", LEGGINGS: "打底裤", WIDE_LEG_PANTS: "阔腿裤", BLAZERS: "西装外套", PUFFER_JACKETS: "羽绒或棉服", WINDBREAKERS: "防风外套", RAIN_JACKETS: "雨衣外套", COATS: "大衣", CARDIGANS: "开衫", MIDI_DRESSES: "中长连衣裙", MINI_DRESSES: "短连衣裙", MAXI_SKIRTS: "长款半身裙", MIDI_SKIRTS: "中长半身裙", MINI_SKIRTS: "短款半身裙", JUMPSUITS: "连体裤", BLOUSES: "女式衬衣", TANK_TOPS: "背心上衣", CROP_TOPS: "短款上衣", SWEATERS: "毛衣", POLO_SHIRTS: "Polo衫", BASIC_TSHIRT: "基础T恤", GRAPHIC_TSHIRT: "印花T恤", DENIM_SHORTS: "牛仔短裤", CARGO_SHORTS: "工装短裤", SPORTS_SHORTS: "运动短裤",
  COTTON: "棉", COTTON_BLEND: "棉混纺", POLYESTER: "聚酯纤维", WOOL: "羊毛", WOOL_BLEND: "羊毛混纺", LINEN: "亚麻", VISCOSE_RAYON: "粘胶/人造丝", NYLON: "尼龙", LEATHER: "真皮", FAUX_LEATHER: "人造革", SILK: "真丝", SATIN: "缎面", FLEECE: "抓绒", VELVET: "天鹅绒", KNIT: "针织", ACRYLIC: "腈纶", SPANDEX_BLEND: "弹力混纺", LACE: "蕾丝", CHIFFON: "雪纺", CANVAS: "帆布", CORDUROY: "灯芯绒", MIXED: "混合面料", UNKNOWN: "无法确认",
  HOODED: "连帽", ZIP_FRONT: "前拉链", BUTTON_FRONT: "前纽扣", PULLOVER: "套头", COLLARED: "有领", V_NECK: "V领", CREW_NECK: "圆领", TURTLENECK: "高领", POCKETS: "有口袋", CARGO_POCKETS: "工装口袋", LINED: "有内衬", REVERSIBLE: "双面穿", WATER_RESISTANT: "防泼水", INSULATED: "保暖填充", LIGHTWEIGHT: "轻量", HIGH_WAIST: "高腰", ELASTIC_WAIST: "松紧腰", DRAWSTRING_WAIST: "抽绳腰", STRAIGHT_LEG: "直筒", WIDE_LEG: "阔腿", SKINNY_FIT: "紧身", FLARED: "喇叭型", CROPPED: "短款", MIDI_LENGTH: "中长款", MAXI_LENGTH: "长款", MINI_LENGTH: "短款长度", GRAPHIC_PRINT: "图案印花", EMBROIDERED: "刺绣", BEADED: "珠饰", CASUAL: "休闲", FORMAL: "正装", SPORTS: "运动", OUTDOOR: "户外", MATERNITY: "孕妇装",
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
