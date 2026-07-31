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
