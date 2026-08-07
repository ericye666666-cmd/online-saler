import assert from "node:assert/strict";
import { test } from "node:test";
import { BackgroundRemovalProviderError } from "./background-removal.provider";
import { LightweightBackgroundRemovalProvider } from "./lightweight-background-removal.provider";

test("lightweight provider fails clearly when service URL is absent", async () => {
  const previous = process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL;
  delete process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL;

  try {
    const provider = new LightweightBackgroundRemovalProvider();
    assert.equal(provider.isConfigured(), false);
    await assert.rejects(
      () =>
        provider.removeBackground({
          body: Buffer.from("not-an-image"),
          contentType: "image/png",
          filename: "test.png"
        }),
      (error) =>
        error instanceof BackgroundRemovalProviderError &&
        error.code === "PROCESSOR_NOT_CONFIGURED"
    );
  } finally {
    if (previous === undefined) delete process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL;
    else process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL = previous;
  }
});

test("guided cutout sends normalized polygon to the lightweight service", async () => {
  const previousUrl = process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL;
  const previousFetch = globalThis.fetch;
  process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL = "https://cutout.example.test";
  let requestUrl = "";
  let polygonHeader = "";
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    polygonHeader = new Headers(init?.headers).get("X-Foreground-Polygon") ?? "";
    return new Response(Buffer.from("png"), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "X-Processor": "manual-guided-grabcut",
        "X-Processor-Version": "guided-grabcut-v1",
        "X-Quality-Score": "0.91"
      }
    });
  }) as typeof fetch;

  try {
    const provider = new LightweightBackgroundRemovalProvider();
    const points = [
      { x: 0.2, y: 0.2 }, { x: 0.5, y: 0.1 }, { x: 0.8, y: 0.2 },
      { x: 0.8, y: 0.8 }, { x: 0.5, y: 0.9 }, { x: 0.2, y: 0.8 }
    ];
    const result = await provider.removeBackgroundGuided(
      { body: Buffer.from("image"), contentType: "image/jpeg", filename: "front.jpg" },
      points
    );
    assert.equal(requestUrl, "https://cutout.example.test/remove-background-guided");
    assert.deepEqual(JSON.parse(polygonHeader), points);
    assert.equal(result.provider, "manual-guided-grabcut");
    assert.equal(result.qualityScore, 0.91);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL;
    else process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL = previousUrl;
  }
});

test("lightweight provider retries temporary Cloud Run capacity errors", async () => {
  const previousUrl = process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL;
  const previousDelay = process.env.LIGHTWEIGHT_CUTOUT_RETRY_BASE_DELAY_MS;
  const previousFetch = globalThis.fetch;
  process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL = "https://cutout.example.test";
  process.env.LIGHTWEIGHT_CUTOUT_RETRY_BASE_DELAY_MS = "0";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls < 3) return new Response("Rate exceeded.", { status: 429 });
    return new Response(Buffer.from("png"), {
      status: 200,
      headers: { "Content-Type": "image/png", "X-Processor": "lightweight-opencv" }
    });
  }) as typeof fetch;

  try {
    const result = await new LightweightBackgroundRemovalProvider().removeBackground({
      body: Buffer.from("image"),
      contentType: "image/jpeg",
      filename: "front.jpg"
    });
    assert.equal(calls, 3);
    assert.equal(result.provider, "lightweight-opencv");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL;
    else process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL = previousUrl;
    if (previousDelay === undefined) delete process.env.LIGHTWEIGHT_CUTOUT_RETRY_BASE_DELAY_MS;
    else process.env.LIGHTWEIGHT_CUTOUT_RETRY_BASE_DELAY_MS = previousDelay;
  }
});

test("lightweight provider does not retry rejected images", async () => {
  const previousUrl = process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL;
  const previousFetch = globalThis.fetch;
  process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL = "https://cutout.example.test";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("invalid image", { status: 422 });
  }) as typeof fetch;

  try {
    await assert.rejects(
      new LightweightBackgroundRemovalProvider().removeBackground({
        body: Buffer.from("invalid"),
        contentType: "image/jpeg",
        filename: "invalid.jpg"
      }),
      /failed after 1 attempt: 422/
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL;
    else process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL = previousUrl;
  }
});
