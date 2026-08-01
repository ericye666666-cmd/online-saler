"use client";

import Link from "next/link";
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
  SparklesIcon,
  UploadIcon,
  XCircleIcon
} from "lucide-react";
import type {
  BackgroundRemovalMode,
  ImageProcessingJobRecord,
  ImageProcessingOperation,
  ProductImageComparisonResponse
} from "@online-saler/shared-types";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { productStatusLabel } from "./product-factory-display";
import {
  PRODUCT_FACTORY_IMAGE_LABELS,
  PRODUCT_FACTORY_IMAGE_TYPES,
  assignBatchFrontFiles,
  firstProductMissingFront,
  imageUploadIssue,
  shouldAdvanceWithoutUploading,
  uploadedFrontCount,
  type ProductFactoryImageType
} from "./product-factory-upload-flow";

const API_PROXY_URL = "/api-proxy";
const IMAGE_TYPE_ORDER = new Map(PRODUCT_FACTORY_IMAGE_TYPES.map((type, index) => [type, index]));

type ProductImage = {
  id: string;
  type: ProductFactoryImageType;
  publicUrl?: string | null;
  createdAt?: string;
};

type ProductRecord = {
  id: string;
  productCode: string;
  batchItemNumber?: number | null;
  status: string;
  images?: ProductImage[];
  aiExtractions?: Array<{ status?: string | null; errorMessage?: string | null; inputImageIds?: unknown }>;
};

type ProductBatch = {
  id: string;
  batchCode: string;
  targetCount: number;
  stage: string;
  stageLabel: string;
  nextAction: string;
  products: ProductRecord[];
};

type ProcessingState = {
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  comparison: ProductImageComparisonResponse | null;
  message: string;
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
  file: File,
  ids: ReturnType<typeof useOperationIds>
): Promise<ProductImage> {
  const response = await fetch(`${API_PROXY_URL}/products/${productId}/images/upload`, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-Image-Type": imageType,
      "X-Employee-Id": ids.employeeId,
      "X-Admin-User-Id": ids.adminUserId
    },
    body: file
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) as ProductImage & { message?: string } : null;
  if (!response.ok || !body) throw new Error(body?.message || `上传失败：${response.status}`);
  return body;
}

