"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  ImageProcessingJobRecord,
  ProductImageComparisonResponse,
  ProductImageVariantRecord
} from "@online-saler/shared-types";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  EyeIcon,
  FileTextIcon,
  ImageOffIcon,
  LoaderCircleIcon,
  PencilLineIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SparklesIcon
} from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  detailBatchStageLabel,
  detailConditionSummary,
  detailCopyWithoutPrice,
  detailGenerationButtonLabel,
  detailProductStage,
  detailSellingPointsWithoutPrice,
  PRODUCT_DETAIL_ASSET_PLAN,
  productDetailAssetProxyUrl,
  sortDetailBatches
} from "./product-detail-page-plan";

const API_PROXY_URL = "/api-proxy";
const ASSET_LABELS: Record<string, string> = {
  FRONT_MAIN: "正面主图",
  BACK_MAIN: "背面实物",
  MEASUREMENT_GUIDE: "尺码说明",
  DETAIL_GALLERY: "细节照片"
};
const CURRENT_DETAIL_ASSET_TYPES = new Set<string>(PRODUCT_DETAIL_ASSET_PLAN.map((asset) => asset.type));

type BatchProduct = {
  id: string;
  productCode: string;
  batchItemNumber?: number | null;
  productStatus: string;
  profileId?: string | null;
  detailStatus?: string | null;
  title?: string | null;
  category?: string | null;
  finalSizeLabel?: string | null;
  frontImage?: { id: string; publicUrl?: string | null } | null;
  assets: Array<{ id: string; type: string; status: string }>;
};

type DetailBatch = {
  id: string;
  batchCode: string;
  targetCount: number;
  createdAt: string;
  calibrated: number;
  generationReady: boolean;
  awaitingCalibration: number;
  pending: number;
  generating: number;
  succeeded: number;
  failed: number;
  outdated: number;
  approved: number;
  products: BatchProduct[];
};

type RunBatchResult = {
  processed: number;
  results: Array<{ status: string; error?: string }>;
};

type DetailAsset = {
  id: string;
  type: string;
  status: string;
  publicUrl?: string | null;
  mimeType?: string | null;
  templateCode?: string | null;
  templateVersion?: string | null;
  updatedAt?: string | null;
};

type DetailProfile = {
  id: string;
  status: string;
  sourceDataVersion: number;
  contentVersion: number;
  fitType?: string | null;
  stretchLevel?: string | null;
  fabricWeight?: string | null;
  bodyChestMinCm?: unknown;
  bodyChestMaxCm?: unknown;
  bodyWaistMinCm?: unknown;
  bodyWaistMaxCm?: unknown;
  bodyHipMinCm?: unknown;
  bodyHipMaxCm?: unknown;
  heightMinCm?: unknown;
  heightMaxCm?: unknown;
  weightMinKg?: unknown;
  weightMaxKg?: unknown;
  expectedFit?: string | null;
  recommendationConfidence?: unknown;
  recommendationBasis?: unknown;
  recommendationWarnings?: unknown;
  sizeDisclaimer?: string | null;
  finalOutputJson?: unknown;
  assets: DetailAsset[];
  generationJobs: Array<{ id: string; status: string; model?: string | null; retryCount: number; errorMessage?: string | null }>;
  product: {
    id: string;
    productCode: string;
    batchId?: string | null;
    batchItemNumber?: number | null;
    status: string;
    title?: string | null;
    category?: string | null;
    subcategory?: string | null;
    gender?: string | null;
    brand?: string | null;
    color?: string | null;
    material?: string | null;
    tags?: string[];
    finalSizeLabel?: string | null;
    ukSizeLabel?: string | null;
    conditionGrade?: string | null;
    priceKsh?: number | null;
    detailSourceVersion: number;
    measurements: Array<{ measurementType: string; finalValueCm?: unknown }>;
    defects: Array<{ defectType: string; severity: string; description: string; customerSafeDescription?: string | null }>;
    images: Array<{ id: string; type: string; publicUrl?: string | null }>;
  };
};

type EditableCopy = {
  title: string;
  sellingPoints: [string, string, string];
  shortDescription: string;
  fitSummary: string;
  conditionSummary: string;
  warnings: string;
};

type DetailMainImageChoice = {
  key: "white" | "back-white" | "ai-display";
  label: string;
  image: ProductImageVariantRecord | null;
  selectable: boolean;
  generated: boolean;
};

