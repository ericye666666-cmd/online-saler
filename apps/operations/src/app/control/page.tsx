"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BoxesIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  PackageCheckIcon,
  PrinterIcon,
  RefreshCwIcon,
  ScanBarcodeIcon
} from "lucide-react";
import {
  buildLabelPrintPayload,
  DEFAULT_LABEL_SIZE,
  DEFAULT_PRINT_AGENT_URL,
  DEFAULT_PRINTER_NAME,
  normalizeLabelSize,
  printerList,
  selectDeliPrinter,
  type LabelSize
} from "../local-label-print";
import {
  stringValue,
  type JsonRecord
} from "../operations-workspace-flow";
import {
  canAssignProductLocation,
  canConfirmProductPlaced,
  canPublishProduct,
  canPrintProductLabel,
  canUnpublishProduct,
  productControlImageUrl,
  productControlInventoryItem,
  productControlLocationCode
} from "../product-control-flow";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOperationsSession } from "@/components/admin/operations-access-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldGroup,
  FieldLabel
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";

const API_PROXY_URL = "/api-proxy";

type ProductControlSummary = {
  readyForPrice: number;
  readyForStorage: number;
  readyToPublish: number;
  pendingStockIn: number;
  available: number;
  published: number;
  printedToday: number;
};

const statusFilters = [
  "",
  "BARCODE_ASSIGNED",
  "READY_FOR_STORAGE",
  "PUBLISHED",
  "UNPUBLISHED"
];

async function request(path: string, options?: RequestInit): Promise<unknown> {
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
    const record = body && typeof body === "object" ? (body as JsonRecord) : {};
    throw new Error(String(record.message ?? `Request failed: ${response.status}`));
  }
  return body;
}

