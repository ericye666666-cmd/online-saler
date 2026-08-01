"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AI_AUDIENCES,
  AI_COLORS,
  AI_KIDS_AGE_RANGES,
  AI_PATTERNS,
  AI_SLEEVE_TYPES,
  PRODUCT_AI_PROMPT_VERSION,
  PRODUCT_CATEGORY_OPTIONS,
  PRODUCT_SUBCATEGORIES_BY_CATEGORY,
  type BackgroundRemovalMode,
  type ImageProcessingOperation,
  type ImageProcessingJobRecord,
  type ProductImageComparisonResponse,
  type ProductImageVariantRecord
} from "@online-saler/shared-types";
import {
  CheckCircle2Icon,
  CircleDollarSignIcon,
  DownloadIcon,
  ImageIcon,
  PackageCheckIcon,
  PlayIcon,
  PlusIcon,
  PrinterIcon,
  RefreshCwIcon,
  SaveIcon,
  ScanBarcodeIcon,
  UploadIcon,
  WandSparklesIcon,
  XCircleIcon
} from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  buildCalibrationBody,
  calibrationValidationReasons,
  formFromProductAndAi,
  normalizedAiOutput,
  stringValue,
  type JsonRecord,
  type WorkspaceForm
} from "../operations-workspace-flow";
import {
  DEFAULT_LABEL_SIZE,
  DEFAULT_PRINT_AGENT_URL,
  DEFAULT_PRINTER_NAME,
  buildLabelPrintPayload,
  printerList,
  selectDeliPrinter
} from "../local-label-print";
import {
  canAssignProductLocation,
  canPublishProduct,
  canUnpublishProduct
} from "../product-control-flow";
import { imageIssueLabel, productStatusLabel } from "./product-factory-display";

const API_PROXY_URL = "/api-proxy";
const BATCH_SIZE = 10;
const PRODUCT_STATUS_OPTIONS = [
  "DRAFT",
  "PHOTOGRAPHED",
  "AI_PROCESSING",
  "AI_PROCESSED",
  "CALIBRATION_PENDING",
  "CALIBRATED",
  "BARCODE_ASSIGNED",
  "REVIEW_PENDING",
  "REWORK_REQUIRED",
  "APPROVED",
  "READY_FOR_STORAGE",
  "PUBLISHED",
  "UNPUBLISHED",
  "ARCHIVED"
] as const;

type QueueKey = "all" | "exceptions" | "waiting-upload" | "waiting-ai" | "calibration" | "review" | "published" | "rejected" | "barcode";

type QueueConfig = {
  queue: QueueKey;
  title: string;
  description: string;
};

type ProductSummary = {
  employeeId: string;
  activeBatches: ProductBatch[];
  queues: Record<string, number>;
};