async function request<T>(path: string, adminUserId: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_PROXY_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-User-Id": adminUserId,
      ...(options?.headers ?? {})
    }
  });
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body
      ? String((body as { message?: unknown }).message)
      : `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

async function generateAiDisplayImage(
  productId: string,
  sourceImageId: string,
  adminUserId: string
): Promise<ImageProcessingJobRecord> {
  const job = await request<ImageProcessingJobRecord>(
    `/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(sourceImageId)}/processing-jobs`,
    adminUserId,
    {
      method: "POST",
      body: JSON.stringify({ operation: "GENERATE_AI_DISPLAY_MAIN_IMAGE" })
    }
  );
  const completed = await request<ImageProcessingJobRecord>(
    `/image-processing-jobs/${encodeURIComponent(job.id)}/run`,
    adminUserId,
    { method: "POST", body: JSON.stringify({}) }
  );
  if (completed.status !== "SUCCEEDED" || !completed.outputImageId) {
    throw new Error(completed.errorMessage || "AI 陈列图生成失败。");
  }
  return completed;
}

function useOperationIds() {
  const { session } = useOperationsSession();
  return useMemo(() => ({
    adminUserId: String(session?.adminUser?.id ?? ""),
    employeeId: String(session?.adminUser?.linkedEmployeeId ?? "")
  }), [session]);
}

export function ProductDetailGenerationPage({ batchId }: { batchId?: string } = {}) {
  const ids = useOperationIds();
  const [batches, setBatches] = useState<DetailBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState(batchId ?? "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    setBatches(await request<DetailBatch[]>("/operations/product-detail-generation", ids.adminUserId));
  }, [ids.adminUserId]);

  useEffect(() => { void load().catch((caught) => setError(errorMessage(caught))); }, [load]);
  useEffect(() => { if (batchId) setSelectedBatchId(batchId); }, [batchId]);

  const orderedBatches = useMemo(() => sortDetailBatches(batches), [batches]);
  const selectedBatch = useMemo(
    () => orderedBatches.find((batch) => batch.id === selectedBatchId) ?? null,
    [orderedBatches, selectedBatchId]
  );

  function selectBatch(nextBatchId: string) {
    setSelectedBatchId(nextBatchId);
    const url = new URL(window.location.href);
    url.searchParams.set("batchId", nextBatchId);
    window.history.replaceState({}, "", url);
  }

  async function run(key: string, path: string, success: string, includeEmployee = false) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await request(path, ids.adminUserId, {
        method: "POST",
        body: JSON.stringify(includeEmployee ? { employeeId: ids.employeeId } : {})
      });
      await load();
      setNotice(success);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function generateBatch(batch: DetailBatch) {
    const key = `${batch.id}-generate`;
    setBusy(key);
    setError("");
    setNotice("第一步正在批量生成 AI 陈列主图并设为默认主图，随后继续生成详情。");
    try {
      await request(`/operations/product-batches/${batch.id}/detail-generation-jobs`, ids.adminUserId, {
        method: "POST",
        body: JSON.stringify({})
      });
      const result = await request<RunBatchResult>(`/operations/product-batches/${batch.id}/detail-generation/run`, ids.adminUserId, {
        method: "POST",
        body: JSON.stringify({}),
        keepalive: true
      });
      await load();
      const failed = result.results.filter((item) => item.status === "FAILED");
      if (failed.length) {
        setError(`${failed.length} 件处理失败：${failed.map((item) => item.error).filter(Boolean).join("；")}`);
        setNotice(`本批已处理 ${result.processed} 件，成功 ${result.processed - failed.length} 件；失败项可直接重试。`);
      } else {
        setNotice(`本批已处理 ${result.processed} 件；AI 陈列主图已作为默认主图，并已继续生成详情。`);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 pb-10">
      <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">商品中心</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal">详情生成</h1>
          <p className="mt-1 text-sm text-muted-foreground">按批次生成销售详情草稿，再按顾客购买顺序检查并批准。</p>
        </div>
        <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void load()}>
          <RefreshCwIcon data-icon="inline-start" />刷新
        </Button>
      </header>

      {error ? <Status tone="danger">{error}</Status> : null}
      {notice ? <Status tone="neutral">{notice}</Status> : null}
      {!batches.length ? <Status tone="neutral">暂无已完成校准的批次。</Status> : null}

      {batches.length ? (
        <section className="grid gap-4 border-y py-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)] md:items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">选择批次</label>
            <Select value={selectedBatchId || undefined} onValueChange={selectBatch}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择要统一生成详情的批次" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {orderedBatches.map((batch) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.batchCode} · {detailBatchStageLabel(batch)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1 md:items-end">
            <span className="text-xs text-muted-foreground">可处理批次</span>
            <span className="text-lg font-semibold">{orderedBatches.length}</span>
          </div>
        </section>
      ) : null}

      {batches.length && !selectedBatch ? <Status tone="neutral">请选择一个批次。</Status> : null}

      <div className="flex flex-col gap-4">
        {selectedBatch ? [selectedBatch].map((batch) => {
          const actionBusy = busy.startsWith(batch.id);
          return (
            <section key={batch.id} className="overflow-hidden rounded-md border bg-background">
              <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{batch.batchCode}</h2>
                    <Badge variant="outline">校准 {batch.calibrated}/{batch.targetCount}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(batch.createdAt).toLocaleString("zh-CN")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={actionBusy || !batch.generationReady || batch.pending === 0} onClick={() => void generateBatch(batch)}>
                    {busy === `${batch.id}-generate` ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
                    {batch.generationReady && batch.pending > 0 ? `第一步 · 批量生成 AI 主图并处理 ${batch.pending} 件详情` : detailGenerationButtonLabel(batch)}
                    {batch.generationReady && batch.pending > 0 ? <ArrowRightIcon data-icon="inline-end" /> : null}
                  </Button>
                  <Button size="sm" variant="outline" disabled={actionBusy || batch.failed === 0} onClick={() => void run(`${batch.id}-failed`, `/operations/product-batches/${batch.id}/detail-generation/retry-failed`, "失败任务已重试。") }>
                    重试失败
                  </Button>
                  <Button size="sm" variant="outline" disabled={actionBusy || batch.outdated === 0} onClick={() => void run(`${batch.id}-outdated`, `/operations/product-batches/${batch.id}/detail-generation/regenerate-outdated`, "过期详情已重新生成。") }>
                    重生成过期项
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-4 lg:grid-cols-8">
                <Metric label="等待校准" value={batch.awaitingCalibration} />
                <Metric label="待生成" value={batch.pending} />
                <Metric label="生成中" value={batch.generating} />
                <Metric label="成功" value={batch.succeeded} />
                <Metric label="失败" value={batch.failed} />
                <Metric label="已过期" value={batch.outdated} />
                <Metric label="已批准" value={batch.approved} />
                <Metric label="总数" value={batch.targetCount} />
              </div>

              <div className="border-b px-4 py-3">
                <p className="text-sm font-medium">第一步先批量生成 AI 陈列图并设为默认商城主图，再生成文案、尺码和其他销售详情。</p>
                <p className="mt-1 text-xs text-muted-foreground">员工仍需在详情审核中对照原图确认 Logo、图案、结构、磨损和瑕疵；Model View 占位页不会恢复。</p>
              </div>

              <div className="divide-y">
                {batch.products.map((product) => {
                  const productStage = detailProductStage(product, batch.generationReady);
                  return (
                    <div key={product.id} className="grid gap-3 p-4 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-center">
                      <div className="aspect-[4/5] overflow-hidden rounded-md border bg-muted/20">
                        {product.frontImage ? <SafeImage src={sourceImageUrl(product.id, product.frontImage)} alt={product.title || product.productCode} /> : <EmptyImage compact />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">第 {product.batchItemNumber ?? "-"} 件</span>
                          <Badge variant="outline">{statusLabel(productStage)}</Badge>
                        </div>
                        <div className="mt-1 truncate font-medium">{product.title || product.productCode}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{labelValue(product.category) || "分类待确认"} · {product.finalSizeLabel || "尺码待确认"} · {product.productCode}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {product.assets
                            .filter((asset) => CURRENT_DETAIL_ASSET_TYPES.has(asset.type) && (asset.status === "READY" || asset.status === "APPROVED"))
                            .map((asset) => <span key={asset.id} className="rounded-sm border border-emerald-600/30 bg-emerald-600/5 px-1.5 py-0.5 text-[11px] text-emerald-700">{assetShortTitle(asset.type)}</span>)}
                        </div>
                      </div>
                      {product.profileId ? (
                        <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
                          <Link href={`/product/details/${product.profileId}`}><EyeIcon data-icon="inline-start" />发布预览</Link>
                        </Button>
                      ) : <Button size="sm" variant="outline" disabled className="w-full sm:w-auto">{statusLabel(productStage)}</Button>}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        }) : null}
      </div>
    </div>
  );
}

export function ProductDetailReviewPage({ profileId }: { profileId: string }) {
  const ids = useOperationIds();
  const [profile, setProfile] = useState<DetailProfile | null>(null);
  const [comparison, setComparison] = useState<ProductImageComparisonResponse | null>(null);
  const [copy, setCopy] = useState<EditableCopy>(emptyCopy());
  const [viewMode, setViewMode] = useState<"preview" | "edit">("preview");
  const [activeAsset, setActiveAsset] = useState("FRONT_MAIN");
  const [activeMainImage, setActiveMainImage] = useState<DetailMainImageChoice["key"]>("ai-display");
  const [recalibrationReason, setRecalibrationReason] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    const next = await request<DetailProfile>(`/product-detail-profiles/${encodeURIComponent(profileId)}`, ids.adminUserId);
    const nextComparison = await request<ProductImageComparisonResponse>(
      `/products/${encodeURIComponent(next.product.id)}/image-comparison`,
      ids.adminUserId
    );
    setProfile(next);
    setComparison(nextComparison);
    setCopy(copyFromJson(next.finalOutputJson, next.product.title ?? "", next.product.defects.length));
    const currentAssets = next.assets.filter((asset) =>
      CURRENT_DETAIL_ASSET_TYPES.has(asset.type) && (asset.status === "READY" || asset.status === "APPROVED")
    );
    if (!currentAssets.some((asset) => asset.type === activeAsset)) {
      setActiveAsset(currentAssets[0]?.type ?? "FRONT_MAIN");
    }
    const choices = detailMainImageChoices(nextComparison);
    setActiveMainImage((current) => {
      if (choices.some((choice) => choice.key === current && choice.image)) return current;
      return choices.find((choice) => choice.image?.selectedAsMain)?.key
        ?? choices.find((choice) => choice.key === "ai-display" && choice.image)?.key
        ?? choices.find((choice) => choice.image)?.key
        ?? "white";
    });
  }, [activeAsset, ids.adminUserId, profileId]);

  useEffect(() => { void load().catch((caught) => setError(errorMessage(caught))); }, [load]);

  async function run(key: string, path: string, success: string, body: unknown = {}) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await request(path, ids.adminUserId, { method: "POST", body: JSON.stringify(body) });
      await load();
      setNotice(success);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function saveCopy() {
    setBusy("save");
    setError("");
    setNotice("");
    try {
      await request(`/product-detail-profiles/${profileId}/copy`, ids.adminUserId, {
        method: "PATCH",
        body: JSON.stringify({
          title: copy.title,
          sellingPoints: copy.sellingPoints,
          shortDescription: copy.shortDescription,
          fitSummary: copy.fitSummary,
          conditionSummary: copy.conditionSummary,
          warnings: lines(copy.warnings)
        })
      });
      await load();
      setNotice("详情文案和固定素材已更新。");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function chooseStorefrontMain(choice: DetailMainImageChoice) {
    if (!profile || !choice.selectable || !choice.image) return;
    if (choice.generated && !window.confirm("请对照原图确认 AI 陈列图没有改变 Logo、图案、口袋、纽扣、拉链、抽绳、面料纹理、磨损或瑕疵。确认一致后继续。")) return;
    setBusy(`main-${choice.image.imageId}`);
    setError("");
    setNotice("");
    try {
      await request(`/product-detail-profiles/${encodeURIComponent(profile.id)}/main-image`, ids.adminUserId, {
        method: "POST",
        body: JSON.stringify({ imageId: choice.image.imageId })
      });
      await load();
      setActiveMainImage(choice.key);
      setNotice(`${choice.label}已设为商城主图，发布预览素材已同步更新，请重新确认后批准。`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function generateDisplayImage() {
    if (!profile || !comparison?.cutoutWhite?.imageId) {
      setError("请先完成白底图，再生成 AI 陈列图。");
      return;
    }
    setBusy("ai-display");
    setError("");
    setNotice("");
    try {
      const completed = await generateAiDisplayImage(profile.product.id, comparison.cutoutWhite.imageId, ids.adminUserId);
      await request(`/product-detail-profiles/${encodeURIComponent(profile.id)}/main-image`, ids.adminUserId, {
        method: "POST",
        body: JSON.stringify({ imageId: completed.outputImageId, humanConfirmed: false })
      });
      await load();
      setActiveMainImage("ai-display");
      setNotice("AI 陈列图已重新生成并设为默认商城主图，请对照原图人工确认。");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  if (!profile) return <Status tone={error ? "danger" : "neutral"}>{error || "正在读取商品详情…"}</Status>;
  const assets = profile.assets
    .filter((asset) => CURRENT_DETAIL_ASSET_TYPES.has(asset.type) && (asset.status === "READY" || asset.status === "APPROVED"))
    .sort((left, right) => assetOrder(left.type) - assetOrder(right.type));
  const selectedAsset = assets.find((asset) => asset.type === activeAsset) ?? assets[0];
  const latestJob = profile.generationJobs[0];
  const mainImageChoices = detailMainImageChoices(comparison);
  const currentMainImage = mainImageChoices.find((choice) => choice.key === activeMainImage) ?? mainImageChoices[0];
  const hasSelectedMainImage = Boolean(comparison?.selectedMainImageId);
  const selectedMainIsGenerated = Boolean(mainImageChoices.find((choice) => choice.image?.selectedAsMain)?.generated);
  const aiConfirmationRequired = selectedMainIsGenerated && !comparison?.selectedMainImageConfirmedAt;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 pb-12">
      <header className="border-b pb-4">
        <Link href="/product/details" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeftIcon className="size-4" />返回详情生成</Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-normal">{profile.product.productCode}</h1>
              <Badge variant="outline">{statusLabel(profile.status)}</Badge>
              <Badge variant="outline">源数据 v{profile.sourceDataVersion}</Badge>
              <Badge variant="outline">文案 v{profile.contentVersion}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">第 {profile.product.batchItemNumber ?? "-"} 件 · {labelValue(profile.product.category)} · {profile.product.finalSizeLabel || "尺码未确认"}</p>
          </div>
          <div className="inline-flex w-full rounded-md border p-1 sm:w-auto">
            <Button size="sm" variant={viewMode === "preview" ? "default" : "ghost"} className="flex-1 sm:flex-none" onClick={() => setViewMode("preview")}><EyeIcon data-icon="inline-start" />发布预览</Button>
            <Button size="sm" variant={viewMode === "edit" ? "default" : "ghost"} className="flex-1 sm:flex-none" onClick={() => setViewMode("edit")}><PencilLineIcon data-icon="inline-start" />编辑与素材</Button>
          </div>
        </div>
      </header>

      {error ? <Status tone="danger">{error}</Status> : null}
      {notice ? <Status tone="neutral">{notice}</Status> : null}
      {profile.sourceDataVersion !== profile.product.detailSourceVersion ? <Status tone="danger">商品事实已经变化，此详情版本不可批准。</Status> : null}

      {viewMode === "preview" ? (
        <ProductPublishPreview
          profile={profile}
          copy={copy}
          assets={assets}
          busy={Boolean(busy)}
          approvalBlockedReason={aiConfirmationRequired ? "请先进入“编辑与素材”，对照原图并人工确认 AI 主图。" : null}
          onApprove={() => void run("approve", `/product-detail-profiles/${profile.id}/approve`, "该商品详情已批准。", { employeeId: ids.employeeId })}
          onEdit={() => setViewMode("edit")}
        />
      ) : <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(390px,.95fr)]">
        <div className="min-w-0 space-y-6">
          <section className="min-w-0 space-y-3" aria-label="商城主图确认">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-semibold">商城主图</h2>
                <p className="mt-1 text-xs text-muted-foreground">批量详情生成会先创建 AI 陈列图并默认选为主图；在这里对照原图检查，也可以改选白底图、优化图或均整图。</p>
              </div>
              <Button size="sm" variant="outline" disabled={Boolean(busy) || !comparison?.cutoutWhite?.imageId} onClick={() => void generateDisplayImage()}>
                {busy === "ai-display" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
                {comparison?.aiDisplayMain ? "重新生成 AI 陈列图" : "生成 AI 陈列图"}
              </Button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {mainImageChoices.map((choice) => (
                <Button
                  key={choice.key}
                  size="sm"
                  variant={activeMainImage === choice.key ? "default" : "outline"}
                  className="shrink-0"
                  disabled={!choice.image}
                  onClick={() => setActiveMainImage(choice.key)}
                >
                  {choice.label}{choice.image?.selectedAsMain ? " · 主图" : ""}
                </Button>
              ))}
            </div>

            <div className="flex aspect-square min-h-80 items-center justify-center overflow-hidden rounded-md border bg-white">
              {currentMainImage?.image ? <SafeImage src={variantImageUrl(currentMainImage.image)} alt={currentMainImage.label} /> : <EmptyImage />}
            </div>

            {currentMainImage?.generated ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <p className="font-semibold">生成式陈列图必须人工核对</p>
                <p className="mt-1 text-xs">重点检查 Logo、图案、口袋、纽扣、拉链、抽绳、面料纹理、磨损和瑕疵。任何商品事实改变都不能确认。</p>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className={cn("text-xs", hasSelectedMainImage ? "text-emerald-700" : "font-medium text-amber-700")}>
                {aiConfirmationRequired
                  ? "AI 陈列图已默认设为主图；批准前请点击“人工确认 AI 主图”完成核对。"
                  : hasSelectedMainImage ? "商城主图已人工选择。换图后会同步重建发布预览。" : "尚未选择商城主图；商品发布时仍会执行正式主图与准备度规则。"}
              </p>
              {currentMainImage?.selectable && currentMainImage.image ? (
                <Button
                  size="sm"
                  disabled={Boolean(busy) || (currentMainImage.image.selectedAsMain && !currentMainImage.generated)}
                  onClick={() => void chooseStorefrontMain(currentMainImage)}
                >
                  {currentMainImage.generated && currentMainImage.image.selectedAsMain
                    ? "人工确认 AI 主图"
                    : currentMainImage.image.selectedAsMain ? "已是商城主图" : "设为商城主图"}
                </Button>
              ) : null}
            </div>
          </section>

          <section className="min-w-0 border-t pt-5" aria-label="详情素材">
            <h2 className="mb-3 font-semibold">详情素材</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {assets.map((asset) => (
              <Button key={asset.id} size="sm" variant={activeAsset === asset.type ? "default" : "outline"} className="shrink-0" onClick={() => setActiveAsset(asset.type)}>
                {ASSET_LABELS[asset.type] ?? labelValue(asset.type)}
              </Button>
            ))}
          </div>
          <div className="flex aspect-square min-h-80 items-center justify-center overflow-hidden rounded-md border bg-muted/20">
            {selectedAsset ? <SafeImage src={assetUrl(selectedAsset)} alt={ASSET_LABELS[selectedAsset.type] ?? selectedAsset.type} /> : <EmptyImage />}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {assets.map((asset) => (
              <button key={asset.id} type="button" className={cn("rounded-md border p-2 text-left text-xs", activeAsset === asset.type && "border-foreground bg-muted/50")} onClick={() => setActiveAsset(asset.type)}>
                <span className="font-medium">{ASSET_LABELS[asset.type] ?? asset.type}</span>
                <span className="mt-1 block text-muted-foreground">{statusLabel(asset.status)}</span>
              </button>
            ))}
          </div>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <section className="rounded-md border p-4">
            <h2 className="font-semibold">商品事实</h2>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Fact label="分类" value={labelValue(profile.product.category)} />
              <Fact label="子分类" value={labelValue(profile.product.subcategory)} />
              <Fact label="适用人群" value={labelValue(profile.product.gender)} />
              <Fact label="平台尺码" value={profile.product.finalSizeLabel} />
              <Fact label="版型" value={labelValue(profile.fitType)} />
              <Fact label="弹性" value={labelValue(profile.stretchLevel)} />
              <Fact label="面料厚度" value={labelValue(profile.fabricWeight)} />
              <Fact label="成色" value={labelValue(profile.product.conditionGrade)} />
              <Fact label="价格" value={profile.product.priceKsh ? `KSh ${profile.product.priceKsh}` : null} />
            </div>
          </section>

          <section className="rounded-md border p-4">
            <h2 className="font-semibold">平铺实测</h2>
            <p className="mt-1 text-xs text-muted-foreground">只展示员工确认的衣物厘米数，不推断身高、体重、年龄或身体围度。</p>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {profile.product.measurements.map((item) => <Fact key={item.measurementType} label={measurementLabel(item.measurementType)} value={measurementValue(item.finalValueCm)} />)}
            </div>
          </section>

          <section className="rounded-md border p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">AI 商品文案</h2>
              <span className="text-xs text-muted-foreground">{latestJob?.model || "未调用"}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">商品描述由 AI 在详情生成阶段起草，员工确认或修改后，批准的版本才会成为商城展示描述。</p>
            <div className="mt-3 space-y-3">
              <Field label="标题"><Input value={copy.title} maxLength={120} onChange={(event) => setCopy((current) => ({ ...current, title: event.target.value }))} /></Field>
              {copy.sellingPoints.map((point, index) => <Field key={index} label={`卖点 ${index + 1}`}><Input value={point} maxLength={160} onChange={(event) => setCopy((current) => ({ ...current, sellingPoints: current.sellingPoints.map((item, itemIndex) => itemIndex === index ? event.target.value : item) as EditableCopy["sellingPoints"] }))} /></Field>)}
              <Field label="商品描述"><Textarea rows={4} value={copy.shortDescription} onChange={(event) => setCopy((current) => ({ ...current, shortDescription: event.target.value }))} /></Field>
              <Field label="版型摘要"><Textarea rows={2} value={copy.fitSummary} onChange={(event) => setCopy((current) => ({ ...current, fitSummary: event.target.value }))} /></Field>
              <Field label="成色摘要"><Textarea rows={2} value={copy.conditionSummary} onChange={(event) => setCopy((current) => ({ ...current, conditionSummary: event.target.value }))} /></Field>
              <Field label="审核提醒（每行一条）"><Textarea rows={2} value={copy.warnings} onChange={(event) => setCopy((current) => ({ ...current, warnings: event.target.value }))} /></Field>
              <Button className="w-full sm:w-auto" disabled={Boolean(busy)} onClick={() => void saveCopy()}>{busy === "save" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <FileTextIcon data-icon="inline-start" />}保存文案并重生成素材</Button>
            </div>
          </section>

          <section className="rounded-md border p-4">
            <h2 className="font-semibold">详情操作</h2>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button variant="outline" disabled={Boolean(busy)} onClick={() => void run("assets", `/product-detail-profiles/${profile.id}/assets/generate`, "固定详情素材已重新生成。") }><RefreshCwIcon data-icon="inline-start" />重生成素材</Button>
              <Button variant="outline" disabled={Boolean(busy)} onClick={() => void run("openai", `/product-detail-profiles/${profile.id}/regenerate-openai`, "OpenAI 文案和详情素材已重新生成。") }><SparklesIcon data-icon="inline-start" />重新调用 OpenAI</Button>
              <Button disabled={Boolean(busy) || profile.status === "APPROVED"} onClick={() => void run("approve", `/product-detail-profiles/${profile.id}/approve`, "该商品详情已批准。", { employeeId: ids.employeeId }) }><CheckCircle2Icon data-icon="inline-start" />批准现有详情</Button>
            </div>
            <div className="mt-4 border-t pt-4">
              <Field label="退回校准原因"><Textarea rows={2} placeholder="说明需要员工重新确认的商品事实。" value={recalibrationReason} onChange={(event) => setRecalibrationReason(event.target.value)} /></Field>
              <Button className="mt-2" variant="outline" disabled={Boolean(busy) || !recalibrationReason.trim()} onClick={() => void run("recalibration", `/operations/product-batches/products/${profile.product.id}/recalibration`, "商品已退回人工校准。", { employeeId: ids.employeeId, reason: recalibrationReason }) }><RotateCcwIcon data-icon="inline-start" />标记重新校准</Button>
            </div>
          </section>
        </div>
      </div>}
    </div>
  );
}

function ProductPublishPreview({
  profile,
  copy,
  assets,
  busy,
  approvalBlockedReason,
  onApprove,
  onEdit
}: {
  profile: DetailProfile;
  copy: EditableCopy;
  assets: DetailAsset[];
  busy: boolean;
  approvalBlockedReason: string | null;
  onApprove: () => void;
  onEdit: () => void;
}) {
  const assetByType = new Map(assets.map((asset) => [asset.type, asset]));
  const main = assetByType.get("FRONT_MAIN");
  const back = assetByType.get("BACK_MAIN");
  const measurementGuide = assetByType.get("MEASUREMENT_GUIDE");
  const evidence = profile.product.images.filter((image) => ["DETAIL", "DEFECT"].includes(image.type));
  const sellingPoints = detailSellingPointsWithoutPrice(copy.sellingPoints);
  const shortDescription = detailCopyWithoutPrice(copy.shortDescription);
  const conditionSummary = detailConditionSummary(copy.conditionSummary, profile.product.defects.length);

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="flex flex-col gap-3 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><Badge>发布预览</Badge><span className="text-sm font-medium">顾客视角 · 尚未发布</span></div>
          <p className="mt-1 text-xs text-muted-foreground">按顾客购买顺序核对图片、标题、价格、尺码、版型、成色、瑕疵和配送说明。批准只确认详情草稿，不会发布商品。</p>
        </div>
        <Button size="sm" variant="outline" onClick={onEdit}><PencilLineIcon data-icon="inline-start" />编辑内容</Button>
      </div>

      <section className="grid border-b lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]">
        <div className="flex min-h-[420px] items-center justify-center border-b bg-muted/10 p-4 lg:border-r lg:border-b-0">
          {main ? <SafeImage src={assetUrl(main)} alt={`${copy.title || profile.product.productCode} 主图`} /> : <EmptyImage />}
        </div>
        <div className="p-5 sm:p-7">
          <h2 className="text-2xl font-semibold tracking-normal">{normalizedProductTitle(copy.title || profile.product.title || "", profile.product.brand) || profile.product.productCode}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-xl font-semibold">{priceLabel(profile.product.priceKsh)}</span>
            <Badge variant="outline">一物一件</Badge>
          </div>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{shortDescription || "商品描述尚未生成，请进入编辑与素材补充。"}</p>
          {sellingPoints.length ? <ul className="mt-4 space-y-2 text-sm">{sellingPoints.map((point) => <li key={point} className="border-l-2 pl-3">{point}</li>)}</ul> : null}
          <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-3 border-t pt-4 text-sm">
            <OptionalPreviewFact label="平台尺码" value={profile.product.finalSizeLabel} />
            <OptionalPreviewFact label="英码" value={profile.product.ukSizeLabel} />
            <OptionalPreviewFact label="分类" value={labelValue(profile.product.subcategory || profile.product.category)} />
            <OptionalPreviewFact label="适用人群" value={labelValue(profile.product.gender)} />
            <OptionalPreviewFact label="面料" value={profile.product.material} />
            <OptionalPreviewFact label="颜色" value={profile.product.color} />
            <OptionalPreviewFact label="成色" value={labelValue(profile.product.conditionGrade)} />
          </dl>
        </div>
      </section>

      {back || evidence.length ? (
        <section className="border-b px-4 py-5 sm:px-6">
          <h2 className="text-lg font-semibold">可用商品图片</h2>
          <p className="mt-1 text-xs text-muted-foreground">仅显示实际存在的背面、细节和瑕疵照片；缺少的图片不会生成占位卡。</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {back ? <figure className="overflow-hidden rounded-md border"><div className="aspect-square bg-white"><SafeImage src={assetUrl(back)} alt="背面实物" /></div><figcaption className="border-t px-3 py-2 text-xs">背面实物</figcaption></figure> : null}
            {evidence.map((image) => <figure key={image.id} className="overflow-hidden rounded-md border"><div className="aspect-square bg-white"><SafeImage src={sourceImageUrl(profile.product.id, image)} alt={sourceImageLabel(image.type)} /></div><figcaption className="border-t px-3 py-2 text-xs">{sourceImageLabel(image.type)}</figcaption></figure>)}
          </div>
        </section>
      ) : null}

      <section className="grid border-b md:grid-cols-2">
        <div className="border-b p-5 md:border-r md:border-b-0">
          <h3 className="font-semibold">平铺实测尺寸</h3>
          {measurementGuide ? <div className="mt-4 aspect-square overflow-hidden rounded-md border bg-white"><SafeImage src={assetUrl(measurementGuide)} alt="尺码指南" /></div> : null}
          {measurementGuide?.templateCode ? <p className="mt-2 text-xs text-muted-foreground">模板 {measurementGuide.templateCode} · {measurementGuide.templateVersion}</p> : null}
          <dl className="mt-4 space-y-2 text-sm">{profile.product.measurements.filter((item) => item.finalValueCm != null).map((item) => <PreviewFact key={item.measurementType} label={measurementLabel(item.measurementType)} value={measurementValue(item.finalValueCm)} row />)}</dl>
          <p className="mt-4 text-xs text-muted-foreground">Flat garment measurements in centimetres. Compare with a similar item you own.</p>
        </div>
        <div className="p-5">
          <h3 className="font-semibold">成色与瑕疵</h3>
          <OptionalPreviewFact label="成色" value={labelValue(profile.product.conditionGrade)} />
          {conditionSummary ? <p className="mt-3 text-sm text-muted-foreground">{conditionSummary}</p> : null}
          {profile.product.defects.length ? <ul className="mt-4 space-y-2 text-sm">{profile.product.defects.map((defect) => <li key={`${defect.defectType}-${defect.description}`} className="border-l-2 pl-3">{defect.customerSafeDescription || defect.description}</li>)}</ul> : null}
        </div>
      </section>

      <section className="grid border-b md:grid-cols-2">
        <div className="border-b p-5 md:border-r md:border-b-0">
          <h3 className="font-semibold">版型建议</h3>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <OptionalPreviewFact label="版型" value={labelValue(profile.fitType)} />
            <OptionalPreviewFact label="弹性" value={labelValue(profile.stretchLevel)} />
            <OptionalPreviewFact label="面料厚度" value={labelValue(profile.fabricWeight)} />
          </dl>
          {copy.fitSummary ? <p className="mt-4 text-sm text-muted-foreground">{copy.fitSummary}</p> : null}
          <p className="mt-4 text-xs text-muted-foreground">Fit recommendations are approximate. Please compare the garment measurements with an item that fits you well.</p>
        </div>
        <div className="p-5">
          <h3 className="font-semibold">配送与支持</h3>
          <div className="mt-3 space-y-4 text-sm">
            <div><p className="font-medium">Collection</p><p className="mt-1 text-muted-foreground">Pickup available in Kikuyu. Exact collection details are confirmed after order.</p></div>
            <div><p className="font-medium">Local delivery</p><p className="mt-1 text-muted-foreground">Delivery options and fees are shown at checkout based on your area.</p></div>
            <div><p className="font-medium">Support</p><p className="mt-1 text-muted-foreground">Review the original photos and measurements before purchase. Contact Direct Loop support if the received item does not match the approved listing.</p></div>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className={cn("text-xs", approvalBlockedReason ? "font-medium text-amber-700" : "text-muted-foreground")}>{approvalBlockedReason || "详情批准只确认当前草稿；商品发布仍由价格、库存、状态和商品控制规则共同决定。"}</p>
        <Button disabled={busy || Boolean(approvalBlockedReason) || profile.status === "APPROVED"} onClick={onApprove}><CheckCircle2Icon data-icon="inline-start" />{profile.status === "APPROVED" ? "详情已批准" : "批准现有详情"}</Button>
      </div>
    </div>
  );
}

function PreviewFact({ label, value, row = false }: { label: string; value: unknown; row?: boolean }) {
  return <div className={row ? "flex items-start justify-between gap-3 border-b pb-2 last:border-0" : ""}><dt className="text-xs text-muted-foreground">{label}</dt><dd className={cn("mt-0.5 break-words", row && "mt-0 text-right")}>{value == null || value === "" ? "-" : String(value)}</dd></div>;
}

function OptionalPreviewFact({ label, value }: { label: string; value: unknown }) {
  if (value == null || value === "") return null;
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 break-words">{String(value)}</dd></div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="bg-background px-2 py-3 text-center"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold tabular-nums">{value}</div></div>;
}

function Status({ tone, children }: { tone: "danger" | "neutral"; children: ReactNode }) {
  return <div className={cn("rounded-md border px-4 py-3 text-sm", tone === "danger" ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted/40 text-muted-foreground")}>{children}</div>;
}

function Fact({ label, value, wide = false }: { label: string; value: unknown; wide?: boolean }) {
  return <div className={wide ? "col-span-2" : ""}><div className="text-xs text-muted-foreground">{label}</div><div className="mt-0.5 whitespace-pre-wrap break-words">{value == null || value === "" ? "-" : String(value)}</div></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="mb-1.5 block font-medium">{label}</span>{children}</label>;
}

function SafeImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <EmptyImage />;
  return <img src={src} alt={alt} className="size-full object-contain" onError={() => setFailed(true)} />;
}

function detailMainImageChoices(comparison: ProductImageComparisonResponse | null): DetailMainImageChoice[] {
  return [
    { key: "white", label: "白底正面", image: comparison?.cutoutWhite ?? null, selectable: true, generated: false },
    { key: "back-white", label: "白底背面", image: comparison?.backCutoutWhite ?? null, selectable: false, generated: false },
    { key: "ai-display", label: "AI 陈列图", image: comparison?.aiDisplayMain ?? null, selectable: true, generated: true }
  ];
}

function variantImageUrl(image: ProductImageVariantRecord) {
  if (image.publicUrl) return image.publicUrl.startsWith("http") ? image.publicUrl : `${API_PROXY_URL}${image.publicUrl}`;
  return "";
}

function EmptyImage({ compact = false }: { compact?: boolean } = {}) {
  return <div className="flex size-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><ImageOffIcon className={compact ? "size-4" : "size-6"} />{compact ? null : "素材尚未生成"}</div>;
}

function assetUrl(asset: DetailAsset) {
  if (asset.publicUrl) return asset.publicUrl.startsWith("http") ? asset.publicUrl : `${API_PROXY_URL}${asset.publicUrl}`;
  return productDetailAssetProxyUrl(API_PROXY_URL, asset);
}

function sourceImageUrl(productId: string, image: { id: string; publicUrl?: string | null }) {
  if (image.publicUrl) return image.publicUrl.startsWith("http") ? image.publicUrl : `${API_PROXY_URL}${image.publicUrl}`;
  return `${API_PROXY_URL}/products/${productId}/images/${image.id}/content`;
}

function sourceImageLabel(type: string) {
  return ({ LABEL: "标签原图", DETAIL: "细节原图", DEFECT: "瑕疵原图" } as Record<string, string>)[type] ?? labelValue(type);
}

function priceLabel(value?: number | null) {
  return value == null ? "价格待确认" : `KSh ${new Intl.NumberFormat("en-KE").format(value)}`;
}

function copyFromJson(value: unknown, fallbackTitle: string, confirmedDefectCount = 0): EditableCopy {
  const record = isRecord(value) ? value : {};
  const points = detailSellingPointsWithoutPrice(stringArray(record.sellingPoints));
  return {
    title: stringValue(record.title) || fallbackTitle,
    sellingPoints: [points[0] ?? "", points[1] ?? "", points[2] ?? ""],
    shortDescription: detailCopyWithoutPrice(stringValue(record.shortDescription)),
    fitSummary: stringValue(record.fitSummary),
    conditionSummary: detailConditionSummary(stringValue(record.conditionSummary), confirmedDefectCount),
    warnings: stringArray(record.warnings).join("\n")
  };
}

function emptyCopy(): EditableCopy {
  return { title: "", sellingPoints: ["", "", ""], shortDescription: "", fitSummary: "", conditionSummary: "", warnings: "" };
}

function lines(value: string, separator = "\n") {
  return value.split(separator).map((item) => item.trim()).filter(Boolean);
}

function statusLabel(value?: string | null) {
  return ({ AWAITING_CALIBRATION: "等待校准", AWAITING_BATCH: "等待本批其他商品", PENDING: "待生成", GENERATING: "生成中", READY: "待批准", FAILED: "失败", OUTDATED: "已过期", APPROVED: "已批准" } as Record<string, string>)[value ?? ""] ?? labelValue(value);
}

function assetOrder(type: string) {
  return PRODUCT_DETAIL_ASSET_PLAN.findIndex((asset) => asset.type === type);
}

function assetShortTitle(type: string) {
  return PRODUCT_DETAIL_ASSET_PLAN.find((asset) => asset.type === type)?.shortTitle ?? labelValue(type);
}

function normalizedProductTitle(title: string, brand?: string | null) {
  const cleanTitle = title.trim().replace(/\s+/g, " ");
  const cleanBrand = brand?.trim().replace(/\s+/g, " ") ?? "";
  if (!cleanBrand) return cleanTitle;
  const brandPrefix = new RegExp(`^(?:${escapeRegExp(cleanBrand)}\\s+)+`, "i");
  const withoutRepeatedBrand = cleanTitle.replace(brandPrefix, "").trim();
  return `${cleanBrand}${withoutRepeatedBrand ? ` ${withoutRepeatedBrand}` : ""}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelValue(value: unknown) { return typeof value === "string" ? value.replaceAll("_", " ") : ""; }
function stringValue(value: unknown) { return typeof value === "string" ? value : ""; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function errorMessage(value: unknown) { return value instanceof Error ? value.message : "操作失败。"; }
function measurementValue(value: unknown) { return value == null ? null : `${Number(value)} cm`; }
function measurementLabel(value: string) { return ({ LENGTH: "衣长", CHEST_WIDTH: "胸宽", SHOULDER_WIDTH: "肩宽", SLEEVE_LENGTH: "袖长", WAIST: "腰宽", HIP: "臀宽", INSEAM: "内长", OUTSEAM: "裤长", LEG_OPENING: "裤脚宽", THIGH_WIDTH: "大腿宽" } as Record<string, string>)[value] ?? labelValue(value); }
