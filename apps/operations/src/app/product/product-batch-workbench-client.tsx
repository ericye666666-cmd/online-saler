"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  Clock3Icon,
  ListChecksIcon,
  PackageCheckIcon,
  PlusIcon,
  RefreshCwIcon
} from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { productStatusLabel } from "./product-factory-display";
import {
  PRODUCT_FACTORY_STAGE_LABELS,
  PRODUCT_FACTORY_STAGE_ORDER,
  batchFollowingStageLabel,
  batchNextActionHref
} from "./product-factory-batch-display";

const API_PROXY_URL = "/api-proxy";

type ProductRecord = Record<string, unknown> & {
  id: string;
  productCode: string;
  batchItemNumber?: number | null;
  status: string;
  barcode?: string | null;
  labelPrintedAt?: string | null;
  images?: Array<Record<string, unknown>>;
  aiExtractions?: Array<Record<string, unknown>>;
  inventoryItem?: Record<string, unknown> | null;
};

type ProductBatch = {
  id: string;
  batchCode: string;
  status: string;
  targetCount: number;
  completedCount: number;
  createdByEmployeeId?: string | null;
  createdAt: string;
  updatedAt: string;
  stage: string;
  stageIndex: number;
  stageLabel: string;
  stageCompletedCount: number;
  nextAction: string;
  nextActionLabel: string;
  exceptionCount: number;
  counts: Record<string, number>;
  products: ProductRecord[];
};

type ProductSummary = {
  employeeId: string;
  metrics: {
    todayNewBatches: number;
    todayCompletedProducts: number;
    activeBatchCount: number;
    exceptionCount: number;
  };
  continueBatch: ProductBatch | null;
  activeBatches: ProductBatch[];
  tasks: {
    upload: number;
    aiImage: number;
    calibration: number;
    labelApply: number;
    review: number;
    storage: number;
  };
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

async function loadSummary(ids: ReturnType<typeof useOperationIds>): Promise<ProductSummary> {
  const query = new URLSearchParams(ids);
  return request<ProductSummary>(`/operations/product-batches/summary?${query.toString()}`);
}

export function ProductWorkbenchPage() {
  const ids = useOperationIds();
  const { hasPermission } = useOperationsSession();
  const [summary, setSummary] = useState<ProductSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    setBusy(true);
    setError("");
    try {
      setSummary(await loadSummary(ids));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取今日工作。 ");
    } finally {
      setBusy(false);
    }
  }, [ids]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = summary?.metrics;
  const tasks = summary?.tasks;
  const continueBatch = summary?.continueBatch;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="商品工厂"
        title="今日工作"
        description="按批次完成 10 件商品的上传、AI、校准、贴码、审核、入仓和发布。"
        action={
          <Button asChild disabled={!hasPermission("action.product.create")}>
            <Link href="/product/new-batch"><PlusIcon data-icon="inline-start" />新建批次</Link>
          </Button>
        }
      />
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="今日指标">
        <Metric title="今日新建批次" value={metrics?.todayNewBatches ?? 0} />
        <Metric title="今日完成商品" value={metrics?.todayCompletedProducts ?? 0} />
        <Metric title="进行中批次" value={metrics?.activeBatchCount ?? 0} />
        <Metric title="待处理异常" value={metrics?.exceptionCount ?? 0} tone={metrics?.exceptionCount ? "danger" : "default"} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)]">
        <Card>
          <CardHeader>
            <CardTitle>继续工作</CardTitle>
            <CardDescription>系统只显示当前批次此刻允许执行的下一步。</CardDescription>
          </CardHeader>
          <CardContent>
            {continueBatch ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{continueBatch.batchCode}</span>
                    <StageBadge stage={continueBatch.stage} label={continueBatch.stageLabel} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    当前步骤 {continueBatch.stageCompletedCount}/{continueBatch.targetCount}，下一步：{continueBatch.nextActionLabel}
                  </p>
                  <ProgressBar value={continueBatch.stageCompletedCount} max={continueBatch.targetCount} />
                </div>
                <Button asChild className="w-full shrink-0 sm:w-auto">
                  <Link href={`/product/batches/${continueBatch.id}`}>继续本批次<ArrowRightIcon data-icon="inline-end" /></Link>
                </Button>
              </div>
            ) : (
              <EmptyState title="没有进行中的批次" description="新建一个 10 件批次后，下一步会出现在这里。" action={<Button asChild><Link href="/product/new-batch">新建批次</Link></Button>} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>待处理异常</CardTitle>
            <CardDescription>退回返工和处理失败的商品集中在这里。</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <div>
              <div className="text-3xl font-semibold tabular-nums">{metrics?.exceptionCount ?? 0}</div>
              <p className="text-sm text-muted-foreground">件需要处理</p>
            </div>
            <Button asChild variant="outline"><Link href="/product/exceptions">查看异常</Link></Button>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>今日任务</CardTitle>
          <CardDescription>按流程顺序查看当前等待处理的商品数量。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <TaskRow label="上传图片" value={tasks?.upload ?? 0} href="/product/waiting-upload" />
          <TaskRow label="AI 与图片处理" value={tasks?.aiImage ?? 0} href="/product/waiting-ai" />
          <TaskRow label="人工校准" value={tasks?.calibration ?? 0} href="/product/calibration" />
          <TaskRow label="打印并贴码" value={tasks?.labelApply ?? 0} href="/product/barcode" />
          <TaskRow label="商品审核" value={tasks?.review ?? 0} href="/product/review" />
          <TaskRow label="扫码入仓" value={tasks?.storage ?? 0} href="/product/review" />
        </CardContent>
      </Card>
    </div>
  );
}