type ProductBatch = {
  id: string;
  batchCode: string;
  status: string;
  targetCount: number;
  completedCount: number;
  counts: Record<string, number>;
  products: JsonRecord[];
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
    const message = body && typeof body === "object" && "message" in body ? String((body as { message?: unknown }).message) : `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

async function uploadProductImage(productId: string, employeeId: string, adminUserId: string, file: File): Promise<JsonRecord> {
  const response = await fetch(`${API_PROXY_URL}/products/${productId}/images/upload`, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-Image-Type": "FRONT",
      "X-Employee-Id": employeeId,
      "X-Admin-User-Id": adminUserId
    },
    body: file
  });
  const text = await response.text();
  let body: JsonRecord = {};
  try {
    body = text ? (JSON.parse(text) as JsonRecord) : {};
  } catch {
    body = { message: text || `Upload failed: ${response.status}` };
  }
  if (!response.ok) throw new Error(String(body.message ?? `Upload failed: ${response.status}`));
  const imageId = stringValue(body.id);
  if (imageId) {
    const cutout = await runImageOperation(productId, imageId, "REMOVE_BACKGROUND", adminUserId, "auto");
    const white = await runImageOperation(productId, cutout.outputImageId!, "COMPOSE_WHITE_BACKGROUND", adminUserId);
    await runImageOperation(productId, white.outputImageId!, "OPTIMIZE_MAIN_IMAGE", adminUserId);
    const balanced = await runImageOperation(productId, cutout.outputImageId!, "OPTIMIZE_BALANCED_MAIN_IMAGE", adminUserId);
    await selectProductMainImage(productId, balanced.outputImageId!, adminUserId);
  }
  return body;
}

async function runImageOperation(
  productId: string,
  sourceImageId: string,
  operation: ImageProcessingOperation,
  adminUserId: string,
  backgroundRemovalMode?: BackgroundRemovalMode
): Promise<ImageProcessingJobRecord> {
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
    throw new Error(completed.errorMessage || `${operation} failed`);
  }
  return completed;
}

async function selectProductMainImage(
  productId: string,
  imageId: string,
  adminUserId: string
): Promise<ProductImageComparisonResponse> {
  return request<ProductImageComparisonResponse>(`/products/${productId}/main-image`, {
    method: "POST",
    headers: { "X-Admin-User-Id": adminUserId },
    body: JSON.stringify({ imageId })
  });
}

export function ProductWorkbenchPage() {
  const { session, hasPermission } = useOperationsSession();
  const ids = useOperationIds();
  const canCreate = hasPermission("action.product.create");
  const canEdit = hasPermission("action.product.edit");
  const [summary, setSummary] = useState<ProductSummary | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    setBusy("load");
    setError("");
    try {
      setSummary(await loadSummary(ids));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取商品工作台。");
    } finally {
      setBusy("");
    }
  }, [ids]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createBatch() {
    setBusy("create");
    setError("");
    try {
      await createProductBatch(ids);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法创建批次。");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="商品中心"
        title="商品工作台"
        description="按 10 件一批连续处理：拍照、上传、AI 识别、人工校准、Barcode、打印、入库。"
        action={
          <Button disabled={Boolean(busy) || !canCreate} onClick={() => void createBatch()}>
            <PlusIcon data-icon="inline-start" />
            新建 10 件批次
          </Button>
        }
      />
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      <section className="grid gap-4 md:grid-cols-4">
        <Metric title="待上传" value={summary?.queues.waitingUpload ?? 0} />
        <Metric title="待 AI 识别" value={summary?.queues.waitingAi ?? 0} />
        <Metric title="待人工校准" value={summary?.queues.waitingCalibration ?? 0} />
        <Metric title="待审核" value={summary?.queues.waitingReview ?? 0} />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>当前批次</CardTitle>
          <CardDescription>每个批次固定 10 件。员工按批次完成照片、AI、校准、贴码和入库。</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <BatchTable batches={summary?.activeBatches ?? []} ids={ids} canEdit={canEdit} onChanged={load} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>员工操作顺序</CardTitle>
          <CardDescription>这条顺序不能改变，正式 Barcode 只能在人工校准后生成。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {["先拍照并上传", "批量 AI 识别", "逐件人工校准", "生成 Barcode 并贴码", "审核通过", "分配库位并入库"].map((step) => (
            <div key={step} className="rounded-lg border p-3 text-sm">{step}</div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function NewBatchPage() {
  const ids = useOperationIds();
  const { hasPermission } = useOperationsSession();
  const canCreate = hasPermission("action.product.create");
  const [summary, setSummary] = useState<ProductSummary | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    setBusy("load");
    setError("");
    try {
      setSummary(await loadSummary(ids));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取批次。");
    } finally {
      setBusy("");
    }
  }, [ids]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createBatch() {
    setBusy("create");
    setError("");
    try {
      await createProductBatch(ids);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法创建批次。");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="商品中心"
        title="新建批次"
        description="一次创建 10 件商品壳，用于员工连续拍照和上传。"
        action={
          <Button disabled={Boolean(busy) || !canCreate} onClick={() => void createBatch()}>
            <PlusIcon data-icon="inline-start" />
            创建 10 件商品
          </Button>
        }
      />
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      <Card>
        <CardHeader>
          <CardTitle>开放批次</CardTitle>
          <CardDescription>批量上传照片、批量 AI、批量 Barcode 和批量入库都从这里执行。</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <BatchTable batches={summary?.activeBatches ?? []} ids={ids} canEdit onChanged={load} />
        </CardContent>
      </Card>
    </div>
  );
}

export function ProductQueuePage({ queue, title, description }: QueueConfig) {
  const ids = useOperationIds();
  const { hasPermission } = useOperationsSession();
  const canEdit = hasPermission("action.product.edit");
  const canApprove = hasPermission("action.product.approve");
  const canPublish = hasPermission("action.product.publish");
  const [products, setProducts] = useState<JsonRecord[]>([]);
  const [search, setSearch] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [includeTestData, setIncludeTestData] = useState(false);
  const [editingProduct, setEditingProduct] = useState<JsonRecord | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const batchId = new URLSearchParams(window.location.search).get("batchId");
    if (batchId) setBatchFilter(batchId);
  }, []);

  const load = useCallback(async () => {
    if (!ids.adminUserId) return;
    setBusy("load");
    setError("");
    try {
      const query = new URLSearchParams({ adminUserId: ids.adminUserId, employeeId: ids.employeeId, queue });
      if (search.trim()) query.set("search", search.trim());
      if (batchFilter.trim()) query.set("batchId", batchFilter.trim());
      if (statusFilter.trim()) query.set("status", statusFilter.trim());
      if (categoryFilter.trim()) query.set("category", categoryFilter.trim());
      if (employeeFilter.trim()) query.set("employeeId", employeeFilter.trim());
      if (dateFrom) query.set("dateFrom", dateFrom);
      if (dateTo) query.set("dateTo", dateTo);
      if (includeTestData) query.set("includeTestData", "true");
      setProducts(await request<JsonRecord[]>(`/operations/product-batches/products?${query.toString()}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取商品列表。");
    } finally {
      setBusy("");
    }
  }, [batchFilter, categoryFilter, dateFrom, dateTo, employeeFilter, ids.adminUserId, ids.employeeId, includeTestData, queue, search, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await action();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败。");
    } finally {
      setBusy("");
    }
  }

  function exportCsv() {
    const lines = [
      ["productCode", "batch", "status", "title", "category", "barcode", "createdAt"].join(","),
      ...products.map((product) => [
        csv(stringValue(product.productCode)),
        csv(stringValue(objectRecord(product.batch)?.batchCode)),
        csv(stringValue(product.status)),
        csv(stringValue(product.title)),
        csv(stringValue(product.category)),
        csv(stringValue(product.barcode)),
        csv(stringValue(product.createdAt))
      ].join(","))
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `products-${queue}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="商品中心"
        title={title}
        description={description}
        action={
          <Button variant="outline" onClick={exportCsv}>
            <DownloadIcon data-icon="inline-start" />
            导出
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>筛选</CardTitle>
          <CardDescription>支持搜索、批次、状态、分类、员工和日期筛选。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Input placeholder="搜索商品/Barcode/标题" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Input placeholder="批次 ID" value={batchFilter} onChange={(event) => setBatchFilter(event.target.value)} />
          <NativeSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <NativeSelectOption value="">全部状态</NativeSelectOption>
            {PRODUCT_STATUS_OPTIONS.map((status) => <NativeSelectOption key={status} value={status}>{productStatusLabel(status)}</NativeSelectOption>)}
          </NativeSelect>
          <NativeSelect value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <NativeSelectOption value="">全部分类</NativeSelectOption>
            {PRODUCT_CATEGORY_OPTIONS.map((category) => <NativeSelectOption key={category} value={category}>{optionLabel(category)}</NativeSelectOption>)}
          </NativeSelect>
          <Input placeholder="员工 ID" value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)} />
          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          <label className="flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm">
            <Checkbox checked={includeTestData} onCheckedChange={(checked) => setIncludeTestData(checked === true)} />
            显示部署与 E2E 测试数据
          </label>
        </CardContent>
      </Card>
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      <Card>
        <CardHeader>
          <CardTitle>商品列表</CardTitle>
          <CardDescription>{products.length} 件商品</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>商品</TableHead>
                <TableHead>批次</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>分类</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={stringValue(product.id)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Thumb product={product} />
                      <div>
                        <div className="font-medium">{stringValue(product.title) || stringValue(product.productCode)}</div>
                        <div className="text-muted-foreground text-xs">{stringValue(product.productCode)}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{stringValue(objectRecord(product.batch)?.batchCode) || "-"}</TableCell>
                  <TableCell><StatusBadge status={stringValue(product.status)} /></TableCell>
                  <TableCell>{stringValue(product.category) || "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{stringValue(product.barcode) || "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {queue === "waiting-upload" ? <UploadButton product={product} ids={ids} disabled={!canEdit || Boolean(busy)} onDone={load} /> : null}
                      {queue === "waiting-ai" ? (
                        <Button size="sm" variant="outline" disabled={!canEdit || Boolean(busy) || !latestImage(product)} onClick={() => run(`ai-${product.id}`, () => runSingleAi(product, ids))}>
                          <PlayIcon data-icon="inline-start" />
                          AI
                        </Button>
                      ) : null}
                      {queue === "calibration" ? (
                        <Button size="sm" variant="outline" disabled={!canEdit || Boolean(busy)} onClick={() => setEditingProduct(product)}>
                          校准
                        </Button>
                      ) : null}
                      {queue === "review" ? <ReviewButtons product={product} ids={ids} canApprove={canApprove} busy={busy} run={run} /> : null}
                      {queue === "barcode" ? (
                        <Button size="sm" variant="outline" disabled={!canEdit || Boolean(busy) || stringValue(product.status) !== "CALIBRATED"} onClick={() => run(`barcode-${product.id}`, () => generateBarcode(product, ids))}>
                          <ScanBarcodeIcon data-icon="inline-start" />
                          生成
                        </Button>
                      ) : null}
                      {["review", "barcode", "published"].includes(queue) ? (
                        <ProductControlActions
                          product={product}
                          ids={ids}
                          canEdit={canEdit}
                          canApprove={canApprove}
                          canPublish={canPublish}
                          busy={busy}
                          run={run}
                        />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <CalibrationDialog product={editingProduct} ids={ids} open={Boolean(editingProduct)} onOpenChange={(open) => !open && setEditingProduct(null)} onSaved={() => { setEditingProduct(null); void load(); }} />
    </div>
  );
}

export function TaxonomyPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="商品中心" title="分类与属性" description="当前商品属性来自共享类型，供 AI 和人工校准共同使用。" />
      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">分类</TabsTrigger>
          <TabsTrigger value="attributes">属性</TabsTrigger>
        </TabsList>
        <TabsContent value="categories" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>分类</CardTitle>
              <CardDescription>后续如需调整分类，必须同步 AI、Storefront 筛选和商品发布校验。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {PRODUCT_CATEGORY_OPTIONS.map((category) => (
                <div key={category} className="rounded-lg border p-3">
                  <div className="font-medium">{optionLabel(category)}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {subcategoriesFor(category).map((subcategory) => <Badge key={subcategory} variant="secondary">{optionLabel(subcategory)}</Badge>)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="attributes" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>属性</CardTitle>
              <CardDescription>AI 可建议这些字段，但价格、Barcode、发布必须由人工或审核流程决定。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <AttributeGroup title="颜色" values={AI_COLORS} />
              <AttributeGroup title="图案" values={AI_PATTERNS} />
              <AttributeGroup title="袖型" values={AI_SLEEVE_TYPES} />
              <AttributeGroup title="人群" values={AI_AUDIENCES} />
              <AttributeGroup title="儿童年龄" values={AI_KIDS_AGE_RANGES} />
              <AttributeGroup title="成色" values={["LIKE_NEW", "EXCELLENT", "GOOD", "FAIR"]} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BatchTable(props: { batches: ProductBatch[]; ids: ReturnType<typeof useOperationIds>; canEdit: boolean; onChanged: () => void }) {
  const { batches, ids, canEdit, onChanged } = props;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await action();
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "批次操作失败。");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>批次</TableHead>
            <TableHead>进度</TableHead>
            <TableHead>状态分布</TableHead>
            <TableHead className="text-right">批量操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.map((batch) => (
            <TableRow key={batch.id}>
              <TableCell className="font-medium">{batch.batchCode}</TableCell>
              <TableCell>{batch.completedCount}/{batch.targetCount}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(batch.counts).map(([status, count]) => <Badge key={status} variant="secondary">{productStatusLabel(status)}: {count}</Badge>)}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex flex-wrap justify-end gap-2">
                  <BulkUploadButton batch={batch} ids={ids} disabled={!canEdit || Boolean(busy)} onDone={onChanged} />
                  <Button size="sm" variant="outline" disabled={!canEdit || Boolean(busy)} onClick={() => run(`ai-${batch.id}`, async () => { await batchAction(batch.id, "run-ai", ids); })}>
                    <PlayIcon data-icon="inline-start" />
                    批量 AI
                  </Button>
                  <Button size="sm" variant="outline" disabled={!canEdit || Boolean(busy)} onClick={() => run(`barcode-${batch.id}`, async () => { await batchAction(batch.id, "generate-barcodes", ids); })}>
                    <ScanBarcodeIcon data-icon="inline-start" />
                    批量 Barcode
                  </Button>
                  <Button size="sm" variant="outline" disabled={!canEdit || Boolean(busy)} onClick={() => run(`printed-${batch.id}`, async () => { await printBatchLabels(batch, ids); })}>
                    <PrinterIcon data-icon="inline-start" />
                    批量打印
                  </Button>
                  <Button size="sm" variant="outline" disabled={!canEdit || Boolean(busy)} onClick={() => run(`stock-${batch.id}`, async () => { await batchAction(batch.id, "stock-in", ids); })}>
                    <PackageCheckIcon data-icon="inline-start" />
                    批量入库
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BulkUploadButton(props: { batch: ProductBatch; ids: ReturnType<typeof useOperationIds>; disabled?: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const waiting = props.batch.products.filter((product) => stringValue(product.status) === "DRAFT");
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      const targets = waiting.slice(0, files.length);
      for (let index = 0; index < targets.length; index += 1) {
        await uploadProductImage(stringValue(targets[index].id), props.ids.employeeId, props.ids.adminUserId, files[index]);
      }
      props.onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "图片处理失败，原图已保留。请进入校准页重试。");
      props.onDone();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button asChild size="sm" variant="outline" disabled={props.disabled || busy || waiting.length === 0}>
        <label className="cursor-pointer">
          <UploadIcon data-icon="inline-start" />
          批量上传
          <Input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={props.disabled || busy || waiting.length === 0} onChange={(event) => void upload(event.target.files)} />
        </label>
      </Button>
      {error ? <span className="max-w-64 text-right text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

function UploadButton(props: { product: JsonRecord; ids: ReturnType<typeof useOperationIds>; disabled?: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await uploadProductImage(stringValue(props.product.id), props.ids.employeeId, props.ids.adminUserId, file);
      props.onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "图片处理失败，原图已保留。请进入校准页重试。");
      props.onDone();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button asChild size="sm" variant="outline" disabled={props.disabled || busy}>
        <label className="cursor-pointer">
          <UploadIcon data-icon="inline-start" />
          上传
          <Input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={props.disabled || busy} onChange={(event) => void upload(event.target.files?.[0] ?? null)} />
        </label>
      </Button>
      {error ? <span className="max-w-64 text-right text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

function CalibrationDialog(props: { product: JsonRecord | null; ids: ReturnType<typeof useOperationIds>; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [form, setForm] = useState<WorkspaceForm>(() => formFromProductAndAi(null, null));
  const [comparison, setComparison] = useState<ProductImageComparisonResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState("");
  const [error, setError] = useState("");
  const productId = stringValue(props.product?.id);
  const latestExtraction = objectRecord((props.product?.aiExtractions as unknown[])?.[0]);
  const latestImage = latestImageRecord(props.product);
  const reasons = calibrationValidationReasons(form, { hasPhoto: Boolean(latestImage), hasAi: Boolean(latestExtraction) });
  const draftKey = productId ? `operations.product.calibration.draft.${productId}` : "";

  const loadComparison = useCallback(async () => {
    if (!productId || !props.ids.adminUserId) return;
    setComparison(await request<ProductImageComparisonResponse>(`/products/${productId}/image-comparison`, {
      headers: { "X-Admin-User-Id": props.ids.adminUserId }
    }));
  }, [productId, props.ids.adminUserId]);

  useEffect(() => {
    if (!props.open) return;
    void loadComparison().catch((caught) => setError(caught instanceof Error ? caught.message : "无法读取图片版本。"));
  }, [loadComparison, props.open]);

  useEffect(() => {
    if (!props.product) return;
    const saved = draftKey ? localStorage.getItem(draftKey) : null;
    if (saved) {
      try {
        setForm({ ...formFromProductAndAi(props.product, latestExtraction), ...(JSON.parse(saved) as Partial<WorkspaceForm>) });
        return;
      } catch {
        localStorage.removeItem(draftKey);
      }
    }
    setForm(formFromProductAndAi(props.product, latestExtraction));
  }, [draftKey, latestExtraction, props.product]);

  useEffect(() => {
    if (!draftKey || !props.open) return;
    const id = window.setTimeout(() => localStorage.setItem(draftKey, JSON.stringify(form)), 350);
    return () => window.clearTimeout(id);
  }, [draftKey, form, props.open]);

  useEffect(() => {
    if (!props.open) return;
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "enter") {
        event.preventDefault();
        void save();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function updateForm(key: keyof WorkspaceForm, value: string) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "category") {
        const options = subcategoriesFor(value);
        next.subcategory = options.includes(next.subcategory) ? next.subcategory : options[0] ?? "OTHER";
      }
      if (key === "audience" && value !== "KIDS") next.kidsAgeRange = "NOT_APPLICABLE";
      return next;
    });
  }

  async function processImages(mode: BackgroundRemovalMode) {
    const sourceId = comparison?.original?.imageId ?? stringValue(latestImage?.id);
    if (!sourceId) {
      setError("请先上传正面原图。");
      return;
    }
    setImageBusy(mode);
    setError("");
    try {
      const cutout = await runImageOperation(productId, sourceId, "REMOVE_BACKGROUND", props.ids.adminUserId, mode);
      const white = await runImageOperation(productId, cutout.outputImageId!, "COMPOSE_WHITE_BACKGROUND", props.ids.adminUserId);
      await runImageOperation(productId, white.outputImageId!, "OPTIMIZE_MAIN_IMAGE", props.ids.adminUserId);
      const balanced = await runImageOperation(productId, cutout.outputImageId!, "OPTIMIZE_BALANCED_MAIN_IMAGE", props.ids.adminUserId);
      setComparison(await selectProductMainImage(productId, balanced.outputImageId!, props.ids.adminUserId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "图片处理失败。");
    } finally {
      setImageBusy("");
    }
  }

  async function selectMain(imageId: string) {
    setImageBusy(`select-${imageId}`);
    setError("");
    try {
      setComparison(await selectProductMainImage(productId, imageId, props.ids.adminUserId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法选择商城主图。");
    } finally {
      setImageBusy("");
    }
  }

  async function save() {
    if (!props.product) return;
    if (reasons.length > 0) {
      setError(reasons.join(" "));
      return;
    }
    if (!comparison?.selectedMainImageId) {
      setError("请选择白底图、优化主图或原图作为商城主图。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const extraction = stringValue(latestExtraction?.extractionId) || stringValue(latestExtraction?.id);
      await request(`/products/${productId}/calibrate`, {
        method: "POST",
        body: JSON.stringify({
          ...buildCalibrationBody({ employeeId: props.ids.employeeId, extractionId: extraction, form }),
          adminUserId: props.ids.adminUserId
        })
      });
      if (draftKey) localStorage.removeItem(draftKey);
      props.onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法保存校准。");
    } finally {
      setBusy(false);
    }
  }

  const latestRemovalJob = comparison?.jobs.find((job) => job.operation === "REMOVE_BACKGROUND");

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[96vh] overflow-y-auto sm:max-w-[min(96vw,1400px)]">
        <DialogHeader>
          <DialogTitle>图片与商品信息校准 {productId ? batchProgressLabel(props.product) : ""}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,.95fr)]">
          <section className="flex min-w-0 flex-col gap-3" aria-label="商品图片处理">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-medium">图片版本</h3>
                <p className="text-xs text-muted-foreground">原图永久保留；抠图和主图只生成新版本。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={Boolean(imageBusy)} onClick={() => void processImages("lightweight")}>
                  <RefreshCwIcon data-icon="inline-start" />
                  {imageBusy === "lightweight" ? "处理中" : "重跑 lightweight"}
                </Button>
                <Button size="sm" variant="outline" disabled={Boolean(imageBusy)} onClick={() => void processImages("rembg_birefnet")}>
                  <WandSparklesIcon data-icon="inline-start" />
                  {imageBusy === "rembg_birefnet" ? "处理中" : "强制 BiRefNet"}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ImageVariantTile label="原图" asset={comparison?.original ?? null} selectable onSelect={selectMain} busy={Boolean(imageBusy)} />
              <ImageVariantTile label="透明抠图" asset={comparison?.cutoutTransparent ?? null} transparent busy={Boolean(imageBusy)} />
              <ImageVariantTile label="白底图" asset={comparison?.cutoutWhite ?? null} selectable onSelect={selectMain} busy={Boolean(imageBusy)} />
              <ImageVariantTile label="优化主图" asset={comparison?.optimizedMain ?? null} selectable onSelect={selectMain} busy={Boolean(imageBusy)} />
              <ImageVariantTile label="优化主图 2（均整版）" asset={comparison?.optimizedBalancedMain ?? null} selectable onSelect={selectMain} busy={Boolean(imageBusy)} />
            </div>
            {latestRemovalJob ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border bg-muted/30 p-3 text-xs">
                <span>处理引擎：<strong>{latestRemovalJob.provider ?? "-"}</strong></span>
                <span>质量分：<strong>{latestRemovalJob.qualityScore?.toFixed(3) ?? "-"}</strong></span>
                {latestRemovalJob.fallbackFrom ? <span>回退来源：<strong>{latestRemovalJob.fallbackFrom}</strong></span> : null}
                {latestRemovalJob.qualityIssues.map((issue) => <Badge key={issue} variant="secondary">{imageIssueLabel(issue)}</Badge>)}
              </div>
            ) : null}
            {latestExtraction ? <AiPreview job={latestExtraction} /> : <StatusMessage tone="neutral">等待 AI 识别。</StatusMessage>}
          </section>

          <FieldGroup>
            <RequiredInput label="标题" value={form.title} invalid={!form.title.trim()} onChange={(value) => updateForm("title", value)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <RequiredSelect label="分类" value={form.category} invalid={!form.category.trim()} values={PRODUCT_CATEGORY_OPTIONS} onChange={(value) => updateForm("category", value)} />
              <RequiredSelect label="子分类" value={form.subcategory} invalid={!form.subcategory.trim()} values={subcategoriesFor(form.category, form.subcategory)} onChange={(value) => updateForm("subcategory", value)} />
              <RequiredSelect label="适用人群" value={form.audience} invalid={!form.audience.trim()} values={AI_AUDIENCES} onChange={(value) => updateForm("audience", value)} />
              <RequiredSelect label="儿童年龄段" value={form.kidsAgeRange} invalid={form.audience === "KIDS" && form.kidsAgeRange === "NOT_APPLICABLE"} values={AI_KIDS_AGE_RANGES} disabled={form.audience !== "KIDS"} onChange={(value) => updateForm("kidsAgeRange", value)} />
              <RequiredSelect label="颜色" value={form.color} invalid={!form.color.trim()} values={AI_COLORS} onChange={(value) => updateForm("color", value)} />
              <FormField label="品牌"><Input value={form.brand} onChange={(event) => updateForm("brand", event.target.value)} /></FormField>
              <RequiredInput label="尺码" value={form.sizeLabel} invalid={!form.sizeLabel.trim()} onChange={(value) => updateForm("sizeLabel", value)} />
              <RequiredSelect label="图案" value={form.pattern} invalid={!form.pattern.trim()} values={AI_PATTERNS} onChange={(value) => updateForm("pattern", value)} />
              <RequiredSelect label="袖型" value={form.sleeveType} invalid={!form.sleeveType.trim()} values={AI_SLEEVE_TYPES} onChange={(value) => updateForm("sleeveType", value)} />
              <RequiredSelect label="成色" value={form.conditionGrade} invalid={!form.conditionGrade.trim()} values={["LIKE_NEW", "EXCELLENT", "GOOD", "FAIR"]} onChange={(value) => updateForm("conditionGrade", value)} />
              <RequiredInput label="价格 KSh" value={form.priceKsh} invalid={!positiveInteger(form.priceKsh)} onChange={(value) => updateForm("priceKsh", value)} />
            </div>
            <Separator />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <RequiredInput label="衣长 cm" value={form.lengthCm} invalid={!positiveNumber(form.lengthCm)} onChange={(value) => updateForm("lengthCm", value)} />
              <RequiredInput label="胸宽 cm" value={form.chestWidthCm} invalid={!positiveNumber(form.chestWidthCm)} onChange={(value) => updateForm("chestWidthCm", value)} />
              <FormField label="肩宽 cm"><Input inputMode="decimal" value={form.shoulderWidthCm} onChange={(event) => updateForm("shoulderWidthCm", event.target.value)} /></FormField>
              <FormField label="腰围 cm"><Input inputMode="decimal" value={form.waistCm} onChange={(event) => updateForm("waistCm", event.target.value)} /></FormField>
              <FormField label="臀围 cm"><Input inputMode="decimal" value={form.hipCm} onChange={(event) => updateForm("hipCm", event.target.value)} /></FormField>
            </div>
            <Field data-invalid={!form.defects.trim()}>
              <FieldLabel>瑕疵确认 *</FieldLabel>
              <Textarea aria-invalid={!form.defects.trim()} rows={3} value={form.defects} onChange={(event) => updateForm("defects", event.target.value)} />
              <FieldDescription>没有瑕疵请填写 None。这里必须由人工确认。</FieldDescription>
            </Field>
            {error || reasons.length ? <StatusMessage tone="danger">{error || reasons.join(" ")}</StatusMessage> : <StatusMessage tone="neutral">快捷键：Ctrl + Enter 保存。</StatusMessage>}
          </FieldGroup>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>取消</Button>
          <Button disabled={busy || Boolean(imageBusy) || reasons.length > 0 || !comparison?.selectedMainImageId} onClick={() => void save()}>
            <SaveIcon data-icon="inline-start" />
            保存并下一件
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImageVariantTile(props: {
  label: string;
  asset: ProductImageVariantRecord | null;
  selectable?: boolean;
  transparent?: boolean;
  busy: boolean;
  onSelect?: (imageId: string) => Promise<void>;
}) {
  const url = props.asset?.publicUrl ? `${API_PROXY_URL}${props.asset.publicUrl}` : "";
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="flex h-9 items-center justify-between border-b px-3 text-xs font-medium">
        <span>{props.label}</span>
        {props.asset?.selectedAsMain ? <Badge>商城主图</Badge> : null}
      </div>
      <div className={`flex aspect-square items-center justify-center overflow-hidden ${props.transparent ? "bg-muted" : "bg-white"}`}>
        <SafeProductImage src={url} alt={props.label} className="size-full object-contain" />
      </div>
      {props.selectable && props.asset ? (
        <div className="border-t p-2">
          <Button className="w-full" size="sm" variant={props.asset.selectedAsMain ? "secondary" : "outline"} disabled={props.busy || props.asset.selectedAsMain} onClick={() => void props.onSelect?.(props.asset!.imageId)}>
            {props.asset.selectedAsMain ? "已选择" : "设为商城主图"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ReviewButtons(props: { product: JsonRecord; ids: ReturnType<typeof useOperationIds>; canApprove: boolean; busy: string; run: (label: string, action: () => Promise<void>) => Promise<void> }) {
  const id = stringValue(props.product.id);
  async function review(result: "APPROVED" | "REWORK_REQUIRED" | "REJECTED") {
    const reason = result === "APPROVED" ? "" : window.prompt("填写审核意见") ?? "";
    await request(`/operations/product-batches/products/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ adminUserId: props.ids.adminUserId, employeeId: props.ids.employeeId, result, reason })
    });
  }
  return (
    <>
      <Button size="sm" variant="outline" disabled={!props.canApprove || Boolean(props.busy)} onClick={() => props.run(`approve-${id}`, () => review("APPROVED"))}>
        <CheckCircle2Icon data-icon="inline-start" />
        通过
      </Button>
      <Button size="sm" variant="outline" disabled={!props.canApprove || Boolean(props.busy)} onClick={() => props.run(`rework-${id}`, () => review("REWORK_REQUIRED"))}>
        退回
      </Button>
      <Button size="sm" variant="outline" disabled={!props.canApprove || Boolean(props.busy)} onClick={() => props.run(`reject-${id}`, () => review("REJECTED"))}>
        <XCircleIcon data-icon="inline-start" />
        拒绝
      </Button>
    </>
  );
}