async function getImageComparison(productId: string, adminUserId: string) {
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

async function runProductImagePipeline(
  product: ProductRecord,
  adminUserId: string,
  mode: BackgroundRemovalMode
) {
  let comparison = await getImageComparison(product.id, adminUserId);
  const originalId = comparison.original?.imageId ?? newestImageOfType(product, "FRONT")?.id;
  if (!originalId) throw new Error("缺少正面原图");

  let transparentId = comparison.cutoutTransparent?.sourceImageId === originalId
    ? comparison.cutoutTransparent.imageId
    : "";
  if (!transparentId || mode !== "auto") {
    transparentId = (await runImageOperation(
      product.id,
      originalId,
      "REMOVE_BACKGROUND",
      adminUserId,
      mode
    )).outputImageId!;
  }

  let whiteId = comparison.cutoutWhite?.sourceImageId === transparentId
    ? comparison.cutoutWhite.imageId
    : "";
  if (!whiteId || mode !== "auto") {
    whiteId = (await runImageOperation(
      product.id,
      transparentId,
      "COMPOSE_WHITE_BACKGROUND",
      adminUserId
    )).outputImageId!;
  }

  let optimizedId = comparison.optimizedMain?.sourceImageId === whiteId
    ? comparison.optimizedMain.imageId
    : "";
  if (!optimizedId || mode !== "auto") {
    optimizedId = (await runImageOperation(
      product.id,
      whiteId,
      "OPTIMIZE_MAIN_IMAGE",
      adminUserId
    )).outputImageId!;
  }
  comparison = await selectMainImage(product.id, optimizedId, adminUserId);
  return comparison;
}

async function runProductAi(product: ProductRecord, ids: ReturnType<typeof useOperationIds>) {
  if (hasSucceededAi(product)) return;
  const imageIds = [...(product.images ?? [])]
    .sort((left, right) => (IMAGE_TYPE_ORDER.get(left.type) ?? 99) - (IMAGE_TYPE_ORDER.get(right.type) ?? 99))
    .map((image) => image.id);
  if (imageIds.length === 0) throw new Error("缺少可供 AI 识别的图片");
  await request("/ai-jobs", {
    method: "POST",
    body: JSON.stringify({
      adminUserId: ids.adminUserId,
      productId: product.id,
      imageIds,
      promptVersion: "product-v1"
    })
  });
}

export function ProductBatchUploadPage({ batchId, initialProductId }: { batchId: string; initialProductId?: string }) {
  const ids = useOperationIds();
  const router = useRouter();
  const [batch, setBatch] = useState<ProductBatch | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [files, setFiles] = useState<Partial<Record<ProductFactoryImageType, File>>>({});
  const [batchFrontFiles, setBatchFrontFiles] = useState<Record<string, File>>({});
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
      return Math.min(loaded.products.length - 1, index === 0 ? firstProductMissingFront(loaded.products) : index);
    });
  }, [batchId, ids.adminUserId, initialProductId]);

  useEffect(() => {
    void load().catch((caught) => setError(errorMessage(caught, "无法读取批次。")));
  }, [load]);

  const product = batch?.products[currentIndex] ?? null;
  const frontCount = batch ? uploadedFrontCount(batch.products) : 0;
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
    setFiles((current) => ({ ...current, [type]: file }));
  }

  function chooseMultiple(selected: FileList | null) {
    if (!selected?.length || !batch) return;
    const selectedFiles = Array.from(selected);
    const remainingProducts = batch.products.filter((item) => !newestImageOfType(item, "FRONT"));
    if (selectedFiles.length > remainingProducts.length) {
      setNotice("");
      setError(`本批只剩 ${remainingProducts.length} 件需要正面图，请按商品顺序重新选择。`);
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
    setBatchFrontFiles(Object.fromEntries(assignments.map(({ productId, file }) => [productId, file])));
    setFiles((current) => ({ ...current, FRONT: undefined }));
    setCurrentIndex(batch.products.findIndex((item) => item.id === assignments[0]?.productId));
    setError("");
    setNotice(selectedFiles.length === remainingProducts.length
      ? `已按顺序分配本批剩余 ${selectedFiles.length} 件正面图。`
      : `已按顺序分配 ${selectedFiles.length} 件正面图；本批仍有 ${remainingProducts.length - selectedFiles.length} 件待选择。`);
  }

  async function saveAndContinue() {
    if (!batch || !product) return;
    const hasFront = Boolean(newestImageOfType(product, "FRONT") || batchFrontFiles[product.id] || files.FRONT);
    if (!hasFront) {
      setError("正面图为必填，请先拍摄或选择正面图。");
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
        const file = batchFrontFiles[item.id];
        return file ? [{ productId: item.id, file }] : [];
      });
      for (const [index, assignment] of bulkAssignments.entries()) {
        setBulkUploadingProgress(`正在上传正面图 ${index + 1}/${bulkAssignments.length}`);
        await uploadOriginalImage(assignment.productId, "FRONT", assignment.file, ids);
        setBatchFrontFiles((current) => {
          const next = { ...current };
          delete next[assignment.productId];
          return next;
        });
      }
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
      const updatedFrontCount = uploadedFrontCount(updated.products);
      if (updatedFrontCount === updated.targetCount) {
        router.push(`/product/batches/${encodeURIComponent(batchId)}/processing`);
      } else {
        setCurrentIndex(firstProductMissingFront(updated.products));
      }
    } catch (caught) {
      setError(errorMessage(caught, "图片上传失败，请重试。"));
      const refreshed = await loadBatch(batchId, ids.adminUserId).catch(() => null);
      if (refreshed) setBatch(refreshed);
    } finally {
      setUploadingType("");
      setBulkUploadingProgress("");
      setBusy(false);
    }
  }

  if (!batch || !product) {
    return <StatusMessage tone={error ? "danger" : "neutral"}>{error || "正在读取批次..."}</StatusMessage>;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <FlowHeader
        title={`${batch.batchCode} · 连续上传`}
        description={`第 ${currentIndex + 1}/${batch.targetCount} 件 · 已完成正面图 ${frontCount}/${batch.targetCount}`}
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
            批量入口只接收正面图，并按商品 1 到 {batch.targetCount} 的顺序分配。
            {pendingBatchFrontCount ? ` 已分配 ${pendingBatchFrontCount} 件。` : ""}
          </p>
        </div>
        <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium">
          <UploadIcon className="size-4" />批量选择正面图
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {PRODUCT_FACTORY_IMAGE_TYPES.map((type) => (
          <ImageInputCard
            key={type}
            type={type}
            required={type === "FRONT"}
            existing={newestImageOfType(product, type)}
            file={type === "FRONT" ? batchFrontFiles[product.id] ?? files.FRONT : files[type]}
            busy={busy}
            onChoose={(file) => chooseFile(type, file)}
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
        支持 JPEG、PNG、WEBP，单张不超过 10 MB。iPhone 请使用“兼容性最佳”格式；HEIC 需先转换。原图会永久保留，不会被抠图或优化结果覆盖。
      </p>

      <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t bg-background/95 py-3 backdrop-blur sm:flex-row sm:justify-between">
        <Button
          variant="outline"
          disabled={busy || currentIndex === 0}
          onClick={() => { setFiles({}); setCurrentIndex((index) => Math.max(0, index - 1)); }}
        >
          <ArrowLeftIcon data-icon="inline-start" />上一件
        </Button>
        <Button disabled={busy} onClick={() => void saveAndContinue()}>
          {busy ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
          {bulkUploadingProgress || (uploadingType
            ? `正在上传${PRODUCT_FACTORY_IMAGE_LABELS[uploadingType]}`
            : pendingBatchFrontCount
              ? `上传已分配的 ${pendingBatchFrontCount} 件正面图`
              : currentIndex === batch.targetCount - 1 ? "保存并开始处理" : "保存并下一件")}
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
    const hydrated = await Promise.all(loaded.products.map(async (product) => {
      const comparison = await getImageComparison(product.id, ids.adminUserId);
      return [product.id, stateFromProduct(product, comparison)] as const;
    }));
    setStates(Object.fromEntries(hydrated));
  }, [batchId, ids.adminUserId]);

  useEffect(() => {
    void load().catch((caught) => setError(errorMessage(caught, "无法读取处理进度。")));
  }, [load]);

  async function processOne(product: ProductRecord, mode: BackgroundRemovalMode) {
    setStates((current) => ({
      ...current,
      [product.id]: { ...current[product.id], status: "RUNNING", message: mode === "rembg_birefnet" ? "正在强制使用 BiRefNet" : "正在运行自动处理" }
    }));
    try {
      const comparison = await runProductImagePipeline(product, ids.adminUserId, mode);
      await runProductAi(product, ids);
      setStates((current) => ({
        ...current,
        [product.id]: { status: "SUCCEEDED", comparison, message: "图片与 AI 已完成" }
      }));
      return true;
    } catch (caught) {
      setStates((current) => ({
        ...current,
        [product.id]: {
          ...current[product.id],
          status: "FAILED",
          message: errorMessage(caught, "处理失败")
        }
      }));
      return false;
    }
  }

  async function processAll() {
    if (!batch) return;
    setBusy(true);
    setError("");
    for (const product of batch.products) {
      if (states[product.id]?.status === "SUCCEEDED") continue;
      await processOne(product, "auto");
    }
    setBusy(false);
    await load().catch((caught) => setError(errorMessage(caught, "无法刷新批次。")));
  }

  async function forceBiRefNet(product: ProductRecord) {
    setBusy(true);
    setError("");
    await processOne(product, "rembg_birefnet");
    setBusy(false);
    await load().catch((caught) => setError(errorMessage(caught, "无法刷新批次。")));
  }

  if (!batch) {
    return <StatusMessage tone={error ? "danger" : "neutral"}>{error || "正在读取批次..."}</StatusMessage>;
  }

  const completed = batch.products.filter((product) => states[product.id]?.status === "SUCCEEDED").length;
  const failed = batch.products.filter((product) => states[product.id]?.status === "FAILED").length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <FlowHeader
        title={`${batch.batchCode} · AI 与图片处理`}
        description={`已完成 ${completed}/${batch.targetCount}${failed ? ` · 失败 ${failed}` : ""}`}
        batchId={batch.id}
      />
      <ProgressBar value={completed} max={batch.targetCount} />
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>批量处理 {batch.targetCount} 件商品</CardTitle>
              <CardDescription>先运行 lightweight OpenCV；质量不足时自动回退 rembg + BiRefNet。随后用本件全部原图运行 OpenAI。</CardDescription>
            </div>
            {completed < batch.targetCount ? (
              <Button disabled={busy} onClick={() => void processAll()}>
                {busy ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
                {failed ? "重试未完成商品" : "开始批量处理"}
              </Button>
            ) : (
              <Button asChild><Link href={`/product/calibration?batchId=${encodeURIComponent(batch.id)}`}>开始人工校准<ArrowRightIcon data-icon="inline-end" /></Link></Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {batch.products.map((product) => (
            <ProcessingRow
              key={product.id}
              product={product}
              state={states[product.id] ?? { status: "PENDING", comparison: null, message: "等待处理" }}
              disabled={busy}
              onRetry={() => void forceBiRefNet(product)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ImageInputCard(props: {
  type: ProductFactoryImageType;
  required: boolean;
  existing?: ProductImage | null;
  file?: File;
  busy: boolean;
  onChoose: (file: File | null) => void;
  onClear: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState("");
  useEffect(() => {
    if (!props.file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(props.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [props.file]);
  const existingUrl = props.existing?.publicUrl ? `${API_PROXY_URL}${props.existing.publicUrl}` : "";
  const imageUrl = previewUrl || existingUrl;

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    props.onChoose(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <div className="min-w-0 rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{PRODUCT_FACTORY_IMAGE_LABELS[props.type]}{props.required ? " *" : ""}</span>
        {props.file ? <Badge>待上传</Badge> : props.existing ? <Badge variant="secondary">已上传</Badge> : <Badge variant="outline">可选</Badge>}
      </div>
      <label
        className="flex aspect-[4/5] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/20 text-center"
        onDragOver={(event) => event.preventDefault()}
        onDrop={drop}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={PRODUCT_FACTORY_IMAGE_LABELS[props.type]} className="size-full object-contain" />
        ) : (
          <span className="flex flex-col items-center gap-2 px-3 text-xs text-muted-foreground">
            {props.type === "FRONT" ? <CameraIcon className="size-5" /> : <ImageIcon className="size-5" />}
            点击拍摄或拖入图片
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
      {props.file ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">{props.file.name}</span>
          <button type="button" className="text-xs text-destructive" disabled={props.busy} onClick={props.onClear}>移除</button>
        </div>
      ) : null}
    </div>
  );
}

function ProcessingRow(props: {
  product: ProductRecord;
  state: ProcessingState;
  disabled: boolean;
  onRetry: () => void;
}) {
  const removeJob = props.state.comparison?.jobs.find((job) => job.operation === "REMOVE_BACKGROUND" && job.status === "SUCCEEDED");
  return (
    <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="font-medium">第 {props.product.batchItemNumber ?? "-"} 件</div>
        <div className="truncate text-xs text-muted-foreground">{props.product.productCode}</div>
      </div>
      <div className="min-w-0 text-sm">
        <div className="flex items-center gap-2">
          <ProcessingIcon status={props.state.status} />
          <span>{props.state.message}</span>
        </div>
        {removeJob ? (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>引擎：{providerLabel(removeJob.provider)}</span>
            <span>质量：{removeJob.qualityScore == null ? "-" : Math.round(removeJob.qualityScore * 100)}</span>
            {removeJob.fallbackFrom ? <span>已从 {providerLabel(removeJob.fallbackFrom)} 回退</span> : null}
            {removeJob.qualityIssues.length ? <span className="text-amber-700">{removeJob.qualityIssues.join("、")}</span> : null}
          </div>
        ) : null}
      </div>
      {props.state.status === "FAILED" ? (
        <Button size="sm" variant="outline" disabled={props.disabled} onClick={props.onRetry}>
          <RotateCcwIcon data-icon="inline-start" />强制 BiRefNet
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
          <ArrowLeftIcon className="size-3" />返回批次
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
  const extraction = product.aiExtractions?.find((candidate) => candidate.status === "SUCCEEDED");
  const latestFrontId = newestImageOfType(product, "FRONT")?.id;
  if (!extraction || !latestFrontId) return false;
  return Array.isArray(extraction.inputImageIds) && extraction.inputImageIds.includes(latestFrontId);
}

function stateFromProduct(product: ProductRecord, comparison: ProductImageComparisonResponse): ProcessingState {
  const imageReady = Boolean(comparison.optimizedMain && comparison.selectedMainImageId);
  const aiReady = hasSucceededAi(product) || ["CALIBRATION_PENDING", "CALIBRATED", "BARCODE_ASSIGNED", "REVIEW_PENDING", "APPROVED", "READY_FOR_STORAGE", "PUBLISHED"].includes(product.status);
  if (imageReady && aiReady) return { status: "SUCCEEDED", comparison, message: "图片与 AI 已完成" };
  const failed = comparison.jobs.find((job) => job.status === "FAILED");
  if (failed) return { status: "FAILED", comparison, message: failed.errorMessage || "图片处理失败" };
  if (product.aiExtractions?.[0]?.status === "FAILED") {
    return { status: "FAILED", comparison, message: product.aiExtractions[0].errorMessage || "AI 识别失败" };
  }
  return { status: "PENDING", comparison, message: imageReady ? "等待 AI 识别" : "等待图片处理" };
}

function providerLabel(provider: string | null) {
  if (!provider) return "-";
  if (provider.includes("rembg") || provider.includes("birefnet")) return "rembg + BiRefNet";
  if (provider.includes("lightweight") || provider.includes("opencv")) return "lightweight OpenCV";
  return provider;
}

function errorMessage(value: unknown, fallback: string) {
  return value instanceof Error ? value.message : fallback;
}
