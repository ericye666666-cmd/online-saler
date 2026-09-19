"use client";

import { operationsFetch } from "@/lib/operations-api";

import Link from "next/link";
import { BatchDisplayProgress, startBatchDisplayWork } from "./product-background-display";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CameraIcon,
  CheckCircle2Icon,
  ImageIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SparklesIcon,
  UploadIcon,
  XCircleIcon
} from "lucide-react";
import {
  PRODUCT_AI_PROMPT_VERSION,
  isShoeProduct,
  type ProductImageComparisonResponse
} from "@online-saler/shared-types";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { productStatusLabel } from "./product-factory-display";
import {
  PRODUCT_AI_BATCH_CONCURRENCY,
  PRODUCT_UPLOAD_BATCH_CONCURRENCY,
  runWithConcurrency
} from "./product-batch-processing-concurrency";
import {
  PRODUCT_FACTORY_IMAGE_LABELS,
  PRODUCT_FACTORY_IMAGE_TYPES,
  SHOE_IMAGE_LABELS,
  requiredCaptureImageTypes,
  missingCaptureImageTypes,
  firstProductMissingCapture,
  completedCaptureCount,
  assignBatchFrontFiles,
  imageUploadIssue,
  rotateProductImage,
  shouldAdvanceWithoutUploading,
  type ProductFactoryImageType,
  type ProductImageRotation,
  type ProductImageRotationDirection
} from "./product-factory-upload-flow";
import { t } from "@/i18n/runtime";

const API_PROXY_URL = "/api-proxy";
const IMAGE_TYPE_ORDER = new Map(PRODUCT_FACTORY_IMAGE_TYPES.map((type, index) => [type, index]));

type ProductImage = {
  id: string;
  type: ProductFactoryImageType;
  publicUrl?: string | null;
  createdAt?: string;
};

type PendingImageUpload = {
  file: File;
  rotation: ProductImageRotation;
};

type ProductRecord = {
  id: string;
  productCode: string;
  batchItemNumber?: number | null;
  status: string;
  category?: string | null;
  subcategory?: string | null;
  images?: ProductImage[];
  aiExtractions?: Array<{ status?: string | null; errorMessage?: string | null; inputImageIds?: unknown; promptVersion?: string | null }>;
};

type ProductBatch = {
  id: string;
  batchCode: string;
  targetCount: number;
  intakeCategory?: string | null;
  stage: string;
  stageLabel: string;
  nextAction: string;
  products: ProductRecord[];
};

type ProcessingState = {
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  message: string;
};

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