function ProductControlActions(props: {
  product: JsonRecord;
  ids: ReturnType<typeof useOperationIds>;
  canEdit: boolean;
  canApprove: boolean;
  canPublish: boolean;
  busy: string;
  run: (label: string, action: () => Promise<void>) => Promise<void>;
}) {
  const id = stringValue(props.product.id);
  const status = stringValue(props.product.status);
  const price = typeof props.product.priceKsh === "number" ? props.product.priceKsh : 0;
  const batchId = stringValue(objectRecord(props.product.batch)?.id);
  const canPrepareStorage = status === "APPROVED";

  if (batchId) {
    return <Button size="sm" variant="outline" asChild><Link href={`/product/review?batchId=${encodeURIComponent(batchId)}`}>打开批次流程</Link></Button>;
  }

  return (
    <>
      <Button size="sm" variant="outline" disabled={!props.canEdit || Boolean(props.busy) || status === "PUBLISHED"} onClick={() => props.run(`price-${id}`, () => setProductPrice(props.product, props.ids))}>
        <CircleDollarSignIcon data-icon="inline-start" />
        {price > 0 ? `${price} KSh` : "定价"}
      </Button>
      <Button size="sm" variant="outline" disabled={!props.canApprove || Boolean(props.busy) || !canPrepareStorage || price <= 0} onClick={() => props.run(`storage-${id}`, () => prepareProductStorage(props.product, props.ids))}>
        <PackageCheckIcon data-icon="inline-start" />
        入库准备
      </Button>
      <Button size="sm" variant="outline" disabled={!props.canEdit || Boolean(props.busy) || !canAssignProductLocation(props.product)} onClick={() => props.run(`placed-${id}`, () => confirmProductPlaced(props.product, props.ids))}>
        入库
      </Button>
      <Button size="sm" disabled={!props.canPublish || Boolean(props.busy) || !canPublishProduct(props.product)} onClick={() => props.run(`publish-${id}`, () => publishProduct(props.product, props.ids))}>
        <CheckCircle2Icon data-icon="inline-start" />
        发布
      </Button>
      <Button size="sm" variant="outline" disabled={!props.canPublish || Boolean(props.busy) || !canUnpublishProduct(props.product)} onClick={() => props.run(`unpublish-${id}`, () => unpublishProduct(props.product, props.ids))}>
        下架
      </Button>
    </>
  );
}

