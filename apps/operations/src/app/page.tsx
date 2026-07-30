"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AI_AUDIENCES,
  AI_COLORS,
  AI_KIDS_AGE_RANGES,
  AI_PATTERNS,
  AI_SLEEVE_TYPES,
  PRODUCT_CATEGORY_OPTIONS,
  PRODUCT_SUBCATEGORIES_BY_CATEGORY
} from "@online-saler/shared-types";
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  ImageIcon,
  PrinterIcon,
  RotateCcwIcon,
  ScanBarcodeIcon,
  SparklesIcon,
  UploadIcon
} from "lucide-react";

import { DataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  buildCalibrationBody,
  formFromProductAndAi,
  normalizedAiOutput,
  STAGING_TEST_EMPLOYEE_ID,
  stringValue,
  workspaceReadiness,
  type JsonRecord,
  type WorkspaceForm
} from "./operations-workspace-flow";
import {
  buildLabelPrintPayload,
  DEFAULT_LABEL_SIZE,
  DEFAULT_PRINT_AGENT_URL,
  DEFAULT_PRINTER_NAME,
  normalizeLabelSize,
  printerList,
  selectDeliPrinter,
  type LabelSize
} from "./local-label-print";

const API_PROXY_URL = "/api-proxy";
const ACTIVE_PRODUCT_KEY = "operations.workspace.activeProductId";
const COMPLETED_PRODUCT_KEY = "operations.workspace.completedProductId";
const SESSION_DONE_KEY = "operations.workspace.sessionDone";
const SESSION_TARGET = 10;

const categories = PRODUCT_CATEGORY_OPTIONS;
const colors = AI_COLORS;
const audiences = AI_AUDIENCES;
const kidsAgeRanges = AI_KIDS_AGE_RANGES;
const patterns = AI_PATTERNS;
const sleeves = AI_SLEEVE_TYPES;
const conditions = ["LIKE_NEW", "EXCELLENT", "GOOD", "FAIR"];

type WorkspaceSummary = {
  waitingPhoto: number;
  waitingAi: number;
  waitingCalibration: number;
  completedToday: number;
  activeProductId: string | null;
};

type QueueRow = {
  label: string;
  value: number;
  owner: string;
};

