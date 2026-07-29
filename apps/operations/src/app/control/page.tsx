"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  STAGING_TEST_EMPLOYEE_ID,
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
  const employeeId = STAGING_TEST_EMPLOYEE_ID;
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
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const [nextSummary, nextProducts] = await Promise.all([
      request("/operations/product-control/summary") as Promise<ProductControlSummary>,
      request(`/operations/product-control/products${query}`) as Promise<JsonRecord[]>
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
  }, [status]);

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
      body: JSON.stringify({ employeeId })
    });
    setMessage("Item is ready for storage.");
    await load();
  }

  async function assignLocation(product: JsonRecord) {
    const id = stringValue(product.id);
    await request(`/operations/product-control/products/${id}/location-hint`, {
      method: "POST",
      body: JSON.stringify({ employeeId })
    });
    setMessage("Random location assigned.");
    await load();
  }

  async function confirmPlaced(product: JsonRecord) {
    const id = stringValue(product.id);
    await request(`/operations/product-control/products/${id}/confirm-placed`, {
      method: "POST",
      body: JSON.stringify({ employeeId })
    });
    setMessage("Item placed in warehouse.");
    await load();
  }

  async function publishProduct(product: JsonRecord) {
    const id = stringValue(product.id);
    await request(`/operations/product-control/products/${id}/publish`, {
      method: "POST",
      body: JSON.stringify({ employeeId })
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
      body: JSON.stringify({ employeeId, reason })
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
        productIds: selectedProducts.map((product) => stringValue(product.id))
      })
    });
    setMessage(`Printed ${selectedProducts.length} label(s) on ${printerName}.`);
    setSelected({});
    await load();
  }

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <p className="workspace-label">Operations</p>
          <h1>Product Control</h1>
        </div>
        <nav className="header-actions">
          <a className="secondary-action nav-link" href="/">Workspace</a>
          <span className="operator-chip">Random stock-in</span>
        </nav>
      </header>

      <section className="metric-grid compact-metrics" aria-label="Product control summary">
        <Metric title="Need price" value={summary?.readyForPrice ?? 0} />
        <Metric title="Ready storage" value={summary?.readyForStorage ?? 0} />
        <Metric title="Need placing" value={summary?.pendingStockIn ?? 0} />
        <Metric title="Ready publish" value={summary?.readyToPublish ?? 0} />
        <Metric title="Published" value={summary?.published ?? 0} strong />
      </section>

      <section className="control-toolbar">
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {statusFilters.map((value) => (
              <option key={value || "all"} value={value}>{value ? optionLabel(value) : "All active"}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Label size</span>
          <select value={labelSize} onChange={(event) => setLabelSize(normalizeLabelSize(event.target.value))}>
            <option value="60x40">60x40</option>
            <option value="40x30">40x30</option>
          </select>
        </label>
        <button
          className="primary-action"
          type="button"
          disabled={Boolean(busy) || selectedProducts.length === 0}
          onClick={() => run("print", printSelectedLabels)}
        >
          {busy === "print" ? "Printing..." : `Print selected (${selectedProducts.length})`}
        </button>
        <button className="secondary-action" type="button" disabled={Boolean(busy)} onClick={() => run("load", load)}>
          Refresh
        </button>
      </section>

      {message ? <p className="success-line">{message}</p> : null}
      {error ? <p className="employee-error">{error}</p> : null}

      <section className="control-list">
        {products.map((product) => {
          const id = stringValue(product.id);
          const location = productControlLocationCode(product);
          const item = productControlInventoryItem(product);
          const photo = productControlImageUrl(product, API_PROXY_URL);
          const isAvailable = stringValue(item?.status) === "AVAILABLE";
          return (
            <article className="control-card" key={id}>
              <label className="select-row">
                <input
                  type="checkbox"
                  checked={Boolean(selected[id])}
                  disabled={!canPrintProductLabel(product)}
                  onChange={(event) => setSelected((current) => ({ ...current, [id]: event.target.checked }))}
                />
                <span>{stringValue(product.barcode) || "No barcode"}</span>
              </label>

              <div className="control-image">
                {photo ? <img src={photo} alt="Product" /> : <span>No photo</span>}
              </div>

              <div className="control-copy">
                <strong>{stringValue(product.title) || "Untitled item"}</strong>
                <span>{[product.category, product.subcategory, product.color, product.finalSizeLabel].map(stringValue).filter(Boolean).join(" / ")}</span>
                <small>Status: {optionLabel(stringValue(product.status))}</small>
              </div>

              <label className="field compact-field">
                <span>Price KSh</span>
                <input
                  inputMode="numeric"
                  value={prices[id] ?? ""}
                  onChange={(event) => setPrices((current) => ({ ...current, [id]: event.target.value }))}
                />
              </label>

              <div className="location-reminder">
                <span>{isAvailable ? "Placed at" : location ? "Put at" : "No location yet"}</span>
                <strong>{location || "-"}</strong>
              </div>

              <div className="control-actions">
                <button className="secondary-action" disabled={Boolean(busy)} onClick={() => run(`price-${id}`, () => savePrice(product))}>
                  Save price
                </button>
                <button className="secondary-action" disabled={Boolean(busy)} onClick={() => run(`ready-${id}`, () => prepareStorage(product))}>
                  Ready storage
                </button>
                <button className="secondary-action" disabled={Boolean(busy) || !canAssignProductLocation(product)} onClick={() => run(`loc-${id}`, () => assignLocation(product))}>
                  Random place
                </button>
                <button className="primary-action" disabled={Boolean(busy) || !canConfirmProductPlaced(product)} onClick={() => run(`placed-${id}`, () => confirmPlaced(product))}>
                  Confirm placed
                </button>
                <button className="primary-action" disabled={Boolean(busy) || !canPublishProduct(product)} onClick={() => run(`publish-${id}`, () => publishProduct(product))}>
                  Publish
                </button>
                <button className="secondary-action" disabled={Boolean(busy) || !canUnpublishProduct(product)} onClick={() => run(`unpublish-${id}`, () => unpublishProduct(product))}>
                  Unpublish
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}

function Metric(props: { title: string; value: number; strong?: boolean }) {
  return (
    <article className={props.strong ? "metric strong" : "metric"}>
      <span>{props.title}</span>
      <strong>{props.value}</strong>
    </article>
  );
}

function optionLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