function useOperationIds() {
  const { session } = useOperationsSession();
  return useMemo(() => ({
    adminUserId: stringValue(session?.adminUser?.id),
    employeeId: stringValue(session?.adminUser?.linkedEmployeeId)
  }), [session]);
}

async function loadSummary(ids: ReturnType<typeof useOperationIds>): Promise<ProductSummary> {
  const query = new URLSearchParams({ adminUserId: ids.adminUserId, employeeId: ids.employeeId });
  return request<ProductSummary>(`/operations/product-batches/summary?${query.toString()}`);
}

async function createProductBatch(ids: ReturnType<typeof useOperationIds>) {
  return request("/operations/product-batches", {
    method: "POST",
    body: JSON.stringify({ adminUserId: ids.adminUserId, employeeId: ids.employeeId, targetCount: BATCH_SIZE })
  });
}

async function batchAction(batchId: string, action: string, ids: ReturnType<typeof useOperationIds>) {
  return request(`/operations/product-batches/${batchId}/${action}`, {
    method: "POST",
    body: JSON.stringify({ adminUserId: ids.adminUserId, employeeId: ids.employeeId })
  });
}

async function printBatchLabels(batch: ProductBatch, ids: ReturnType<typeof useOperationIds>) {
  const products = batch.products.filter((product) => stringValue(product.barcode));
  if (products.length === 0) throw new Error("先生成 Barcode，再批量打印。");

  let healthResponse: Response;
  try {
    healthResponse = await fetch(`${DEFAULT_PRINT_AGENT_URL}/health`, { method: "GET" });
  } catch {
    throw new Error("请先启动本机打印代理，再批量打印。");
  }
  if (!healthResponse.ok) throw new Error("本机打印代理未就绪。");

  const printersResponse = await fetch(`${DEFAULT_PRINT_AGENT_URL}/printers`, { method: "GET" });
  const printersBody = (await printersResponse.json()) as JsonRecord;
  const printerName = selectDeliPrinter(printerList(printersBody.printers), DEFAULT_PRINTER_NAME);

  for (const product of products) {
    const payload = buildLabelPrintPayload({ product, labelSize: DEFAULT_LABEL_SIZE, printerName });
    const response = await fetch(`${DEFAULT_PRINT_AGENT_URL}/print/label`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`无法打印 ${stringValue(product.barcode)}。`);
  }

  await request("/operations/product-control/labels/printed", {
    method: "POST",
    body: JSON.stringify({
      adminUserId: ids.adminUserId,
      employeeId: ids.employeeId,
      productIds: products.map((product) => stringValue(product.id))
    })
  });
}

