import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProductImageStorageService } from "./product-image-storage.service";
import { BackgroundRemovalProviderError } from "./background-removal.provider";
import { LightweightBackgroundRemovalProvider } from "./lightweight-background-removal.provider";

describe("LightweightBackgroundRemovalProvider", () => {
  it("fails clearly when the service URL is not configured", async () => {
    const previous = process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL;
    delete process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL;

    try {
      const storage = {} as ProductImageStorageService;
      const provider = new LightweightBackgroundRemovalProvider(storage);
      assert.equal(provider.isConfigured(), false);
      await assert.rejects(
        () => provider.removeBackground({
          body: Buffer.from("image"),
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
});
