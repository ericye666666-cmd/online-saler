"use client";

import { useMemo, useState } from "react";
import {
  getDigitizationFlowState,
  type JsonRecord,
  type StepStatus
} from "../../ai-digitization-flow";

const API_PROXY_URL = "/api-proxy";
const STAGING_TEST_EMPLOYEE_ID = "00000000-0000-4000-8000-000000000001";

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
  if (!response.ok) throw new Error(String(body.message ?? `Request failed: ${response.status}`));
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
  if (!response.ok) throw new Error(String(body.message ?? `Upload failed: ${response.status}`));
  return body;
}

function makeProductCode(): string {
  return `TEST-${Date.now()}`;
}

function statusClass(status: StepStatus): string {
  return status.toLowerCase();
}

function buttonLabel(status: StepStatus, idle: string, busy: string, isBusy: boolean): string {
  if (isBusy) return busy;
  if (status === "Done") return "Done";
  return idle;
}

export default function OperationsHome() {
  const [employeeId, setEmployeeId] = useState(STAGING_TEST_EMPLOYEE_ID);
  const [productCode, setProductCode] = useState(makeProductCode);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [product, setProduct] = useState<JsonRecord | null>(null);
  const [image, setImage] = useState<JsonRecord | null>(null);
  const [job, setJob] = useState<JsonRecord | null>(null);
  const [barcode, setBarcode] = useState<JsonRecord | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const flow = useMemo(
    () => getDigitizationFlowState({ employeeId, product, image, job, barcode }),
    [employeeId, product, image, job, barcode]
  );
  const result = useMemo(() => JSON.stringify({ product, image, job, barcode }, null, 2), [product, image, job, barcode]);
  const isBusy = Boolean(busy);

  function chooseFile(file: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : "");
  }

  function resetTest() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setEmployeeId(STAGING_TEST_EMPLOYEE_ID);
    setProductCode(makeProductCode());
    setSelectedFile(null);
    setPreviewUrl("");
    setProduct(null);
    setImage(null);
    setJob(null);
    setBarcode(null);
    setBusy("");
    setError("");
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error");
    } finally {
      setBusy("");
    }
  }

  async function createShell() {
    const createdProduct = await request("/products", {
      method: "POST",
      body: JSON.stringify({ productCode, employeeId: employeeId.trim() })
    });
    setProduct(createdProduct);
    setImage(null);
    setJob(null);
    setBarcode(null);
  }

  async function saveImage() {
    if (!selectedFile) throw new Error("Choose a clothing photo first");
    setImage(await uploadProductImage(flow.ids.productId, employeeId.trim(), selectedFile));
  }

  async function runMockAI() {
    setJob(await request("/ai-jobs", {
      method: "POST",
      body: JSON.stringify({
        productId: flow.ids.productId,
        imageIds: [flow.ids.imageId],
        promptVersion: "product-v1"
      })
    }));
  }

  async function confirmCalibration() {
    setProduct(await request(`/products/${flow.ids.productId}/calibrate`, {
      method: "POST",
      body: JSON.stringify({
        employeeId: employeeId.trim(),
        extractionId: flow.ids.extractionId,
        title: "Black Short Sleeve Dress",
        category: "DRESS",
        color: "BLACK",
        pattern: "SOLID",
        sleeveType: "SHORT",
        brand: "Mock Brand",
        sizeLabel: "M",
        conditionGrade: "GOOD",
        measurements: [
          { type: "LENGTH", valueCm: 92 },
          { type: "CHEST_WIDTH", valueCm: 48 }
        ],
        defects: []
      })
    }));
  }

  async function generateBarcode() {
    const barcodeProduct = await request(`/products/${flow.ids.productId}/barcode`, {
      method: "POST",
      body: JSON.stringify({ employeeId: employeeId.trim() })
    });
    setBarcode(barcodeProduct);
    setProduct(barcodeProduct);
  }

  return (
    <main className="shell">
      <header className="header">
        <div>
          <h1 className="title">AI Digitization Test</h1>
          <p className="subtitle">Create shell - upload a real photo - mock AI - calibrate - generate formal barcode.</p>
        </div>
        <div className="header-actions">
          <div className="status">Storage upload MVP</div>
          <button className="secondary-button" type="button" disabled={isBusy} onClick={resetTest}>Reset test</button>
        </div>
      </header>

      <section className="panel form-grid">
        <label>Employee ID<input value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} aria-label="Staging test employee UUID" /></label>
        <label>Product code<input value={productCode} onChange={(event) => setProductCode(event.target.value)} /></label>
        <label className="wide">Front clothing photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={flow.steps.image === "Done" || isBusy}
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
          />
        </label>
        {previewUrl ? <div className="wide image-preview"><img src={previewUrl} alt="Selected clothing preview" /></div> : null}
      </section>

      <section className="steps">
        <article className="step">
          <span>1</span><div className="step-copy"><h2>Create product shell</h2></div>
          <strong className={`step-status ${statusClass(flow.steps.create)}`}>{flow.steps.create}</strong>
          <button disabled={!flow.canCreateProduct || isBusy} onClick={() => run("create", createShell)}>{buttonLabel(flow.steps.create, "Create shell", "Creating...", busy === "create")}</button>
        </article>
        <article className="step">
          <span>2</span><div className="step-copy"><h2>Upload front photo</h2></div>
          <strong className={`step-status ${statusClass(flow.steps.image)}`}>{flow.steps.image}</strong>
          <button disabled={!flow.canSaveImage || !selectedFile || isBusy} onClick={() => run("image", saveImage)}>{buttonLabel(flow.steps.image, "Upload image", "Uploading...", busy === "image")}</button>
        </article>
        <article className="step">
          <span>3</span><div className="step-copy"><h2>Run mock AI</h2></div>
          <strong className={`step-status ${statusClass(flow.steps.ai)}`}>{flow.steps.ai}</strong>
          <button disabled={!flow.canRunMockAI || isBusy} onClick={() => run("ai", runMockAI)}>{buttonLabel(flow.steps.ai, "Run mock AI", "Recognizing...", busy === "ai")}</button>
        </article>
        <article className="step">
          <span>4</span><div className="step-copy"><h2>Confirm calibration</h2></div>
          <strong className={`step-status ${statusClass(flow.steps.calibration)}`}>{flow.steps.calibration}</strong>
          <button disabled={!flow.canConfirmCalibration || isBusy} onClick={() => run("calibrate", confirmCalibration)}>{buttonLabel(flow.steps.calibration, "Confirm calibration", "Saving...", busy === "calibrate")}</button>
        </article>
        <article className="step">
          <span>5</span><div className="step-copy"><h2>Generate formal barcode</h2></div>
          <strong className={`step-status ${statusClass(flow.steps.barcode)}`}>{flow.steps.barcode}</strong>
          <button disabled={!flow.canGenerateBarcode || isBusy} onClick={() => run("barcode", generateBarcode)}>{buttonLabel(flow.steps.barcode, "Generate barcode", "Generating...", busy === "barcode")}</button>
        </article>
      </section>

      {error ? <p className="error">{error}</p> : null}
      <section className="panel">
        <h2>Current result</h2>
        <pre>{result}</pre>
      </section>
    </main>
  );
}
