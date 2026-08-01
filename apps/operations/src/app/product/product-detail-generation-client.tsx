"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  FileTextIcon,
  ImageOffIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SparklesIcon
} from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const API_PROXY_URL = "/api-proxy";
const ASSET_LABELS: Record<string, string> = {
  FRONT_MAIN: "正面主图",
  BACK_MAIN: "背面主图",
  MEASUREMENT_GUIDE: "测量说明",
  FIT_GUIDE: "版型建议",
  CONDITION_GUIDE: "成色说明",
  SHARE_CARD: "分享图"
};

type BatchProduct = {
  id: string;
  productCode: string;
  batchItemNumber?: number | null;
  productStatus: string;
  profileId?: string | null;
  detailStatus?: string | null;
};

type DetailBatch = {
  id: string;
  batchCode: string;
  targetCount: number;
  createdAt: string;
  calibrated: number;
  pending: number;
  generating: number;
  succeeded: number;
  failed: number;
  outdated: number;
  approved: number;
  products: BatchProduct[];
};

type DetailAsset = {
  id: string;
  type: string;
  status: string;
  publicUrl?: string | null;
  mimeType?: string | null;
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
    finalSizeLabel?: string | null;
    conditionGrade?: string | null;
    priceKsh?: number | null;
    detailSourceVersion: number;
    measurements: Array<{ measurementType: string; finalValueCm?: unknown }>;
    defects: Array<{ defectType: string; severity: string; description: string; customerSafeDescription?: string | null }>;
  };
};

