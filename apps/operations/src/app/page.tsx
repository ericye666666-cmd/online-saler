"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AI_COLORS, AI_PATTERNS, AI_PRODUCT_CATEGORIES, AI_SLEEVE_TYPES } from "@online-saler/shared-types";
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

const categories = AI_PRODUCT_CATEGORIES;
const colors = AI_COLORS;
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

  const readiness = useMemo(() => workspaceReadiness({ product, image, job, form }), [product, image, job, form]);
  const currentImageUrl = previewUrl || imageUrl(image);
  const currentStep = completedProduct ? sessionDone : Math.min(sessionDone + 1, SESSION_TARGET);

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
    setForm(formFromProductAndAi(null, null));
    setView("dashboard");
    void loadSummary();
  }

  function updateForm(key: keyof WorkspaceForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  if (!loaded) {
    return (
      <main className="workspace-shell">
        <header className="workspace-header">
          <div>
            <p className="workspace-label">Operations</p>
            <h1>Today's Work</h1>
          </div>
          <div className="operator-chip">Opening workspace</div>
        </header>
        <section className="empty-state">Loading today's work...</section>
      </main>
    );
  }

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <p className="workspace-label">Operations</p>
          <h1>Today's Work</h1>
        </div>
        <div className="operator-chip">Test operator ready</div>
      </header>

      {view === "dashboard" ? (
        <section className="dashboard">
          <div className="metric-grid" aria-label="Today's work queue">
            <Metric title="Waiting for Photo" value={summary?.waitingPhoto ?? 0} />
            <Metric title="Waiting for AI" value={summary?.waitingAi ?? 0} />
            <Metric title="Waiting for Review" value={summary?.waitingCalibration ?? 0} />
            <Metric title="Completed Today" value={summary?.completedToday ?? 0} strong />
          </div>

          <section className="start-panel">
            <div>
              <h2>Start digitizing clothes</h2>
              <p>One item at a time. Add a photo, check the AI fields, enter measurements, then save and continue.</p>
            </div>
            <button className="primary-action" disabled={Boolean(busy)} onClick={() => run("start", startWork)}>
              {busy === "start" ? "Opening..." : summary?.activeProductId ? "Continue Work" : "Start Working"}
            </button>
          </section>

          {lastBarcode ? <p className="success-line">Last barcode: {lastBarcode}</p> : null}
          {error ? <p className="employee-error">{error}</p> : null}
        </section>
      ) : (
        <section className="workbench">
          <div className="workbench-topline">
            <div>
              <p className="workspace-label">Batch progress</p>
              <h2>{currentStep} / {SESSION_TARGET}</h2>
            </div>
            <div className="topline-actions">
              <span className={`readiness ${readiness.canSaveAndNext ? "ready" : ""}`}>{readiness.label}</span>
              <button className="secondary-action" type="button" onClick={resetSession} disabled={Boolean(busy)}>Reset</button>
            </div>
          </div>

          <div className="workspace-grid">
            <section className="photo-panel">
              <div className="photo-frame">
                {currentImageUrl ? (
                  <img src={currentImageUrl} alt="Clothing item" />
                ) : (
                  <div className="photo-placeholder">
                    <strong>Add front photo</strong>
                    <span>Use camera or choose a clear image.</span>
                  </div>
                )}
              </div>
              <label className="file-button">
                {busy === "photo" ? "Uploading and reading..." : currentImageUrl ? "Replace photo" : "Add photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  disabled={Boolean(busy) || Boolean(completedProduct)}
                  onChange={(event) => void choosePhoto(event.target.files?.[0] ?? null)}
                />
              </label>
            </section>

            <section className="editor-panel">
              <div className="section-heading">
                <h3>Photo reading</h3>
                <span>{readiness.hasAi ? "Ready to check" : readiness.hasPhoto ? "Reading photo" : "Waiting for photo"}</span>
              </div>
              <div className="ai-strip">
                {["category", "primaryColor", "brandLabel", "sizeLabel"].map((field) => {
                  const value = aiField(job, field);
                  return (
                    <div key={field}>
                      <span>{fieldLabel(field)}</span>
                      <strong>{value.value}</strong>
                      {value.confidence ? <small>{value.confidence}</small> : null}
                    </div>
                  );
                })}
              </div>

              <div className="form-sections">
                <Field label="Title">
                  <input value={form.title} onChange={(event) => updateForm("title", event.target.value)} />
                </Field>
                <div className="two-column">
                  <Field label="Category">
                    <select value={form.category} onChange={(event) => updateForm("category", event.target.value)}>
                      {categories.map((value) => <option key={value}>{value}</option>)}
                    </select>
                  </Field>
                  <Field label="Color">
                    <select value={form.color} onChange={(event) => updateForm("color", event.target.value)}>
                      {colors.map((value) => <option key={value}>{value}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="two-column">
                  <Field label="Brand">
                    <input value={form.brand} onChange={(event) => updateForm("brand", event.target.value)} />
                  </Field>
                  <Field label="Size">
                    <input value={form.sizeLabel} onChange={(event) => updateForm("sizeLabel", event.target.value)} />
                  </Field>
                </div>
                <div className="two-column">
                  <Field label="Pattern">
                    <select value={form.pattern} onChange={(event) => updateForm("pattern", event.target.value)}>
                      {patterns.map((value) => <option key={value}>{value}</option>)}
                    </select>
                  </Field>
                  <Field label="Sleeve">
                    <select value={form.sleeveType} onChange={(event) => updateForm("sleeveType", event.target.value)}>
                      {sleeves.map((value) => <option key={value}>{value}</option>)}
                    </select>
                  </Field>
                </div>

                <div className="measure-band">
                  <Field label="Length cm">
                    <input inputMode="decimal" value={form.lengthCm} onChange={(event) => updateForm("lengthCm", event.target.value)} />
                  </Field>
                  <Field label="Chest width cm">
                    <input inputMode="decimal" value={form.chestWidthCm} onChange={(event) => updateForm("chestWidthCm", event.target.value)} />
                  </Field>
                </div>

                <Field label="Condition">
                  <select value={form.conditionGrade} onChange={(event) => updateForm("conditionGrade", event.target.value)}>
                    {conditions.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </Field>

                <Field label="Defects">
                  <textarea
                    value={form.defects}
                    onChange={(event) => updateForm("defects", event.target.value)}
                    placeholder="Leave blank when none"
                    rows={3}
                  />
                </Field>
              </div>

              {error ? <p className="employee-error">{error}</p> : null}
              {completedProduct ? (
                <section className="print-panel">
                  <div>
                    <p className="workspace-label">Barcode label</p>
                    <h4>{stringValue(completedProduct.barcode)}</h4>
                    <span>Printer: Deli 720 local agent</span>
                  </div>
                  <div className="print-controls">
                    <Field label="Label size">
                      <select
                        value={labelSize}
                        onChange={(event) => setLabelSize(normalizeLabelSize(event.target.value))}
                      >
                        <option value="60x40">60x40</option>
                        <option value="40x30">40x30</option>
                      </select>
                    </Field>
                    <button
                      className="primary-action"
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => run("print", printLabel)}
                    >
                      {busy === "print" ? "Printing..." : "Print label"}
                    </button>
                    <button
                      className="secondary-action"
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => run("next", startNextItem)}
                    >
                      Start next item
                    </button>
                  </div>
                  {printMessage ? <p className="success-line">{printMessage}</p> : null}
                </section>
              ) : lastBarcode ? (
                <p className="success-line">Last barcode: {lastBarcode}</p>
              ) : null}

              {!completedProduct ? (
                <button
                  className="save-next"
                  disabled={!readiness.canSaveAndNext || Boolean(busy)}
                  onClick={() => run("save", saveAndNext)}
                >
                  {busy === "save" ? "Saving..." : "Save & Next"}
                </button>
              ) : null}
            </section>
          </div>
        </section>
      )}
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

function Field(props: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    category: "Category",
    primaryColor: "Color",
    brandLabel: "Brand",
    sizeLabel: "Size"
  };
  return labels[field] ?? field;
}
