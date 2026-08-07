import assert from "node:assert/strict";
import test from "node:test";
import { RembgBirefnetBackgroundRemovalProvider } from "./rembg-birefnet-background-removal.provider";

test("rembg BiRefNet provider requires a service URL", async () => {
  const previous = process.env.REMBG_BIREFNET_SERVICE_URL;
  delete process.env.REMBG_BIREFNET_SERVICE_URL;

  try {
    const provider = new RembgBirefnetBackgroundRemovalProvider();
    assert.equal(provider.isConfigured(), false);
    await assert.rejects(
      provider.removeBackground({
        body: Buffer.from("not-an-image"),
        contentType: "image/jpeg",
        filename: "test.jpg"
      }),
      /REMBG_BIREFNET_SERVICE_URL is not configured/
    );
  } finally {
    if (previous === undefined) delete process.env.REMBG_BIREFNET_SERVICE_URL;
    else process.env.REMBG_BIREFNET_SERVICE_URL = previous;
  }
});

test("rembg BiRefNet provider reads final cutout quality metadata", async () => {
  const previousUrl = process.env.REMBG_BIREFNET_SERVICE_URL;
  const previousFetch = globalThis.fetch;
  process.env.REMBG_BIREFNET_SERVICE_URL = "https://processor.test";
  globalThis.fetch = (async () => new Response(Buffer.from("png"), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "X-Processor-Version": "rembg-birefnet-v2",
      "X-Quality-Score": "0.47",
      "X-Quality-Issues": "SUBJECT_TOUCHES_EDGE,SUBJECT_TOO_LARGE"
    }
  })) as typeof fetch;

  try {
    const result = await new RembgBirefnetBackgroundRemovalProvider().removeBackground({
      body: Buffer.from("image"),
      contentType: "image/jpeg",
      filename: "front.jpg"
    });
    assert.equal(result.qualityScore, 0.47);
    assert.deepEqual(result.qualityIssues, ["SUBJECT_TOUCHES_EDGE", "SUBJECT_TOO_LARGE"]);
    assert.equal(result.processorVersion, "rembg-birefnet-v2");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.REMBG_BIREFNET_SERVICE_URL;
    else process.env.REMBG_BIREFNET_SERVICE_URL = previousUrl;
  }
});

test("rembg BiRefNet provider retries temporary Cloud Run capacity errors", async () => {
  const previousUrl = process.env.REMBG_BIREFNET_SERVICE_URL;
  const previousDelay = process.env.REMBG_BIREFNET_RETRY_BASE_DELAY_MS;
  const previousFetch = globalThis.fetch;
  process.env.REMBG_BIREFNET_SERVICE_URL = "https://processor.test";
  process.env.REMBG_BIREFNET_RETRY_BASE_DELAY_MS = "0";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls < 3) return new Response("Rate exceeded.", { status: 429 });
    return new Response(Buffer.from("png"), { status: 200, headers: { "Content-Type": "image/png" } });
  }) as typeof fetch;

  try {
    const result = await new RembgBirefnetBackgroundRemovalProvider().removeBackground({
      body: Buffer.from("image"),
      contentType: "image/jpeg",
      filename: "front.jpg"
    });
    assert.equal(calls, 3);
    assert.equal(result.provider, "rembg-birefnet");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.REMBG_BIREFNET_SERVICE_URL;
    else process.env.REMBG_BIREFNET_SERVICE_URL = previousUrl;
    if (previousDelay === undefined) delete process.env.REMBG_BIREFNET_RETRY_BASE_DELAY_MS;
    else process.env.REMBG_BIREFNET_RETRY_BASE_DELAY_MS = previousDelay;
  }
});

test("rembg BiRefNet provider serializes concurrent requests within one API instance", async () => {
  const previousUrl = process.env.REMBG_BIREFNET_SERVICE_URL;
  const previousFetch = globalThis.fetch;
  process.env.REMBG_BIREFNET_SERVICE_URL = "https://processor.test";
  let active = 0;
  let maximumActive = 0;
  globalThis.fetch = (async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return new Response(Buffer.from("png"), { status: 200, headers: { "Content-Type": "image/png" } });
  }) as typeof fetch;

  try {
    const provider = new RembgBirefnetBackgroundRemovalProvider();
    await Promise.all(["one.jpg", "two.jpg", "three.jpg"].map((filename) => provider.removeBackground({
      body: Buffer.from(filename),
      contentType: "image/jpeg",
      filename
    })));
    assert.equal(maximumActive, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.REMBG_BIREFNET_SERVICE_URL;
    else process.env.REMBG_BIREFNET_SERVICE_URL = previousUrl;
  }
});

test("rembg BiRefNet provider does not retry rejected images", async () => {
  const previousUrl = process.env.REMBG_BIREFNET_SERVICE_URL;
  const previousFetch = globalThis.fetch;
  process.env.REMBG_BIREFNET_SERVICE_URL = "https://processor.test";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("invalid image", { status: 422 });
  }) as typeof fetch;

  try {
    await assert.rejects(
      new RembgBirefnetBackgroundRemovalProvider().removeBackground({
        body: Buffer.from("invalid"),
        contentType: "image/jpeg",
        filename: "invalid.jpg"
      }),
      /failed after 1 attempt: 422/
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.REMBG_BIREFNET_SERVICE_URL;
    else process.env.REMBG_BIREFNET_SERVICE_URL = previousUrl;
  }
});