async function runSingleAi(product: JsonRecord, ids: ReturnType<typeof useOperationIds>) {
  const images = Array.isArray(product.images) ? product.images.filter((image): image is JsonRecord => Boolean(image && typeof image === "object")) : [];
  const imageIds = images.map((image) => stringValue(image.id)).filter(Boolean);
  if (!imageIds.length) throw new Error("先上传照片。");
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

async function generateBarcode(product: JsonRecord, ids: ReturnType<typeof useOperationIds>) {
  await request(`/products/${stringValue(product.id)}/barcode`, {
    method: "POST",
    body: JSON.stringify({ adminUserId: ids.adminUserId, employeeId: ids.employeeId })
  });
}

async function setProductPrice(product: JsonRecord, ids: ReturnType<typeof useOperationIds>) {
  const currentPrice = typeof product.priceKsh === "number" ? String(product.priceKsh) : "";
  const nextPrice = window.prompt("输入商品价格（KSh）", currentPrice);
  if (nextPrice === null) return;
  const priceKsh = Number(nextPrice);
  if (!Number.isInteger(priceKsh) || priceKsh <= 0) throw new Error("请输入大于 0 的整数价格。");
  await request(`/operations/product-control/products/${stringValue(product.id)}/price`, {
    method: "PATCH",
    body: JSON.stringify({ adminUserId: ids.adminUserId, employeeId: ids.employeeId, priceKsh })
  });
}

async function prepareProductStorage(product: JsonRecord, ids: ReturnType<typeof useOperationIds>) {
  await request(`/operations/product-control/products/${stringValue(product.id)}/prepare-storage`, {
    method: "POST",
    body: JSON.stringify({ adminUserId: ids.adminUserId, employeeId: ids.employeeId })
  });
}

async function confirmProductPlaced(product: JsonRecord, ids: ReturnType<typeof useOperationIds>) {
  await request(`/operations/product-control/products/${stringValue(product.id)}/confirm-placed`, {
    method: "POST",
    body: JSON.stringify({ adminUserId: ids.adminUserId, employeeId: ids.employeeId })
  });
}

async function publishProduct(product: JsonRecord, ids: ReturnType<typeof useOperationIds>) {
  await request(`/operations/product-control/products/${stringValue(product.id)}/publish`, {
    method: "POST",
    body: JSON.stringify({ adminUserId: ids.adminUserId, employeeId: ids.employeeId })
  });
}

async function unpublishProduct(product: JsonRecord, ids: ReturnType<typeof useOperationIds>) {
  const reason = window.prompt("下架原因", "Operations product center");
  if (reason === null) return;
  await request(`/operations/product-control/products/${stringValue(product.id)}/unpublish`, {
    method: "POST",
    body: JSON.stringify({ adminUserId: ids.adminUserId, employeeId: ids.employeeId, reason })
  });
}

function PageHeader(props: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-muted-foreground text-sm">{props.eyebrow}</p>
        <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">{props.title}</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground text-sm">{props.description}</p>
      </div>
      {props.action ? <div className="flex gap-2">{props.action}</div> : null}
    </section>
  );
}

