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
