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