function Metric(props: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{props.title}</CardDescription>
        <CardTitle className="text-3xl">{props.value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={status === "PUBLISHED" ? "default" : "secondary"}>{productStatusLabel(status)}</Badge>;
}

function StatusMessage(props: { tone: "danger" | "neutral"; children: ReactNode }) {
  return (
    <div className={props.tone === "danger" ? "rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm" : "rounded-lg border bg-muted/40 p-3 text-sm"}>
      {props.children}
    </div>
  );
}

function Thumb({ product }: { product: JsonRecord }) {
  const image = latestImage(product);
  const url = image ? imageUrlFromImage(image) : "";
  return (
    <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
      <SafeProductImage src={url} alt={stringValue(product.title) || stringValue(product.productCode)} className="size-full object-cover" compact />
    </div>
  );
}

function SafeProductImage(props: { src: string; alt: string; className: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [props.src]);

  if (!props.src || failed) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
        <ImageIcon className={props.compact ? "size-4" : "size-7"} />
        {!props.compact ? <span className="text-xs">图片缺失</span> : null}
      </div>
    );
  }

  return <img src={props.src} alt={props.alt} className={props.className} onError={() => setFailed(true)} />;
}

function AiPreview({ job }: { job: JsonRecord }) {
  const output = normalizedAiOutput(job);
  const fields = [
    ["title", "标题"],
    ["category", "分类"],
    ["primaryColor", "颜色"],
    ["pattern", "图案"],
    ["sleeveType", "袖型"],
    ["brandLabel", "品牌"],
    ["sizeLabel", "标签尺码"]
  ] as const;
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
      {fields.map(([field, label]) => {
        const value = objectRecord(output?.[field]);
        return (
          <div key={field} className="flex justify-between gap-3">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right">{stringValue(value?.value) || "-"}</span>
          </div>
        );
      })}
    </div>
  );
}