export function NewBatchPage() {
  const ids = useOperationIds();
  const router = useRouter();
  const { hasPermission } = useOperationsSession();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createBatch() {
    setBusy(true);
    setError("");
    try {
      const batch = await request<ProductBatch>("/operations/product-batches", {
        method: "POST",
        body: JSON.stringify({ ...ids, targetCount: 10, note: note.trim() || undefined })
      });
      router.push(`/product/batches/${batch.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法创建批次。 ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader eyebrow="商品工厂" title="新建批次" description="每批固定 10 件。创建后直接进入连续上传。" />
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      <Card>
        <CardHeader>
          <CardTitle>10 件商品批次</CardTitle>
          <CardDescription>系统会生成 10 个有顺序的商品位置，正式 Barcode 在全部校准完成后生成。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <label className="block space-y-2 text-sm font-medium">
            批次备注（可选）
            <textarea
              className="mt-2 min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={note}
              maxLength={200}
              placeholder="例如：8月1日上午女装选货"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button asChild variant="outline"><Link href="/">取消</Link></Button>
            <Button disabled={busy || !hasPermission("action.product.create")} onClick={() => void createBatch()}>
              <PlusIcon data-icon="inline-start" />{busy ? "创建中" : "创建并开始上传"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ProductBatchListPage({ completed = false }: { completed?: boolean }) {
  const ids = useOperationIds();
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    setBusy(true);
    setError("");
    try {
      const query = new URLSearchParams({ ...ids, status: completed ? "COMPLETED" : "OPEN" });
      setBatches(await request<ProductBatch[]>(`/operations/product-batches?${query.toString()}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取批次。 ");
    } finally {
      setBusy(false);
    }
  }, [completed, ids]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="商品工厂"
        title={completed ? "已完成" : "进行中批次"}
        description={completed ? "查询已完成的 10 件商品批次。" : "从批次进入当前合法步骤，不在列表页暴露跨阶段操作。"}
        action={completed ? undefined : <Button asChild><Link href="/product/new-batch"><PlusIcon data-icon="inline-start" />新建批次</Link></Button>}
      />
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      {busy && batches.length === 0 ? <StatusMessage tone="neutral">正在读取批次...</StatusMessage> : null}
      <div className="space-y-3">
        {batches.map((batch) => <BatchRow key={batch.id} batch={batch} />)}
        {!busy && batches.length === 0 ? <EmptyState title={completed ? "还没有已完成批次" : "没有进行中的批次"} description={completed ? "完整发布或归档的批次会显示在这里。" : "新建批次后会显示在这里。"} /> : null}
      </div>
    </div>
  );
}