async function request(path: string, options?: RequestInit): Promise<JsonRecord> {
  const response = await fetch(`${API_PROXY_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) }
  });
  const text = await response.text();
  let body: JsonRecord = {};
  try {
    body = text ? (JSON.parse(text) as JsonRecord) : {};
  } catch {
    body = { message: text || `Request failed: ${response.status}` };
  }
  if (!response.ok) {
    throw new Error(String(body.message ?? `Request failed: ${response.status}`));
  }
  return body;
}

async function uploadProductImage(productId: string, employeeId: string, file: File): Promise<JsonRecord> {
  const response = await fetch(`${API_PROXY_URL}/products/${productId}/images/upload`, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-Image-Type": "FRONT",
      "X-Employee-Id": employeeId
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
  if (!response.ok) {
    throw new Error(String(body.message ?? `Upload failed: ${response.status}`));
  }
  return body;
}

function objectRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function imageUrl(image: JsonRecord | null): string {
  const publicUrl = stringValue(image?.publicUrl);
  if (publicUrl) return `${API_PROXY_URL}${publicUrl}`;
  return "";
}

function extractionId(job: JsonRecord | null): string {
  return stringValue(job?.extractionId) || stringValue(job?.id);
}

function aiField(job: JsonRecord | null, key: string): { value: string; confidence: string } {
  const output = normalizedAiOutput(job);
  const field = objectRecord(output?.[key]);
  const confidence = field?.confidence;
  return {
    value: stringValue(field?.value) || "Not found",
    confidence: typeof confidence === "number" ? `${Math.round(confidence * 100)}%` : ""
  };
}

export default function OperationsWorkspace() {
  const employeeId = STAGING_TEST_EMPLOYEE_ID;
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<"dashboard" | "workspace">("dashboard");
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [product, setProduct] = useState<JsonRecord | null>(null);
  const [image, setImage] = useState<JsonRecord | null>(null);
  const [job, setJob] = useState<JsonRecord | null>(null);
  const [completedProduct, setCompletedProduct] = useState<JsonRecord | null>(null);
  const [form, setForm] = useState<WorkspaceForm>(() => formFromProductAndAi(null, null));
  const [previewUrl, setPreviewUrl] = useState("");
  const [labelSize, setLabelSize] = useState<LabelSize>(DEFAULT_LABEL_SIZE);
  const [printMessage, setPrintMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [lastBarcode, setLastBarcode] = useState("");
  const [sessionDone, setSessionDone] = useState(0);
  const [barcodeSheetOpen, setBarcodeSheetOpen] = useState(false);

  const readiness = useMemo(() => workspaceReadiness({ product, image, job, form }), [product, image, job, form]);
  const currentImageUrl = previewUrl || imageUrl(image);
  const currentStep = completedProduct ? sessionDone : Math.min(sessionDone + 1, SESSION_TARGET);
  const productStatus = stringValue(product?.status) || "NO_ITEM";
  const barcodeValue = stringValue((completedProduct ?? product)?.barcode) || lastBarcode;

  const queueRows = useMemo<QueueRow[]>(
    () => [
      { label: "上传", value: summary?.waitingPhoto ?? 0, owner: "商品中心" },
      { label: "AI识别", value: summary?.waitingAi ?? 0, owner: "商品中心" },
      { label: "人工校准", value: summary?.waitingCalibration ?? 0, owner: "商品中心" },
      { label: "今日完成", value: summary?.completedToday ?? 0, owner: "商品中心" }
    ],
    [summary]
  );

  const queueColumns = useMemo<ColumnDef<QueueRow>[]>(
    () => [
      {
        accessorKey: "label",
        header: "队列",
        cell: ({ row }) => <span className="font-medium">{row.original.label}</span>
      },
      {
        accessorKey: "value",
        header: "数量",
        cell: ({ row }) => <Badge variant={row.original.label === "今日完成" ? "default" : "secondary"}>{row.original.value}</Badge>
      },
      {
        accessorKey: "owner",
        header: "模块",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.owner}</span>
      }
    ],
    []
  );

  const loadSummary = useCallback(async () => {
    const next = (await request(`/operations/workspace/summary?employeeId=${employeeId}`)) as WorkspaceSummary;
    setSummary(next);
    return next;
  }, [employeeId]);

  const applyWorkspacePayload = useCallback((payload: JsonRecord | null) => {
    const nextProduct = objectRecord(payload?.product);
    const nextImage = objectRecord(payload?.latestImage) ?? objectRecord((nextProduct?.images as unknown[])?.[0]);
    const nextJob = objectRecord(payload?.latestExtraction) ?? objectRecord((nextProduct?.aiExtractions as unknown[])?.[0]);
    const productId = stringValue(nextProduct?.id);
    const isCompleted = stringValue(nextProduct?.status) === "BARCODE_ASSIGNED";

    setProduct(nextProduct);
    setImage(nextImage);
    setJob(nextJob);
    setForm(formFromProductAndAi(nextProduct, nextJob));
    setCompletedProduct(isCompleted ? nextProduct : null);
    setPrintMessage("");

    const barcode = stringValue(nextProduct?.barcode);
    if (barcode) setLastBarcode(barcode);

    if (productId) {
      if (isCompleted) {
        localStorage.setItem(COMPLETED_PRODUCT_KEY, productId);
        localStorage.removeItem(ACTIVE_PRODUCT_KEY);
      } else {
        localStorage.setItem(ACTIVE_PRODUCT_KEY, productId);
        localStorage.removeItem(COMPLETED_PRODUCT_KEY);
      }
      setView("workspace");
    }
  }, []);

  const loadActive = useCallback(async (productId?: string | null) => {
    const query = new URLSearchParams({ employeeId });
    if (productId) query.set("productId", productId);
    const payload = await request(`/operations/workspace/active?${query.toString()}`);
    if (payload.product) {
      applyWorkspacePayload(payload);
    }
  }, [applyWorkspacePayload, employeeId]);

  useEffect(() => {
    async function boot() {
      try {
        const storedDone = Number(localStorage.getItem(SESSION_DONE_KEY) ?? "0");
        setSessionDone(Number.isFinite(storedDone) ? storedDone : 0);
        const nextSummary = await loadSummary();
        const storedProductId = localStorage.getItem(ACTIVE_PRODUCT_KEY);
        const storedCompletedProductId = localStorage.getItem(COMPLETED_PRODUCT_KEY);
        const activeId = storedProductId || nextSummary.activeProductId || storedCompletedProductId;
        if (activeId) await loadActive(activeId);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load today's work.");
      } finally {
        setLoaded(true);
      }
    }

    void boot();
  }, [loadActive, loadSummary]);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  async function startWork() {
    const payload = await request("/operations/workspace/start", {
      method: "POST",
      body: JSON.stringify({ employeeId })
    });
    applyWorkspacePayload(payload);
    await loadSummary();
  }

  async function choosePhoto(file: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!file) return;
    if (!product?.id) {
      setError("Start work before adding a photo.");
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    await run("photo", async () => {
      const uploaded = await uploadProductImage(stringValue(product.id), employeeId, file);
      setImage(uploaded);
      const recognized = await request("/ai-jobs", {
        method: "POST",
        body: JSON.stringify({
          productId: product.id,
          imageIds: [uploaded.id],
          promptVersion: "product-v1"
        })
      });
      setJob(recognized);
      setForm(formFromProductAndAi(product, recognized));
      await loadSummary();
    });
  }

  async function saveAndNext() {
    if (!product?.id) throw new Error("Start a work item first.");
    const extraction = extractionId(job);
    if (!extraction) throw new Error("AI result is required before saving.");

    const calibrated = await request(`/products/${product.id}/calibrate`, {
      method: "POST",
      body: JSON.stringify(buildCalibrationBody({ employeeId, extractionId: extraction, form }))
    });
    const barcoded = await request(`/products/${product.id}/barcode`, {
      method: "POST",
      body: JSON.stringify({ employeeId })
    });

    setProduct(barcoded);
    setCompletedProduct(barcoded);
    setLastBarcode(stringValue(barcoded.barcode));
    setPrintMessage("");
    setBarcodeSheetOpen(true);
    const nextDone = Math.min(sessionDone + 1, SESSION_TARGET);
    setSessionDone(nextDone);
    localStorage.setItem(SESSION_DONE_KEY, String(nextDone));
    localStorage.removeItem(ACTIVE_PRODUCT_KEY);
    localStorage.setItem(COMPLETED_PRODUCT_KEY, stringValue(barcoded.id));

    await loadSummary();

    if (!calibrated) {
      throw new Error("Calibration was not saved.");
    }
  }

  async function printLabel() {
    const productForPrint = completedProduct ?? product;
    if (!productForPrint) throw new Error("Save the item before printing.");

    let healthResponse: Response;
    try {
      healthResponse = await fetch(`${DEFAULT_PRINT_AGENT_URL}/health`, { method: "GET" });
    } catch {
      throw new Error("Start the local print agent on this computer, then try again.");
    }
    if (!healthResponse.ok) {
      throw new Error("The local print agent is not ready. Restart it and try again.");
    }

    let printerName = DEFAULT_PRINTER_NAME;
    try {
      const printersResponse = await fetch(`${DEFAULT_PRINT_AGENT_URL}/printers`, { method: "GET" });
      const printersBody = (await printersResponse.json()) as JsonRecord;
      const printers = printerList(printersBody.printers);
      if (printers.length > 0) {
        printerName = selectDeliPrinter(printers);
        if (!printers.some((printer) => printer.name === printerName)) {
          throw new Error("Deli 720 printer is not available on this computer.");
        }
      }
    } catch (caught) {
      if (caught instanceof Error && caught.message.includes("Deli 720")) throw caught;
      throw new Error("Could not read printers from the local print agent.");
    }

    const payload = buildLabelPrintPayload({ product: productForPrint, labelSize, printerName });
    const response = await fetch(`${DEFAULT_PRINT_AGENT_URL}/print/label`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    let body: JsonRecord = {};
    try {
      body = text ? (JSON.parse(text) as JsonRecord) : {};
    } catch {
      body = { message: text };
    }
    if (!response.ok) {
      throw new Error(String(body.message ?? body.error ?? "Label print failed."));
    }
    setPrintMessage(`Printed ${labelSize} label on ${printerName}.`);
  }

  async function startNextItem() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setImage(null);
    setJob(null);
    setProduct(null);
    setCompletedProduct(null);
    setPrintMessage("");
    setBarcodeSheetOpen(false);
    setForm(formFromProductAndAi(null, null));
    localStorage.removeItem(COMPLETED_PRODUCT_KEY);
    await startWork();
  }

  function resetSession() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    localStorage.removeItem(ACTIVE_PRODUCT_KEY);
    localStorage.removeItem(COMPLETED_PRODUCT_KEY);
    localStorage.removeItem(SESSION_DONE_KEY);
    setSessionDone(0);
    setProduct(null);
    setImage(null);
    setJob(null);
    setCompletedProduct(null);
    setPreviewUrl("");
    setPrintMessage("");
    setLastBarcode("");
    setBarcodeSheetOpen(false);
    setForm(formFromProductAndAi(null, null));
    setView("dashboard");
    void loadSummary();
  }

  function updateForm(key: keyof WorkspaceForm, value: string) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "category") {
        const options = subcategoriesFor(value);
        next.subcategory = options.includes(next.subcategory) ? next.subcategory : options[0] ?? "OTHER";
      }
      if (key === "audience" && value !== "KIDS") {
        next.kidsAgeRange = "NOT_APPLICABLE";
      }
      return next;
    });
  }

  if (!loaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>正在打开工作台</CardTitle>
            <CardDescription>正在读取今天的商品数字化任务。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">商品中心</p>
          <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">商品数字化工作台</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
            上传真实衣服照片，读取 AI 字段，人工校准后生成正式 Barcode。
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a href="/control">审核/发布</a>
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={Boolean(busy)}>
                <RotateCcwIcon data-icon="inline-start" />
                重置
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>重置当前测试会话</DialogTitle>
                <DialogDescription>
                  只会清除本浏览器里的当前工作进度，不会删除已经保存到数据库的商品。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">取消</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="destructive" onClick={resetSession}>
                    确认重置
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </section>

      {view === "dashboard" ? (
        <section className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <Card>
            <CardHeader>
              <CardTitle>今日队列</CardTitle>
              <CardDescription>商品中心当前待处理状态。</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable columns={queueColumns} data={queueRows} getRowId={(row) => row.label} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>开始录入</CardTitle>
              <CardDescription>员工只需要从这里开始，每次处理一件衣服。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <StepLine done={false} icon={<UploadIcon />} label="上传照片" />
              <StepLine done={false} icon={<SparklesIcon />} label="AI识别" />
              <StepLine done={false} icon={<CheckCircle2Icon />} label="人工校准" />
              <StepLine done={false} icon={<ScanBarcodeIcon />} label="生成 Barcode" />
              {lastBarcode ? <StatusMessage tone="success">上一件 Barcode：{lastBarcode}</StatusMessage> : null}
              {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
            </CardContent>
            <CardFooter>
              <Button className="w-full" disabled={Boolean(busy)} onClick={() => run("start", startWork)}>
                {busy === "start" ? "正在打开..." : summary?.activeProductId ? "继续工作" : "开始工作"}
              </Button>
            </CardFooter>
          </Card>
        </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.82fr)_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>照片</CardTitle>
                  <CardDescription>
                    Batch {currentStep} / {SESSION_TARGET}
                  </CardDescription>
                </div>
                <Badge variant={readiness.canSaveAndNext ? "default" : "secondary"}>{readiness.label}</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex min-h-[420px] items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                {currentImageUrl ? (
                  <img src={currentImageUrl} alt="Clothing item" className="max-h-[620px] max-w-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-2 px-6 text-center text-muted-foreground">
                    <ImageIcon />
                    <p className="font-medium text-foreground">上传正面照片</p>
                    <p className="text-sm">使用相机或选择清晰的 JPEG、PNG、WEBP。</p>
                  </div>
                )}
              </div>
              <Button asChild variant="outline" disabled={Boolean(busy) || Boolean(completedProduct)}>
                <label className="cursor-pointer">
                  <UploadIcon data-icon="inline-start" />
                  {busy === "photo" ? "正在上传并识别..." : currentImageUrl ? "重新上传" : "上传照片"}
                  <Input
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    disabled={Boolean(busy) || Boolean(completedProduct)}
                    onChange={(event) => void choosePhoto(event.target.files?.[0] ?? null)}
                  />
                </label>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle>{form.title || "等待 AI 识别"}</CardTitle>
                  <CardDescription>
                    状态：{optionLabel(productStatus)}{barcodeValue ? ` / Barcode ${barcodeValue}` : ""}
                  </CardDescription>
                </div>
                <Badge variant={completedProduct ? "default" : "secondary"}>
                  {completedProduct ? "已完成" : "进行中"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="calibration">
                <TabsList className="w-full justify-start overflow-x-auto" variant="line">
                  <TabsTrigger value="upload">上传</TabsTrigger>
                  <TabsTrigger value="ai">AI识别</TabsTrigger>
                  <TabsTrigger value="calibration">人工校准</TabsTrigger>
                  <TabsTrigger value="review">审核</TabsTrigger>
                  <TabsTrigger value="publish">发布</TabsTrigger>
                  <TabsTrigger value="barcode">Barcode</TabsTrigger>
                </TabsList>
                <TabsContent value="upload" className="pt-4">
                  <StatusMessage tone={currentImageUrl ? "success" : "neutral"}>
                    {currentImageUrl ? "照片已上传并保存到 Storage。" : "请先上传商品正面照片。"}
                  </StatusMessage>
                </TabsContent>
                <TabsContent value="ai" className="pt-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    {["category", "primaryColor", "audience", "kidsAgeRange", "brandLabel", "sizeLabel"].map((field) => {
                      const value = aiField(job, field);
                      return (
                        <Card key={field} className="shadow-none">
                          <CardHeader className="p-4">
                            <CardDescription>{fieldLabel(field)}</CardDescription>
                            <CardTitle className="text-base">{value.value}</CardTitle>
                            {value.confidence ? <Badge variant="secondary">{value.confidence}</Badge> : null}
                          </CardHeader>
                        </Card>
                      );
                    })}
                  </div>
                </TabsContent>
                <TabsContent value="calibration" className="pt-4">
                  <FieldGroup>
                    <FormField label="Title">
                      <Input value={form.title} onChange={(event) => updateForm("title", event.target.value)} />
                    </FormField>
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField label="Category">
                        <NativeSelect className="w-full" value={form.category} onChange={(event) => updateForm("category", event.target.value)}>
                          {categories.map((value) => <NativeSelectOption key={value} value={value}>{optionLabel(value)}</NativeSelectOption>)}
                        </NativeSelect>
                      </FormField>
                      <FormField label="Subcategory">
                        <NativeSelect className="w-full" value={form.subcategory} onChange={(event) => updateForm("subcategory", event.target.value)}>
                          {subcategoriesFor(form.category, form.subcategory).map((value) => (
                            <NativeSelectOption key={value} value={value}>{optionLabel(value)}</NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </FormField>
                      <FormField label="Gender">
                        <NativeSelect className="w-full" value={form.audience} onChange={(event) => updateForm("audience", event.target.value)}>
                          {audiences.map((value) => <NativeSelectOption key={value} value={value}>{audienceLabel(value)}</NativeSelectOption>)}
                        </NativeSelect>
                      </FormField>
                      <FormField label="Kids age">
                        <NativeSelect
                          className="w-full"
                          value={form.kidsAgeRange}
                          disabled={form.audience !== "KIDS"}
                          onChange={(event) => updateForm("kidsAgeRange", event.target.value)}
                        >
                          {kidsAgeRanges.map((value) => <NativeSelectOption key={value} value={value}>{kidsAgeLabel(value)}</NativeSelectOption>)}
                        </NativeSelect>
                      </FormField>
                      <FormField label="Color">
                        <NativeSelect className="w-full" value={form.color} onChange={(event) => updateForm("color", event.target.value)}>
                          {colors.map((value) => <NativeSelectOption key={value} value={value}>{optionLabel(value)}</NativeSelectOption>)}
                        </NativeSelect>
                      </FormField>
                      <FormField label="Brand">
                        <Input value={form.brand} onChange={(event) => updateForm("brand", event.target.value)} />
                      </FormField>
                      <FormField label="Size">
                        <Input value={form.sizeLabel} onChange={(event) => updateForm("sizeLabel", event.target.value)} />
                      </FormField>
                      <FormField label="Pattern">
                        <NativeSelect className="w-full" value={form.pattern} onChange={(event) => updateForm("pattern", event.target.value)}>
                          {patterns.map((value) => <NativeSelectOption key={value} value={value}>{optionLabel(value)}</NativeSelectOption>)}
                        </NativeSelect>
                      </FormField>
                      <FormField label="Sleeve">
                        <NativeSelect className="w-full" value={form.sleeveType} onChange={(event) => updateForm("sleeveType", event.target.value)}>
                          {sleeves.map((value) => <NativeSelectOption key={value} value={value}>{optionLabel(value)}</NativeSelectOption>)}
                        </NativeSelect>
                      </FormField>
                      <FormField label="Condition">
                        <NativeSelect className="w-full" value={form.conditionGrade} onChange={(event) => updateForm("conditionGrade", event.target.value)}>
                          {conditions.map((value) => <NativeSelectOption key={value} value={value}>{optionLabel(value)}</NativeSelectOption>)}
                        </NativeSelect>
                      </FormField>
                    </div>
                    <Separator />
                    <div className="grid gap-4 md:grid-cols-5">
                      <FormField label="Length cm">
                        <Input inputMode="decimal" value={form.lengthCm} onChange={(event) => updateForm("lengthCm", event.target.value)} />
                      </FormField>
                      <FormField label="Chest cm">
                        <Input inputMode="decimal" value={form.chestWidthCm} onChange={(event) => updateForm("chestWidthCm", event.target.value)} />
                      </FormField>
                      <FormField label="Shoulder cm">
                        <Input inputMode="decimal" value={form.shoulderWidthCm} onChange={(event) => updateForm("shoulderWidthCm", event.target.value)} />
                      </FormField>
                      <FormField label="Waist cm">
                        <Input inputMode="decimal" value={form.waistCm} onChange={(event) => updateForm("waistCm", event.target.value)} />
                      </FormField>
                      <FormField label="Hip cm">
                        <Input inputMode="decimal" value={form.hipCm} onChange={(event) => updateForm("hipCm", event.target.value)} />
                      </FormField>
                    </div>
                    <FormField label="Defects" description="没有瑕疵时保持为空。">
                      <Textarea value={form.defects} onChange={(event) => updateForm("defects", event.target.value)} rows={3} />
                    </FormField>
                  </FieldGroup>
                </TabsContent>
                <TabsContent value="review" className="pt-4">
                  <StatusMessage tone="neutral">审核和发布操作已经迁移到新的后台壳层下的商品控制页。</StatusMessage>
                </TabsContent>
                <TabsContent value="publish" className="pt-4">
                  <Button asChild variant="outline">
                    <a href="/control">打开商品控制</a>
                  </Button>
                </TabsContent>
                <TabsContent value="barcode" className="pt-4">
                  <StatusMessage tone={barcodeValue ? "success" : "neutral"}>
                    {barcodeValue ? `正式 Barcode：${barcodeValue}` : "Barcode 只能在人工校准保存后生成。"}
                  </StatusMessage>
                </TabsContent>
              </Tabs>

              {error ? (
                <div className="mt-4">
                  <StatusMessage tone="danger">{error}</StatusMessage>
                </div>
              ) : null}
            </CardContent>
            <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:justify-between">
              <Button
                disabled={!readiness.canSaveAndNext || Boolean(busy) || Boolean(completedProduct)}
                onClick={() => run("save", saveAndNext)}
              >
                <CheckCircle2Icon data-icon="inline-start" />
                {busy === "save" ? "正在保存..." : "保存校准并生成 Barcode"}
              </Button>
              <Button variant="outline" disabled={!completedProduct || Boolean(busy)} onClick={() => setBarcodeSheetOpen(true)}>
                <ScanBarcodeIcon data-icon="inline-start" />
                查看 Barcode
              </Button>
            </CardFooter>
          </Card>
        </section>
      )}

      <Sheet open={barcodeSheetOpen} onOpenChange={setBarcodeSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Barcode 标签</SheetTitle>
            <SheetDescription>确认后可通过本地 Deli 720 打印代理打印。</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-4">
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-muted-foreground text-sm">正式 Barcode</p>
              <p className="mt-2 break-all font-semibold text-xl">{barcodeValue || "尚未生成"}</p>
            </div>
            <FormField label="Label size">
              <NativeSelect className="w-full" value={labelSize} onChange={(event) => setLabelSize(normalizeLabelSize(event.target.value))}>
                <NativeSelectOption value="60x40">60x40</NativeSelectOption>
                <NativeSelectOption value="40x30">40x30</NativeSelectOption>
              </NativeSelect>
            </FormField>
            <Button disabled={!completedProduct || Boolean(busy)} onClick={() => run("print", printLabel)}>
              <PrinterIcon data-icon="inline-start" />
              {busy === "print" ? "正在打印..." : "打印标签"}
            </Button>
            <Button variant="outline" disabled={!completedProduct || Boolean(busy)} onClick={() => run("next", startNextItem)}>
              开始下一件
            </Button>
            {printMessage ? <StatusMessage tone="success">{printMessage}</StatusMessage> : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StepLine(props: { done: boolean; icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {props.icon}
      </div>
      <span className="font-medium text-sm">{props.label}</span>
      {props.done ? <Badge className="ml-auto">Done</Badge> : <Badge className="ml-auto" variant="secondary">Pending</Badge>}
    </div>
  );
}

function FormField(props: { label: string; description?: string; children: ReactNode }) {
  return (
    <Field>
      <FieldLabel>{props.label}</FieldLabel>
      {props.children}
      {props.description ? <FieldDescription>{props.description}</FieldDescription> : null}
    </Field>
  );
}

function StatusMessage(props: { tone: "success" | "danger" | "neutral"; children: ReactNode }) {
  const Icon = props.tone === "danger" ? CircleAlertIcon : CheckCircle2Icon;
  return (
    <div
      className={
        props.tone === "danger"
          ? "flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
          : "flex gap-2 rounded-lg border bg-muted/40 p-3 text-sm"
      }
    >
      <Icon className="mt-0.5 shrink-0" />
      <div>{props.children}</div>
    </div>
  );
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    category: "Category",
    primaryColor: "Color",
    audience: "Gender",
    kidsAgeRange: "Kids age",
    brandLabel: "Brand",
    sizeLabel: "Size"
  };
  return labels[field] ?? field;
}

function subcategoriesFor(category: string, current = ""): string[] {
  const lookup = PRODUCT_SUBCATEGORIES_BY_CATEGORY as Record<string, readonly string[]>;
  const options = [...(lookup[category] ?? ["OTHER"])];
  return current && !options.includes(current) ? [current, ...options] : options;
}

function optionLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function audienceLabel(value: string): string {
  const labels: Record<string, string> = {
    WOMEN: "Women",
    MEN: "Men",
    KIDS: "Kids",
    UNISEX: "Unisex"
  };
  return labels[value] ?? optionLabel(value);
}

function kidsAgeLabel(value: string): string {
  const labels: Record<string, string> = {
    NOT_APPLICABLE: "Not kids",
    NEWBORN: "Newborn",
    BABY_0_12M: "Baby 0-12m",
    TODDLER_1_3Y: "Toddler 1-3y",
    PRESCHOOL_3_5Y: "Age 3-5",
    KIDS_6_8Y: "Age 6-8",
    KIDS_9_12: "Age 9-12",
    KIDS_9_12Y: "Age 9-12",
    TEEN_13_16Y: "Teen 13-16"
  };
  return labels[value] ?? optionLabel(value);
}