async function uploadOriginalImage(
  productId: string,
  imageType: ProductFactoryImageType,
  selection: PendingImageUpload,
  ids: ReturnType<typeof useOperationIds>
): Promise<ProductImage> {
  const response = await operationsFetch(`${API_PROXY_URL}/products/${productId}/images/upload`, {
    method: "POST",
    headers: {
      "Content-Type": selection.file.type,
      "X-Image-Type": imageType,
      "X-Image-Rotation": String(selection.rotation),
      "X-Employee-Id": ids.employeeId,
      "X-Admin-User-Id": ids.adminUserId
    },
    body: selection.file
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) as ProductImage & { message?: string } : null;
  if (!response.ok || !body) throw new Error(body?.message || t("上传失败：{status}", { status: response.status }));
  return body;
}

async function runProductAi(product: ProductRecord, ids: ReturnType<typeof useOperationIds>) {
  if (hasSucceededAi(product)) return;
  const missing = missingCaptureImageTypes(product);
  if (missing.length) throw new Error(t("请先补齐商品原图，再识别商品信息。"));
  const imageIds = [...(product.images ?? [])]
    .sort((left, right) => (IMAGE_TYPE_ORDER.get(left.type) ?? 99) - (IMAGE_TYPE_ORDER.get(right.type) ?? 99))
    .map((image) => image.id);
  if (imageIds.length === 0) throw new Error(t("缺少可供 AI 识别的图片"));
  await request("/ai-jobs", {
    method: "POST",
    body: JSON.stringify({
      adminUserId: ids.adminUserId,
      productId: product.id,
      imageIds,
      promptVersion: PRODUCT_AI_PROMPT_VERSION
    })
  });
}

export function ProductBatchUploadPage({ batchId, initialProductId }: { batchId: string; initialProductId?: string }) {
  const ids = useOperationIds();
  const router = useRouter();
  const [batch, setBatch] = useState<ProductBatch | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [files, setFiles] = useState<Partial<Record<ProductFactoryImageType, PendingImageUpload>>>({});
  const [batchFrontFiles, setBatchFrontFiles] = useState<Record<string, PendingImageUpload>>({});
  const [busy, setBusy] = useState(false);
  const [uploadingType, setUploadingType] = useState<ProductFactoryImageType | "">("");
  const [bulkUploadingProgress, setBulkUploadingProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    const loaded = await loadBatch(batchId, ids.adminUserId);
    setBatch(loaded);
    setCurrentIndex((index) => {
      const requested = initialProductId ? loaded.products.findIndex((product) => product.id === initialProductId) : -1;
      if (requested >= 0) return requested;
      return Math.min(loaded.products.length - 1, index === 0 ? firstProductMissingCapture(loaded.products) : index);
    });
  }, [batchId, ids.adminUserId, initialProductId]);

  useEffect(() => {
    void load().catch((caught) => setError(errorMessage(caught, t("无法读取批次。"))));
  }, [load]);

  const product = batch?.products[currentIndex] ?? null;
  const frontCount = batch ? completedCaptureCount(batch.products) : 0;
  const shoes = isShoeProduct(product?.category ?? batch?.intakeCategory, product?.subcategory);
  const imageLabels = shoes ? SHOE_IMAGE_LABELS : PRODUCT_FACTORY_IMAGE_LABELS;
  const pendingBatchFrontCount = Object.keys(batchFrontFiles).length;

  function chooseFile(type: ProductFactoryImageType, file: File | null) {
    if (!file) return;
    const issue = imageUploadIssue(file);
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    setNotice("");
    if (type === "FRONT" && product) {
      setBatchFrontFiles((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
    }
    setFiles((current) => ({ ...current, [type]: { file, rotation: 0 } }));
  }

  function chooseMultiple(selected: FileList | null) {
    if (!selected?.length || !batch) return;
    const selectedFiles = Array.from(selected);
    const remainingProducts = batch.products.filter((item) => !newestImageOfType(item, "FRONT"));
    if (selectedFiles.length > remainingProducts.length) {
      setNotice("");
      setError(t("本批只剩 {length} 件需要正面图，请按商品顺序重新选择。", { length: remainingProducts.length }));
      return;
    }
    for (const file of selectedFiles) {
      const issue = imageUploadIssue(file);
      if (issue) {
        setNotice("");
        setError(`${file.name}：${issue}`);
        return;
      }
    }
    const assignments = assignBatchFrontFiles(batch.products, selectedFiles);
    setBatchFrontFiles(Object.fromEntries(assignments.map(({ productId, file }) => [
      productId,
      { file, rotation: 0 as const }
    ])));
    setFiles((current) => ({ ...current, FRONT: undefined }));
    setCurrentIndex(batch.products.findIndex((item) => item.id === assignments[0]?.productId));
    setError("");
    setNotice(selectedFiles.length === remainingProducts.length
      ? t("已按顺序分配本批剩余 {length} 件正面图。", { length: selectedFiles.length })
      : t("已按顺序分配 {length} 件正面图；本批仍有 {v1} 件待选择。", { length: selectedFiles.length, v1: remainingProducts.length - selectedFiles.length }));
  }

  function rotatePendingImage(type: ProductFactoryImageType, direction: ProductImageRotationDirection) {
    if (type === "FRONT" && product && batchFrontFiles[product.id]) {
      setBatchFrontFiles((current) => ({
        ...current,
        [product.id]: {
          ...current[product.id]!,
          rotation: rotateProductImage(current[product.id]!.rotation, direction)
        }
      }));
      return;
    }
    setFiles((current) => {
      const selection = current[type];
      if (!selection) return current;
      return {
        ...current,
        [type]: { ...selection, rotation: rotateProductImage(selection.rotation, direction) }
      };
    });
  }

  async function saveAndContinue() {
    if (!batch || !product) return;
    const missing = requiredCaptureImageTypes(product.category, product.subcategory).filter((type) =>
      !newestImageOfType(product, type) && !files[type] && !(type === "FRONT" && batchFrontFiles[product.id])
    );
    if (missing.length) {
      setError(t("请先拍摄或选择：{v0}。", { v0: missing.map((type) => t(imageLabels[type])).join("、") }));
      return;
    }
    const selected = PRODUCT_FACTORY_IMAGE_TYPES.filter((type) => files[type]);
    if (shouldAdvanceWithoutUploading({
      currentIndex,
      productCount: batch.products.length,
      selectedImageCount: selected.length,
      pendingBatchFrontCount
    })) {
      setCurrentIndex((index) => index + 1);
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const bulkAssignments = batch.products.flatMap((item) => {
        const selection = batchFrontFiles[item.id];
        return selection ? [{ productId: item.id, selection }] : [];
      });
      let uploadedAssignments = 0;
      setBulkUploadingProgress(t("正在批量上传正面图 0/{length}", { length: bulkAssignments.length }));
      await runWithConcurrency(bulkAssignments, PRODUCT_UPLOAD_BATCH_CONCURRENCY, async (assignment) => {
        await uploadOriginalImage(assignment.productId, "FRONT", assignment.selection, ids);
        uploadedAssignments += 1;
        setBulkUploadingProgress(t("正在批量上传正面图 {uploadedAssignments}/{length}", { uploadedAssignments: uploadedAssignments, length: bulkAssignments.length }));
        setBatchFrontFiles((current) => {
          const next = { ...current };
          delete next[assignment.productId];
          return next;
        });
      });
      for (const type of selected) {
        setUploadingType(type);
        await uploadOriginalImage(product.id, type, files[type]!, ids);
      }
      setFiles({});
      setBatchFrontFiles({});
      setUploadingType("");
      setBulkUploadingProgress("");
      const updated = await loadBatch(batchId, ids.adminUserId);
      setBatch(updated);
      const updatedFrontCount = completedCaptureCount(updated.products);
      if (updatedFrontCount === updated.targetCount) {
        startBatchDisplayWork(updated);
        router.push(`/product/batches/${encodeURIComponent(batchId)}/processing`);
      } else {
        setCurrentIndex(firstProductMissingCapture(updated.products));
      }
    } catch (caught) {
      setError(errorMessage(caught, t("图片上传失败，请重试。")));
      const refreshed = await loadBatch(batchId, ids.adminUserId).catch(() => null);
      if (refreshed) setBatch(refreshed);
    } finally {
      setUploadingType("");
      setBulkUploadingProgress("");
      setBusy(false);
    }
  }

  if (!batch || !product) {
    return <StatusMessage tone={error ? "danger" : "neutral"}>{error || t("正在读取批次...")}</StatusMessage>;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <FlowHeader
        title={t("{batchCode} · 第 1 步：批量上传", { batchCode: batch.batchCode })}
        description={t("第 {v0}/{targetCount} {v2} · 已完成必需照片 {frontCount}/{targetCount2}", { v0: currentIndex + 1, targetCount: batch.targetCount, v2: shoes ? t("双") : t("件"), frontCount: frontCount, targetCount2: batch.targetCount })}
        batchId={batch.id}
      />
      <ProgressBar value={frontCount} max={batch.targetCount} />
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      {notice ? <StatusMessage tone="neutral">{notice}</StatusMessage> : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
        <div className="text-sm">
          <span className="font-medium">{product.productCode}</span>
          <span className="ml-2 text-muted-foreground">{productStatusLabel(product.status)}</span>
          <p className="mt-1 text-xs text-muted-foreground">
            
            {t("批量入口接收")}{t(imageLabels.FRONT)}{t("，按商品 1 到")} {batch.targetCount}  {t("的顺序分配。")}
            {pendingBatchFrontCount ? t(" 已分配 {pendingBatchFrontCount} 件。", { pendingBatchFrontCount: pendingBatchFrontCount }) : ""}
          </p>
        </div>
        <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium">
          <UploadIcon className="size-4" />{t("批量选择")}{t(imageLabels.FRONT)}
          <input
            className="sr-only"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) => {
              chooseMultiple(event.target.files);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      {shoes ? <p className="text-sm text-muted-foreground">{t("一双一个商品。只有整双主图必拍，要同时拍到左右鞋；侧面、鞋底和尺码标签可选，拍了 AI 读得更准。按编号集中拍完，再坐下上传；有瑕疵补特写。")}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {PRODUCT_FACTORY_IMAGE_TYPES.map((type) => (
          <ImageInputCard
            key={type}
            type={type}
            required={requiredCaptureImageTypes(product.category, product.subcategory).includes(type)}
            label={t(imageLabels[type])}
            existing={newestImageOfType(product, type)}
            selection={type === "FRONT" ? batchFrontFiles[product.id] ?? files.FRONT : files[type]}
            busy={busy}
            onChoose={(file) => chooseFile(type, file)}
            onRotate={(direction) => rotatePendingImage(type, direction)}
            onClear={() => {
              if (type === "FRONT" && batchFrontFiles[product.id]) {
                setBatchFrontFiles((current) => {
                  const next = { ...current };
                  delete next[product.id];
                  return next;
                });
                return;
              }
              setFiles((current) => ({ ...current, [type]: undefined }));
            }}
          />
        ))}
      </section>

      <p className="text-xs text-muted-foreground">
        
        {t("支持 JPEG、PNG、WEBP，单张不超过 10 MB。保存前请用图片下方按钮调整方向，预览方向就是实际上传和 AI 识别方向。iPhone 请使用“兼容性最佳”格式；HEIC 需先转换。原图会永久保留，用于商品识别和并行生成白底展示图。")}
      </p>

      <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t bg-background/95 py-3 backdrop-blur sm:flex-row sm:justify-between">
        <Button
          variant="outline"
          disabled={busy || currentIndex === 0}
          onClick={() => { setFiles({}); setCurrentIndex((index) => Math.max(0, index - 1)); }}
        >
          <ArrowLeftIcon data-icon="inline-start" />{t("上一件")}
        </Button>
        <Button disabled={busy} onClick={() => void saveAndContinue()}>
          {busy ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
          {bulkUploadingProgress || (uploadingType
            ? t("正在上传{v0}", { v0: t(imageLabels[uploadingType]) })
            : pendingBatchFrontCount
              ? t("上传已分配的 {pendingBatchFrontCount} 件正面图", { pendingBatchFrontCount: pendingBatchFrontCount })
              : currentIndex === batch.targetCount - 1 ? t("保存并开始处理") : t("保存并下一件"))}
          {!busy ? <ArrowRightIcon data-icon="inline-end" /> : null}
        </Button>
      </div>
    </div>
  );
}

export function ProductBatchProcessingPage({ batchId }: { batchId: string }) {
  const ids = useOperationIds();
  const [batch, setBatch] = useState<ProductBatch | null>(null);
  const [states, setStates] = useState<Record<string, ProcessingState>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    const loaded = await loadBatch(batchId, ids.adminUserId);
    setBatch(loaded);
    setStates(Object.fromEntries(loaded.products.map((product) => [product.id, stateFromProduct(product)])));
  }, [batchId, ids.adminUserId]);

  useEffect(() => {
    void load().catch((caught) => setError(errorMessage(caught, t("无法读取处理进度。"))));
  }, [load]);

  async function processOne(product: ProductRecord) {
    setStates((current) => ({ ...current, [product.id]: { status: "RUNNING", message: t("正在使用原图识别商品信息") } }));
    try {
      await runProductAi(product, ids);
      setStates((current) => ({ ...current, [product.id]: { status: "SUCCEEDED", message: t("商品识别完成，待人工校准、填写尺码") } }));
    } catch (caught) {
      setStates((current) => ({ ...current, [product.id]: { status: "FAILED", message: errorMessage(caught, t("商品识别失败")) } }));
    }
  }

  async function processAll() {
    if (!batch || busy) return;
    setBusy(true);
    setError("");
    try {
      const pending = batch.products.filter((product) => states[product.id]?.status !== "SUCCEEDED");
      await runWithConcurrency(pending, PRODUCT_AI_BATCH_CONCURRENCY, processOne);
      await load();
    } catch (caught) {
      setError(errorMessage(caught, t("无法刷新识别结果。")));
    } finally {
      setBusy(false);
    }
  }

  async function retryRecognition(product: ProductRecord) {
    if (busy) return;
    setBusy(true);
    try { await processOne(product); } finally { setBusy(false); }
  }

  if (!batch) {
    return <StatusMessage tone={error ? "danger" : "neutral"}>{error || t("正在读取批次...")}</StatusMessage>;
  }

  const shoesBatch = batch.intakeCategory === "SHOES";
  const completed = batch.products.filter((product) => states[product.id]?.status === "SUCCEEDED").length;
  const failed = batch.products.filter((product) => states[product.id]?.status === "FAILED").length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <FlowHeader
        title={t("{batchCode} · 第 2 步：识别商品信息", { batchCode: batch.batchCode })}
        description={t("已完成 {completed}/{targetCount}{v2}", { completed: completed, targetCount: batch.targetCount, v2: failed ? t(" · 失败 {failed}", { failed: failed }) : "" })}
        batchId={batch.id}
      />
      <BatchDisplayProgress batch={batch} />
      <ProgressBar value={completed} max={batch.targetCount} />
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{t("整批识别")} {batch.targetCount} {shoesBatch ? t("双鞋") : t("件商品")}</CardTitle>
              <CardDescription>{t("系统直接使用上传原图识别分类、外观、名称和品牌。人工校准并填写尺码后，再直接由原图生成白底展示图。")}</CardDescription>
            </div>
            {completed < batch.targetCount ? (
              <Button disabled={busy} onClick={() => void processAll()}>
                {busy ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
                {busy ? t("正在批量识别商品信息") : failed ? t("重试未完成商品") : t("识别本批 {targetCount} 件", { targetCount: batch.targetCount })}
              </Button>
            ) : (
              <Button asChild><Link href={`/product/calibration?batchId=${encodeURIComponent(batch.id)}`}>{t("人工校准、填写尺码")}<ArrowRightIcon data-icon="inline-end" /></Link></Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {batch.products.map((product) => (
            <ProcessingRow
              key={product.id}
              batchId={batch.id}
              product={product}
              state={states[product.id] ?? { status: "PENDING", message: t("等待处理") }}
              disabled={busy}
              onRetry={() => void retryRecognition(product)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ImageInputCard(props: {
  type: ProductFactoryImageType;
  label: string;
  required: boolean;
  existing?: ProductImage | null;
  selection?: PendingImageUpload;
  busy: boolean;
  onChoose: (file: File | null) => void;
  onRotate: (direction: ProductImageRotationDirection) => void;
  onClear: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState("");
  useEffect(() => {
    if (!props.selection?.file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(props.selection.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [props.selection?.file]);
  const existingUrl = props.existing?.publicUrl ? `${API_PROXY_URL}${props.existing.publicUrl}` : "";
  const imageUrl = previewUrl || existingUrl;

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    props.onChoose(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <div className="min-w-0 rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{props.label}{props.required ? " *" : ""}</span>
        {props.selection ? <Badge>{t("待上传")}</Badge> : props.existing ? <Badge variant="secondary">{t("已上传")}</Badge> : <Badge variant="outline">{props.required ? t("待补充") : t("可选")}</Badge>}
      </div>
      <label
        className="flex aspect-[4/5] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/20 text-center"
        onDragOver={(event) => event.preventDefault()}
        onDrop={drop}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={props.label}
            className={cn(
              "size-full object-contain transition-transform",
              props.selection && props.selection.rotation % 180 !== 0 && "scale-[0.78]"
            )}
            style={props.selection ? { transform: `rotate(${props.selection.rotation}deg)` } : undefined}
          />
        ) : (
          <span className="flex flex-col items-center gap-2 px-3 text-xs text-muted-foreground">
            {props.type === "FRONT" ? <CameraIcon className="size-5" /> : <ImageIcon className="size-5" />}
            
            {t("点击拍摄或拖入图片")}
          </span>
        )}
        <input
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          disabled={props.busy}
          onChange={(event) => props.onChoose(event.target.files?.[0] ?? null)}
        />
      </label>
      {props.selection ? (
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">{props.selection.file.name}</span>
            <button type="button" className="text-xs text-destructive" disabled={props.busy} onClick={props.onClear}>{t("移除")}</button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {props.selection.rotation === 0 ? t("方向未调整") : t("已旋转 {rotation}°", { rotation: props.selection.rotation })}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                disabled={props.busy}
                aria-label={t("向左旋转 90 度")}
                title={t("向左旋转 90 度")}
                onClick={() => props.onRotate("LEFT")}
              >
                <RotateCcwIcon />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                disabled={props.busy}
                aria-label={t("向右旋转 90 度")}
                title={t("向右旋转 90 度")}
                onClick={() => props.onRotate("RIGHT")}
              >
                <RotateCwIcon />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProcessingRow(props: {
  batchId: string;
  product: ProductRecord;
  state: ProcessingState;
  disabled: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="font-medium">{t("第")} {props.product.batchItemNumber ?? "-"}  {t("件")}</div>
        <div className="truncate text-xs text-muted-foreground">{props.product.productCode}</div>
      </div>
      <div className="min-w-0 text-sm">
        <div className="flex items-center gap-2">
          <ProcessingIcon status={props.state.status} />
          <span>{props.state.message}</span>
        </div>
      </div>
      {props.state.status === "FAILED" ? (
        <Button size="sm" variant="outline" disabled={props.disabled} onClick={props.onRetry}>
          <RotateCcwIcon data-icon="inline-start" />{t("重试商品识别")}
        </Button>
      ) : <span />}
    </div>
  );
}

function ProcessingIcon({ status }: { status: ProcessingState["status"] }) {
  if (status === "SUCCEEDED") return <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600" />;
  if (status === "FAILED") return <XCircleIcon className="size-4 shrink-0 text-destructive" />;
  if (status === "RUNNING") return <LoaderCircleIcon className="size-4 shrink-0 animate-spin text-primary" />;
  return <RefreshCwIcon className="size-4 shrink-0 text-muted-foreground" />;
}

function FlowHeader(props: { title: string; description: string; batchId: string }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <Link href={`/product/batches/${encodeURIComponent(props.batchId)}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-3" />{t("返回批次")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">{props.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{props.description}</p>
      </div>
    </header>
  );
}

function StatusMessage({ tone, children }: { tone: "danger" | "neutral"; children: ReactNode }) {
  return (
    <div className={cn(
      "rounded-md border px-4 py-3 text-sm",
      tone === "danger" ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted/40 text-muted-foreground"
    )}>{children}</div>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const percentage = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full bg-primary transition-[width]" style={{ width: `${percentage}%` }} />
    </div>
  );
}

function newestImageOfType(product: ProductRecord | null, type: ProductFactoryImageType) {
  return product?.images?.find((image) => image.type === type) ?? null;
}

function hasSucceededAi(product: ProductRecord) {
  if (isShoeProduct(product.category, product.subcategory)) {
    const extraction = product.aiExtractions?.[0];
    if (extraction?.status !== "SUCCEEDED" || extraction.promptVersion !== PRODUCT_AI_PROMPT_VERSION || !Array.isArray(extraction.inputImageIds)) return false;
    const inputIds = extraction.inputImageIds;
    return missingCaptureImageTypes(product).length === 0 && PRODUCT_FACTORY_IMAGE_TYPES.every((type) => {
      const latest = newestImageOfType(product, type);
      return !latest || inputIds.includes(latest.id);
    });
  }
  const extraction = product.aiExtractions?.find((candidate) => candidate.status === "SUCCEEDED");
  const latestFrontId = newestImageOfType(product, "FRONT")?.id;
  if (!extraction || !latestFrontId) return false;
  return extraction.promptVersion === PRODUCT_AI_PROMPT_VERSION &&
    Array.isArray(extraction.inputImageIds) && extraction.inputImageIds.includes(latestFrontId);
}

function stateFromProduct(product: ProductRecord): ProcessingState {
  if (missingCaptureImageTypes(product).length) return { status: "FAILED", message: t("请补齐商品原图") };
  if (hasSucceededAi(product) || ["CALIBRATION_PENDING", "CALIBRATED", "BARCODE_ASSIGNED", "REVIEW_PENDING", "APPROVED", "READY_FOR_STORAGE", "PUBLISHED"].includes(product.status)) {
    return { status: "SUCCEEDED", message: t("商品识别完成，待人工校准、填写尺码") };
  }
  const extraction = product.aiExtractions?.[0];
  if (extraction?.status === "FAILED") return { status: "FAILED", message: extraction.errorMessage || t("商品识别失败") };
  return { status: "PENDING", message: t("等待原图识别商品信息") };
}

function errorMessage(value: unknown, fallback: string) {
  return value instanceof Error ? value.message : fallback;
}