type EditableCopy = {
  title: string;
  sellingPoints: [string, string, string];
  shortDescription: string;
  fitSummary: string;
  measurementSummary: string;
  conditionSummary: string;
  styleTags: string;
  missingInformation: string;
  warnings: string;
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

function useOperationIds() {
  const { session } = useOperationsSession();
  return useMemo(() => ({
    adminUserId: String(session?.adminUser?.id ?? ""),
    employeeId: String(session?.adminUser?.linkedEmployeeId ?? "")
  }), [session]);
}

export function ProductDetailGenerationPage() {
  const ids = useOperationIds();
  const [batches, setBatches] = useState<DetailBatch[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    setBatches(await request<DetailBatch[]>("/operations/product-detail-generation", ids.adminUserId));
  }, [ids.adminUserId]);

  useEffect(() => { void load().catch((caught) => setError(errorMessage(caught))); }, [load]);

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

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 pb-10">
      <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">商品中心</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal">详情生成</h1>
          <p className="mt-1 text-sm text-muted-foreground">主管检查自动生成的商品详情，不进入普通员工上传主流程。</p>
        </div>
        <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void load()}>
          <RefreshCwIcon data-icon="inline-start" />刷新
        </Button>
      </header>

      {error ? <Status tone="danger">{error}</Status> : null}
      {notice ? <Status tone="neutral">{notice}</Status> : null}
      {!batches.length ? <Status tone="neutral">暂无已完成校准的批次。</Status> : null}

      <div className="flex flex-col gap-4">
        {batches.map((batch) => {
          const actionBusy = busy.startsWith(batch.id);
          const readyForApproval = batch.succeeded + batch.approved === batch.targetCount;
          return (
            <section key={batch.id} className="rounded-md border bg-background p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{batch.batchCode}</h2>
                    <Badge variant="outline">校准 {batch.calibrated}/{batch.targetCount}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(batch.createdAt).toLocaleString("zh-CN")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={actionBusy || batch.pending === 0} onClick={() => void run(`${batch.id}-generate`, `/operations/product-batches/${batch.id}/detail-generation/run`, "本批详情生成已完成。") }>
                    {busy === `${batch.id}-generate` ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}生成本批
                  </Button>
                  <Button size="sm" variant="outline" disabled={actionBusy || batch.failed === 0} onClick={() => void run(`${batch.id}-failed`, `/operations/product-batches/${batch.id}/detail-generation/retry-failed`, "失败任务已重试。") }>
                    重试失败
                  </Button>
                  <Button size="sm" variant="outline" disabled={actionBusy || batch.outdated === 0} onClick={() => void run(`${batch.id}-outdated`, `/operations/product-batches/${batch.id}/detail-generation/regenerate-outdated`, "过期详情已重新生成。") }>
                    重生成过期项
                  </Button>
                  <Button size="sm" variant="outline" disabled={actionBusy || !readyForApproval || batch.approved === batch.targetCount} onClick={() => void run(`${batch.id}-approve`, `/operations/product-batches/${batch.id}/detail-generation/approve`, "本批详情已批准。", true) }>
                    <CheckCircle2Icon data-icon="inline-start" />整批批准
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
                <Metric label="待生成" value={batch.pending} />
                <Metric label="生成中" value={batch.generating} />
                <Metric label="成功" value={batch.succeeded} />
                <Metric label="失败" value={batch.failed} />
                <Metric label="已过期" value={batch.outdated} />
                <Metric label="已批准" value={batch.approved} />
                <Metric label="总数" value={batch.targetCount} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10">
                {batch.products.map((product) => product.profileId ? (
                  <Link key={product.id} href={`/product/details/${product.profileId}`} className="rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/60">
                    <div className="font-medium">第 {product.batchItemNumber ?? "-"} 件</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{statusLabel(product.detailStatus)}</div>
                  </Link>
                ) : (
                  <div key={product.id} className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                    <div>第 {product.batchItemNumber ?? "-"} 件</div>
                    <div className="mt-1 text-xs">待创建</div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function ProductDetailReviewPage({ profileId }: { profileId: string }) {
  const ids = useOperationIds();
  const [profile, setProfile] = useState<DetailProfile | null>(null);
  const [copy, setCopy] = useState<EditableCopy>(emptyCopy());
  const [activeAsset, setActiveAsset] = useState("FRONT_MAIN");
  const [recalibrationReason, setRecalibrationReason] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    const next = await request<DetailProfile>(`/product-detail-profiles/${encodeURIComponent(profileId)}`, ids.adminUserId);
    setProfile(next);
    setCopy(copyFromJson(next.finalOutputJson, next.product.title ?? ""));
    if (!next.assets.some((asset) => asset.type === activeAsset)) setActiveAsset(next.assets[0]?.type ?? "FRONT_MAIN");
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
          measurementSummary: copy.measurementSummary,
          conditionSummary: copy.conditionSummary,
          styleTags: lines(copy.styleTags, ","),
          missingInformation: lines(copy.missingInformation),
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

  if (!profile) return <Status tone={error ? "danger" : "neutral"}>{error || "正在读取商品详情…"}</Status>;
  const assets = [...profile.assets].sort((left, right) => assetOrder(left.type) - assetOrder(right.type));
  const selectedAsset = assets.find((asset) => asset.type === activeAsset) ?? assets[0];
  const latestJob = profile.generationJobs[0];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 pb-12">
      <header className="border-b pb-4">
        <Link href="/product/details" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeftIcon className="size-4" />返回详情生成</Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-normal">{profile.product.productCode}</h1>
          <Badge variant="outline">{statusLabel(profile.status)}</Badge>
          <Badge variant="outline">源数据 v{profile.sourceDataVersion}</Badge>
          <Badge variant="outline">文案 v{profile.contentVersion}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">第 {profile.product.batchItemNumber ?? "-"} 件 · {labelValue(profile.product.category)} · {profile.product.finalSizeLabel || "尺码未确认"}</p>
      </header>

      {error ? <Status tone="danger">{error}</Status> : null}
      {notice ? <Status tone="neutral">{notice}</Status> : null}
      {profile.sourceDataVersion !== profile.product.detailSourceVersion ? <Status tone="danger">商品事实已经变化，此详情版本不可批准。</Status> : null}

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(390px,.95fr)]">
        <section className="min-w-0">
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
              <Fact label="预计穿着" value={profile.expectedFit} />
            </div>
          </section>

          <section className="rounded-md border p-4">
            <h2 className="font-semibold">实测与推荐范围</h2>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {profile.product.measurements.map((item) => <Fact key={item.measurementType} label={measurementLabel(item.measurementType)} value={measurementValue(item.finalValueCm)} />)}
              <Fact label="建议胸围" value={range(profile.bodyChestMinCm, profile.bodyChestMaxCm, "cm")} />
              <Fact label="建议腰围" value={range(profile.bodyWaistMinCm, profile.bodyWaistMaxCm, "cm")} />
              <Fact label="建议臀围" value={range(profile.bodyHipMinCm, profile.bodyHipMaxCm, "cm")} />
              <Fact label="身高参考" value={range(profile.heightMinCm, profile.heightMaxCm, "cm")} />
              <Fact label="体重参考" value={range(profile.weightMinKg, profile.weightMaxKg, "kg")} />
              <Fact label="置信度" value={profile.recommendationConfidence == null ? null : `${Math.round(Number(profile.recommendationConfidence) * 100)}%`} />
              <Fact label="判断依据" value={jsonText(profile.recommendationBasis)} wide />
              <Fact label="警告" value={jsonText(profile.recommendationWarnings)} wide />
              <Fact label="免责声明" value={profile.sizeDisclaimer} wide />
            </div>
          </section>

          <section className="rounded-md border p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">AI 商品文案</h2>
              <span className="text-xs text-muted-foreground">{latestJob?.model || "未调用"}</span>
            </div>
            <div className="mt-3 space-y-3">
              <Field label="标题"><Input value={copy.title} maxLength={120} onChange={(event) => setCopy((current) => ({ ...current, title: event.target.value }))} /></Field>
              {copy.sellingPoints.map((point, index) => <Field key={index} label={`卖点 ${index + 1}`}><Input value={point} maxLength={160} onChange={(event) => setCopy((current) => ({ ...current, sellingPoints: current.sellingPoints.map((item, itemIndex) => itemIndex === index ? event.target.value : item) as EditableCopy["sellingPoints"] }))} /></Field>)}
              <Field label="短描述"><Textarea rows={3} value={copy.shortDescription} onChange={(event) => setCopy((current) => ({ ...current, shortDescription: event.target.value }))} /></Field>
              <Field label="版型摘要"><Textarea rows={2} value={copy.fitSummary} onChange={(event) => setCopy((current) => ({ ...current, fitSummary: event.target.value }))} /></Field>
              <Field label="尺寸摘要"><Textarea rows={2} value={copy.measurementSummary} onChange={(event) => setCopy((current) => ({ ...current, measurementSummary: event.target.value }))} /></Field>
              <Field label="成色摘要"><Textarea rows={2} value={copy.conditionSummary} onChange={(event) => setCopy((current) => ({ ...current, conditionSummary: event.target.value }))} /></Field>
              <Field label="风格标签（逗号分隔）"><Input value={copy.styleTags} onChange={(event) => setCopy((current) => ({ ...current, styleTags: event.target.value }))} /></Field>
              <Field label="缺失信息（每行一项）"><Textarea rows={2} value={copy.missingInformation} onChange={(event) => setCopy((current) => ({ ...current, missingInformation: event.target.value }))} /></Field>
              <Field label="警告（每行一项）"><Textarea rows={2} value={copy.warnings} onChange={(event) => setCopy((current) => ({ ...current, warnings: event.target.value }))} /></Field>
              <Button className="w-full sm:w-auto" disabled={Boolean(busy)} onClick={() => void saveCopy()}>{busy === "save" ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <FileTextIcon data-icon="inline-start" />}保存文案并重生成素材</Button>
            </div>
          </section>

          <section className="rounded-md border p-4">
            <h2 className="font-semibold">详情操作</h2>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button variant="outline" disabled={Boolean(busy)} onClick={() => void run("fit", `/product-detail-profiles/${profile.id}/recalculate-fit`, "版型推荐和素材已重新计算。") }><RefreshCwIcon data-icon="inline-start" />重算版型</Button>
              <Button variant="outline" disabled={Boolean(busy)} onClick={() => void run("assets", `/product-detail-profiles/${profile.id}/assets/generate`, "固定详情素材已重新生成。") }><RefreshCwIcon data-icon="inline-start" />重生成素材</Button>
              <Button variant="outline" disabled={Boolean(busy)} onClick={() => void run("openai", `/product-detail-profiles/${profile.id}/regenerate-openai`, "OpenAI 文案和详情素材已重新生成。") }><SparklesIcon data-icon="inline-start" />重新调用 OpenAI</Button>
              <Button disabled={Boolean(busy) || profile.status === "APPROVED"} onClick={() => void run("approve", `/product-detail-profiles/${profile.id}/approve`, "该商品详情已批准。", { employeeId: ids.employeeId }) }><CheckCircle2Icon data-icon="inline-start" />批准详情</Button>
            </div>
            <div className="mt-4 border-t pt-4">
              <Field label="退回校准原因"><Textarea rows={2} placeholder="说明需要员工重新确认的商品事实。" value={recalibrationReason} onChange={(event) => setRecalibrationReason(event.target.value)} /></Field>
              <Button className="mt-2" variant="outline" disabled={Boolean(busy) || !recalibrationReason.trim()} onClick={() => void run("recalibration", `/operations/product-batches/products/${profile.product.id}/recalibration`, "商品已退回人工校准。", { employeeId: ids.employeeId, reason: recalibrationReason }) }><RotateCcwIcon data-icon="inline-start" />标记重新校准</Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border px-2 py-3 text-center"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold tabular-nums">{value}</div></div>;
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

function EmptyImage() {
  return <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground"><ImageOffIcon className="size-6" />素材尚未生成</div>;
}

function assetUrl(asset: DetailAsset) {
  if (asset.publicUrl) return asset.publicUrl.startsWith("http") ? asset.publicUrl : `${API_PROXY_URL}${asset.publicUrl}`;
  return `${API_PROXY_URL}/product-detail-assets/${asset.id}/content`;
}

function copyFromJson(value: unknown, fallbackTitle: string): EditableCopy {
  const record = isRecord(value) ? value : {};
  const points = stringArray(record.sellingPoints);
  return {
    title: stringValue(record.title) || fallbackTitle,
    sellingPoints: [points[0] ?? "", points[1] ?? "", points[2] ?? ""],
    shortDescription: stringValue(record.shortDescription),
    fitSummary: stringValue(record.fitSummary),
    measurementSummary: stringValue(record.measurementSummary),
    conditionSummary: stringValue(record.conditionSummary),
    styleTags: stringArray(record.styleTags).join(", "),
    missingInformation: stringArray(record.missingInformation).join("\n"),
    warnings: stringArray(record.warnings).join("\n")
  };
}

function emptyCopy(): EditableCopy {
  return { title: "", sellingPoints: ["", "", ""], shortDescription: "", fitSummary: "", measurementSummary: "", conditionSummary: "", styleTags: "", missingInformation: "", warnings: "" };
}

function lines(value: string, separator = "\n") {
  return value.split(separator).map((item) => item.trim()).filter(Boolean);
}

function statusLabel(value?: string | null) {
  return ({ PENDING: "待生成", GENERATING: "生成中", READY: "待批准", FAILED: "失败", OUTDATED: "已过期", APPROVED: "已批准" } as Record<string, string>)[value ?? ""] ?? labelValue(value);
}

function assetOrder(type: string) {
  return ["FRONT_MAIN", "BACK_MAIN", "MEASUREMENT_GUIDE", "FIT_GUIDE", "CONDITION_GUIDE", "SHARE_CARD"].indexOf(type);
}

function labelValue(value: unknown) { return typeof value === "string" ? value.replaceAll("_", " ") : ""; }
function stringValue(value: unknown) { return typeof value === "string" ? value : ""; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function errorMessage(value: unknown) { return value instanceof Error ? value.message : "操作失败。"; }
function range(min: unknown, max: unknown, unit: string) { return min == null || max == null ? null : `${Number(min)}–${Number(max)} ${unit}`; }
function measurementValue(value: unknown) { return value == null ? null : `${Number(value)} cm`; }
function jsonText(value: unknown) { return Array.isArray(value) ? value.join("；") : value && typeof value === "object" ? JSON.stringify(value) : value; }
function measurementLabel(value: string) { return ({ LENGTH: "衣长", CHEST_WIDTH: "胸宽", SHOULDER_WIDTH: "肩宽", SLEEVE_LENGTH: "袖长", WAIST: "腰宽", HIP: "臀宽", INSEAM: "内长", OUTSEAM: "裤长", LEG_OPENING: "裤脚宽", THIGH_WIDTH: "大腿宽" } as Record<string, string>)[value] ?? labelValue(value); }
