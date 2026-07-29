"use client";

import { useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type JsonRecord = Record<string, unknown>;

async function request(path: string, options?: RequestInit): Promise<JsonRecord> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) }
  });
  const body = (await response.json()) as JsonRecord;
  if (!response.ok) throw new Error(String(body.message ?? `Request failed: ${response.status}`));
  return body;
}

export default function OperationsHome() {
  const [employeeId, setEmployeeId] = useState("");
  const [productCode, setProductCode] = useState(`TEST-${Date.now()}`);
  const [imageUrl, setImageUrl] = useState("https://example.com/front.jpg");
  const [product, setProduct] = useState<JsonRecord | null>(null);
  const [image, setImage] = useState<JsonRecord | null>(null);
  const [job, setJob] = useState<JsonRecord | null>(null);
  const [barcode, setBarcode] = useState<JsonRecord | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const productId = String(product?.id ?? "");
  const extractionId = String(job?.extractionId ?? "");
  const imageId = String(image?.id ?? "");
  const result = useMemo(() => JSON.stringify({ product, image, job, barcode }, null, 2), [product, image, job, barcode]);

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

  return (
    <main className="shell">
      <header className="header">
        <div>
          <h1 className="title">AI Digitization Test</h1>
          <p className="subtitle">Create shell → register photo → mock AI → calibrate → generate formal barcode.</p>
        </div>
        <div className="status">MVP test flow</div>
      </header>

      <section className="panel form-grid">
        <label>Employee ID<input value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} placeholder="Existing employee UUID" /></label>
        <label>Product code<input value={productCode} onChange={(event) => setProductCode(event.target.value)} /></label>
        <label className="wide">Front image URL<input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} /></label>
      </section>

      <section className="steps">
        <article className="step">
          <span>1</span><h2>Create product shell</h2>
          <button disabled={Boolean(busy)} onClick={() => run("create", async () => setProduct(await request("/products", { method: "POST", body: JSON.stringify({ productCode, employeeId: employeeId || undefined }) })))}>{busy === "create" ? "Creating…" : "Create shell"}</button>
        </article>
        <article className="step">
          <span>2</span><h2>Register front photo</h2>
          <button disabled={!productId || Boolean(busy)} onClick={() => run("image", async () => setImage(await request(`/products/${productId}/images`, { method: "POST", body: JSON.stringify({ type: "FRONT", originalUrl: imageUrl, employeeId: employeeId || undefined }) })))}>{busy === "image" ? "Saving…" : "Save image"}</button>
        </article>
        <article className="step">
          <span>3</span><h2>Run mock AI</h2>
          <button disabled={!productId || !imageId || Boolean(busy)} onClick={() => run("ai", async () => setJob(await request("/ai-jobs", { method: "POST", body: JSON.stringify({ productId, imageIds: [imageId], promptVersion: "product-v1" }) })))}>{busy === "ai" ? "Recognizing…" : "Run mock AI"}</button>
        </article>
        <article className="step">
          <span>4</span><h2>Confirm calibration</h2>
          <button disabled={!productId || !extractionId || !employeeId || Boolean(busy)} onClick={() => run("calibrate", async () => setProduct(await request(`/products/${productId}/calibrate`, { method: "POST", body: JSON.stringify({ employeeId, extractionId, title: "Black Short Sleeve Dress", category: "DRESS", color: "BLACK", pattern: "SOLID", sleeveType: "SHORT", brand: "Mock Brand", sizeLabel: "M", conditionGrade: "GOOD", measurements: [{ type: "LENGTH", valueCm: 92 }, { type: "CHEST_WIDTH", valueCm: 48 }], defects: [] }) })))}>{busy === "calibrate" ? "Saving…" : "Confirm calibration"}</button>
        </article>
        <article className="step">
          <span>5</span><h2>Generate formal barcode</h2>
          <button disabled={!productId || !employeeId || Boolean(busy)} onClick={() => run("barcode", async () => setBarcode(await request(`/products/${productId}/barcode`, { method: "POST", body: JSON.stringify({ employeeId }) })))}>{busy === "barcode" ? "Generating…" : "Generate barcode"}</button>
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