export default function ProductControlPage() {
  const { session, hasPermission } = useOperationsSession();
  const adminUserId = stringValue(session?.adminUser?.id);
  const employeeId = stringValue(session?.adminUser?.linkedEmployeeId);
  const canEditProduct = hasPermission("action.product.edit");
  const canApproveProduct = hasPermission("action.product.approve");
  const canPublishItems = hasPermission("action.product.publish");
  const [summary, setSummary] = useState<ProductControlSummary | null>(null);
  const [products, setProducts] = useState<JsonRecord[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState("");
  const [labelSize, setLabelSize] = useState<LabelSize>(DEFAULT_LABEL_SIZE);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedProducts = useMemo(
    () => products.filter((product) => selected[stringValue(product.id)]),
    [products, selected]
  );

  const load = useCallback(async () => {
    const productQuery = new URLSearchParams();
    if (status) productQuery.set("status", status);
    productQuery.set("adminUserId", adminUserId);
    const summaryQuery = new URLSearchParams({ adminUserId });
    const [nextSummary, nextProducts] = await Promise.all([
      request(`/operations/product-control/summary?${summaryQuery.toString()}`) as Promise<ProductControlSummary>,
      request(`/operations/product-control/products?${productQuery.toString()}`) as Promise<JsonRecord[]>
    ]);
    setSummary(nextSummary);
    setProducts(nextProducts);
    setPrices((current) => {
      const next = { ...current };
      for (const product of nextProducts) {
        const id = stringValue(product.id);
        if (!id || next[id] !== undefined) continue;
        const price = product.priceKsh;
        next[id] = typeof price === "number" ? String(price) : "";
      }
      return next;
    });
  }, [adminUserId, status]);

  useEffect(() => {
    void run("load", load);
  }, [load]);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  async function savePrice(product: JsonRecord) {
    const id = stringValue(product.id);
    await request(`/operations/product-control/products/${id}/price`, {
      method: "PATCH",
      body: JSON.stringify({
        employeeId,
        adminUserId,
        priceKsh: Number(prices[id])
      })
    });
    setMessage("Price saved.");
    await load();
  }

  async function prepareStorage(product: JsonRecord) {
    const id = stringValue(product.id);
    await request(`/operations/product-control/products/${id}/prepare-storage`, {
      method: "POST",
      body: JSON.stringify({ employeeId, adminUserId })
    });
    setMessage("Item is ready for storage.");
    await load();
  }

  async function assignLocation(product: JsonRecord) {
    const id = stringValue(product.id);
    await request(`/operations/product-control/products/${id}/location-hint`, {
      method: "POST",
      body: JSON.stringify({ employeeId, adminUserId })
    });
    setMessage("Random location assigned.");
    await load();
  }

  async function confirmPlaced(product: JsonRecord) {
    const id = stringValue(product.id);
    await request(`/operations/product-control/products/${id}/confirm-placed`, {
      method: "POST",
      body: JSON.stringify({ employeeId, adminUserId })
    });
    setMessage("Item placed in warehouse.");
    await load();
  }

  async function publishProduct(product: JsonRecord) {
    const id = stringValue(product.id);
    await request(`/operations/product-control/products/${id}/publish`, {
      method: "POST",
      body: JSON.stringify({ employeeId, adminUserId })
    });
    setMessage("Item is live in the storefront catalog.");
    await load();
  }

  async function unpublishProduct(product: JsonRecord) {
    const id = stringValue(product.id);
    const reason = window.prompt("Reason for taking this item offline?", "Operations product control");
    if (reason === null) return;
    await request(`/operations/product-control/products/${id}/unpublish`, {
      method: "POST",
      body: JSON.stringify({ employeeId, adminUserId, reason })
    });
    setMessage("Item is offline.");
    await load();
  }

  async function printSelectedLabels() {
    if (selectedProducts.length === 0) throw new Error("Choose at least one item to print.");

    let healthResponse: Response;
    try {
      healthResponse = await fetch(`${DEFAULT_PRINT_AGENT_URL}/health`, { method: "GET" });
    } catch {
      throw new Error("Start the local print agent on this computer, then print again.");
    }
    if (!healthResponse.ok) {
      throw new Error("The local print agent is not ready.");
    }

    const printersResponse = await fetch(`${DEFAULT_PRINT_AGENT_URL}/printers`, { method: "GET" });
    const printersBody = (await printersResponse.json()) as JsonRecord;
    const printerName = selectDeliPrinter(printerList(printersBody.printers), DEFAULT_PRINTER_NAME);

    for (const product of selectedProducts) {
      const payload = buildLabelPrintPayload({ product, labelSize, printerName });
      const response = await fetch(`${DEFAULT_PRINT_AGENT_URL}/print/label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(`Could not print ${stringValue(product.barcode)}.`);
      }
    }

    await request("/operations/product-control/labels/printed", {
      method: "POST",
      body: JSON.stringify({
        employeeId,
        adminUserId,
        productIds: selectedProducts.map((product) => stringValue(product.id))
      })
    });
    setMessage(`Printed ${selectedProducts.length} label(s) on ${printerName}.`);
    setSelected({});
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">商品中心</p>
          <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">商品控制</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
            处理审核、价格、随机库位、标签打印、发布和下架。
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a href="/">商品数字化</a>
          </Button>
          <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => run("load", load)}>
            <RefreshCwIcon data-icon="inline-start" />
            刷新
          </Button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        <Metric title="待定价" value={summary?.readyForPrice ?? 0} icon={<PackageCheckIcon />} />
        <Metric title="待入仓" value={summary?.readyForStorage ?? 0} icon={<BoxesIcon />} />
        <Metric title="待摆放" value={summary?.pendingStockIn ?? 0} icon={<BoxesIcon />} />
        <Metric title="待发布" value={summary?.readyToPublish ?? 0} icon={<CheckCircle2Icon />} />
        <Metric title="已发布" value={summary?.published ?? 0} icon={<PackageCheckIcon />} strong />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>筛选和批量操作</CardTitle>
          <CardDescription>选择商品后可以批量打印 Barcode 标签。</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="md:grid md:grid-cols-[minmax(180px,1fr)_minmax(160px,0.7fr)_auto_auto] md:items-end">
            <Field>
              <FieldLabel>Status</FieldLabel>
              <NativeSelect className="w-full" value={status} onChange={(event) => setStatus(event.target.value)}>
                {statusFilters.map((value) => (
                  <NativeSelectOption key={value || "all"} value={value}>{value ? optionLabel(value) : "All active"}</NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Label size</FieldLabel>
              <NativeSelect className="w-full" value={labelSize} onChange={(event) => setLabelSize(normalizeLabelSize(event.target.value))}>
                <NativeSelectOption value="60x40">60x40</NativeSelectOption>
                <NativeSelectOption value="40x30">40x30</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Button
              type="button"
              disabled={Boolean(busy) || selectedProducts.length === 0 || !canEditProduct}
              onClick={() => run("print", printSelectedLabels)}
            >
              <PrinterIcon data-icon="inline-start" />
              Print selected ({selectedProducts.length})
            </Button>
            <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => run("load", load)}>
              Refresh
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>

      {message ? <StatusMessage tone="success">{message}</StatusMessage> : null}
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}

      <section className="grid gap-4">
        {products.map((product) => {
          const id = stringValue(product.id);
          const location = productControlLocationCode(product);
          const item = productControlInventoryItem(product);
          const photo = productControlImageUrl(product, API_PROXY_URL);
          const isAvailable = stringValue(item?.status) === "AVAILABLE";
          const title = stringValue(product.title) || "Untitled item";
          const meta = [product.category, product.subcategory, product.color, product.finalSizeLabel].map(stringValue).filter(Boolean).join(" / ");

          return (
            <Card key={id}>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <Checkbox
                      checked={Boolean(selected[id])}
                      disabled={!canEditProduct || !canPrintProductLabel(product)}
                      onCheckedChange={(checked) => setSelected((current) => ({ ...current, [id]: checked === true }))}
                    />
                    <div className="min-w-0">
                      <CardTitle className="break-words text-base">{title}</CardTitle>
                      <CardDescription>{meta || "No product attributes yet"}</CardDescription>
                    </div>
                  </div>
                  <Badge variant={isAvailable ? "default" : "secondary"}>{optionLabel(stringValue(product.status))}</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[150px_minmax(180px,0.7fr)_minmax(180px,0.7fr)_1fr]">
                <div className="flex min-h-36 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                  {photo ? <img src={photo} alt="Product" className="max-h-44 max-w-full object-contain" /> : <span className="text-muted-foreground text-sm">No photo</span>}
                </div>
                <Field>
                  <FieldLabel>Price KSh</FieldLabel>
                  <Input
                    inputMode="numeric"
                    value={prices[id] ?? ""}
                    onChange={(event) => setPrices((current) => ({ ...current, [id]: event.target.value }))}
                  />
                </Field>
                <div className="rounded-lg border bg-muted/40 p-3">
                  <p className="text-muted-foreground text-xs">{isAvailable ? "Placed at" : location ? "Put at" : "No location yet"}</p>
                  <p className="mt-2 font-semibold text-xl">{location || "-"}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <Button variant="outline" disabled={Boolean(busy) || !canEditProduct} onClick={() => run(`price-${id}`, () => savePrice(product))}>
                    Save price
                  </Button>
                  <Button variant="outline" disabled={Boolean(busy) || !canApproveProduct} onClick={() => run(`ready-${id}`, () => prepareStorage(product))}>
                    Ready storage
                  </Button>
                  <Button variant="outline" disabled={Boolean(busy) || !canEditProduct || !canAssignProductLocation(product)} onClick={() => run(`loc-${id}`, () => assignLocation(product))}>
                    Random place
                  </Button>
                  <Button disabled={Boolean(busy) || !canEditProduct || !canConfirmProductPlaced(product)} onClick={() => run(`placed-${id}`, () => confirmPlaced(product))}>
                    Confirm placed
                  </Button>
                  <Button disabled={Boolean(busy) || !canPublishItems || !canPublishProduct(product)} onClick={() => run(`publish-${id}`, () => publishProduct(product))}>
                    Publish
                  </Button>
                  <Button variant="outline" disabled={Boolean(busy) || !canPublishItems || !canUnpublishProduct(product)} onClick={() => run(`unpublish-${id}`, () => unpublishProduct(product))}>
                    Unpublish
                  </Button>
                </div>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2 text-muted-foreground text-sm">
                <ScanBarcodeIcon data-icon="inline-start" />
                {stringValue(product.barcode) || "No barcode"}
              </CardFooter>
            </Card>
          );
        })}
        {products.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No products found for this filter.
            </CardContent>
          </Card>
        ) : null}
      </section>
    </div>
  );
}

function Metric(props: { title: string; value: number; icon: ReactNode; strong?: boolean }) {
  return (
    <Card className={props.strong ? "bg-primary text-primary-foreground" : ""}>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardDescription className={props.strong ? "text-primary-foreground/75" : ""}>{props.title}</CardDescription>
        {props.icon}
      </CardHeader>
      <CardContent>
        <p className="font-semibold text-3xl">{props.value}</p>
      </CardContent>
    </Card>
  );
}

function StatusMessage(props: { tone: "success" | "danger"; children: ReactNode }) {
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

function optionLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