function AttributeGroup(props: { title: string; values: readonly string[] }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="font-medium">{props.title}</div>
      <div className="mt-2 flex flex-wrap gap-1">
        {props.values.map((value) => <Badge key={value} variant="secondary">{optionLabel(value)}</Badge>)}
      </div>
    </div>
  );
}

function RequiredInput(props: { label: string; value: string; invalid: boolean; onChange: (value: string) => void }) {
  return (
    <Field data-invalid={props.invalid}>
      <FieldLabel>{props.label} *</FieldLabel>
      <Input aria-invalid={props.invalid} inputMode={props.label.includes("cm") ? "decimal" : undefined} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
      {props.invalid ? <FieldDescription>必填</FieldDescription> : null}
    </Field>
  );
}

function RequiredSelect(props: { label: string; value: string; values: readonly string[]; invalid: boolean; disabled?: boolean; onChange: (value: string) => void }) {
  return (
    <Field data-invalid={props.invalid} data-disabled={props.disabled}>
      <FieldLabel>{props.label} *</FieldLabel>
      <NativeSelect className="w-full" aria-invalid={props.invalid} disabled={props.disabled} value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {props.values.map((value) => <NativeSelectOption key={value} value={value}>{optionLabel(value)}</NativeSelectOption>)}
      </NativeSelect>
      {props.invalid ? <FieldDescription>必填</FieldDescription> : null}
    </Field>
  );
}