export function ProductBatchDetailPage({ batchId }: { batchId: string }) {
  const ids = useOperationIds();
  const [batch, setBatch] = useState<ProductBatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!ids.adminUserId || !batchId) return;
    setBusy(true);
    setError("");
    try {
      const query = new URLSearchParams({ adminUserId: ids.adminUserId });
      setBatch(await request<ProductBatch>(`/operations/product-batches/${encodeURIComponent(batchId)}?${query.toString()}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取批次详情。 ");
    } finally {
      setBusy(false);
    }
  }, [batchId, ids.adminUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!batch) {
    return <div className="flex flex-col gap-4">{error ? <StatusMessage tone="danger">{error}</StatusMessage> : <StatusMessage tone="neutral">正在读取批次...</StatusMessage>}</div>;
  }

  const nextHref = batchNextActionHref(batch.id, batch.nextAction);
  const followingStageLabel = batchFollowingStageLabel(batch.stage);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="商品工厂 / 批次详情"
        title={batch.batchCode}
        description={`创建于 ${formatDateTime(batch.createdAt)} · 操作员工 ${batch.createdByEmployeeId || "未记录"}`}
        action={<Button variant="outline" size="icon" title="刷新" disabled={busy} onClick={() => void load()}><RefreshCwIcon /></Button>}
      />
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric title="批次商品" value={batch.targetCount} />
        <Metric title="当前步骤完成" value={batch.stageCompletedCount} suffix={`/ ${batch.targetCount}`} />
        <Metric title="已发布/归档" value={batch.completedCount} suffix={`/ ${batch.targetCount}`} />
        <Metric title="异常" value={batch.exceptionCount} tone={batch.exceptionCount ? "danger" : "default"} />
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>当前阶段：{batch.stageLabel}</CardTitle>
              <CardDescription className="mt-1 space-y-1">
                <span className="block">当前步骤：{batch.stageLabel}</span>
                <span className="block">完成后下一步：{followingStageLabel}</span>
              </CardDescription>
            </div>
            <Button asChild className="w-full sm:w-auto"><Link href={nextHref}>{batch.nextActionLabel}<ArrowRightIcon data-icon="inline-end" /></Link></Button>
          </div>
        </CardHeader>
        <CardContent>
          <BatchStageStepper batch={batch} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>10 件商品</CardTitle>
          <CardDescription>紧凑查看每件商品的编号、当前状态和缺失项。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {batch.products.map((product) => <BatchProductItem key={product.id} product={product} />)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>状态分布</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(batch.counts).map(([status, count]) => <Badge key={status} variant="secondary">{productStatusLabel(status)} {count}</Badge>)}
        </CardContent>
      </Card>
    </div>
  );
}

function BatchStageStepper({ batch }: { batch: ProductBatch }) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      {PRODUCT_FACTORY_STAGE_ORDER.map((stage, index) => {
        const complete = batch.stage === "COMPLETE" || index < batch.stageIndex;
        const current = stage === batch.stage;
        return (
          <li key={stage} className={cn("min-w-0 rounded-md border px-3 py-3", current && "border-primary bg-primary/5", complete && "bg-muted/50")}>
            <div className="flex items-center gap-2">
              {complete ? <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600" /> : current ? <CircleDotIcon className="size-4 shrink-0 text-primary" /> : <Clock3Icon className="size-4 shrink-0 text-muted-foreground" />}
              <span className="text-xs text-muted-foreground">{index + 1}</span>
            </div>
            <div className="mt-2 text-sm font-medium leading-snug">{PRODUCT_FACTORY_STAGE_LABELS[stage]}</div>
          </li>
        );
      })}
    </ol>
  );
}

function BatchProductItem({ product }: { product: ProductRecord }) {
  const missing: string[] = [];
  if (!product.images?.length) missing.push("缺正面图");
  if (["PHOTOGRAPHED", "AI_PROCESSING"].includes(product.status) && product.aiExtractions?.[0]?.status === "FAILED") missing.push("AI 失败");
  if (product.status === "REWORK_REQUIRED") missing.push("需返工");
  return (
    <div className="min-w-0 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums">第 {product.batchItemNumber ?? "-"} 件</span>
        <Badge variant="secondary" className="max-w-full truncate">{productStatusLabel(product.status)}</Badge>
      </div>
      <div className="mt-2 truncate text-xs text-muted-foreground">{product.productCode}</div>
      <div className="mt-3 min-h-5 text-xs">
        {missing.length ? <span className="text-destructive">{missing.join(" · ")}</span> : <span className="text-emerald-700">资料正常</span>}
      </div>
    </div>
  );
}

function BatchRow({ batch }: { batch: ProductBatch }) {
  return (
    <div className="grid gap-3 rounded-md border bg-background p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold">{batch.batchCode}</span>
          <StageBadge stage={batch.stage} label={batch.stageLabel} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>当前步骤 {batch.stageCompletedCount}/{batch.targetCount}</span>
          <span>更新于 {formatDateTime(batch.updatedAt)}</span>
          {batch.exceptionCount ? <span className="text-destructive">异常 {batch.exceptionCount}</span> : null}
        </div>
      </div>
      <Button asChild variant="outline" className="w-full sm:w-auto"><Link href={`/product/batches/${batch.id}`}>打开批次<ArrowRightIcon data-icon="inline-end" /></Link></Button>
    </div>
  );
}

function TaskRow({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="flex min-h-14 items-center justify-between rounded-md border px-3 py-2 transition-colors hover:bg-muted/50">
      <span className="flex min-w-0 items-center gap-2 text-sm font-medium"><ListChecksIcon className="size-4 shrink-0 text-muted-foreground" />{label}</span>
      <span className="tabular-nums text-lg font-semibold">{value}</span>
    </Link>
  );
}

function StageBadge({ stage, label }: { stage: string; label: string }) {
  return <Badge variant={stage === "EXCEPTION" ? "destructive" : stage === "COMPLETE" ? "default" : "secondary"}>{label}</Badge>;
}

function Metric({ title, value, suffix = "", tone = "default" }: { title: string; value: number; suffix?: string; tone?: "default" | "danger" }) {
  return (
    <div className={cn("rounded-md border bg-background p-4", tone === "danger" && "border-destructive/40")}>
      <div className="text-xs text-muted-foreground sm:text-sm">{title}</div>
      <div className={cn("mt-2 text-2xl font-semibold tabular-nums", tone === "danger" && "text-destructive")}>{value}<span className="ml-1 text-sm font-normal text-muted-foreground">{suffix}</span></div>
    </div>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const percentage = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${percentage}%` }} /></div>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground">{eyebrow}</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-normal">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

function StatusMessage({ tone, children }: { tone: "danger" | "neutral"; children: ReactNode }) {
  return <div className={cn("rounded-md border px-4 py-3 text-sm", tone === "danger" ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted/40 text-muted-foreground")}>{children}</div>;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-md border border-dashed p-5 text-center">
      <PackageCheckIcon className="size-5 text-muted-foreground" />
      <div className="font-medium">{title}</div>
      <p className="text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Africa/Nairobi",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}