function FormField(props: { label: string; children: ReactNode }) {
  return (
    <Field>
      <FieldLabel>{props.label}</FieldLabel>
      {props.children}
    </Field>
  );
}

function latestImage(product: JsonRecord): JsonRecord | null {
  return latestImageRecord(product);
}

function latestImageRecord(product: JsonRecord | null): JsonRecord | null {
  const images = product?.images;
  return Array.isArray(images) ? objectRecord(images[0]) : null;
}

function imageUrlFromImage(image: JsonRecord): string {
  const publicUrl = stringValue(image.publicUrl);
  return publicUrl ? `${API_PROXY_URL}${publicUrl}` : "";
}

function objectRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function batchProgressLabel(product: JsonRecord | null): string {
  const batch = objectRecord(product?.batch);
  const batchCode = stringValue(batch?.batchCode);
  const number = product?.batchItemNumber;
  return batchCode ? `${batchCode} ${number}/10` : "";
}

function subcategoriesFor(category: string, current = ""): string[] {
  const lookup = PRODUCT_SUBCATEGORIES_BY_CATEGORY as Record<string, readonly string[]>;
  const options = [...(lookup[category] ?? ["OTHER"])];
  return current && !options.includes(current) ? [current, ...options] : options;
}

function positiveNumber(value: string): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function positiveInteger(value: string): boolean {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0;
}

function csv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function optionLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
