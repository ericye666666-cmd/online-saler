import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BackgroundRemovalProviderError,
  RemoveBgProvider
} from "./remove-bg.provider";

describe("RemoveBgProvider", () => {
  it("fails clearly when the API key is not configured", async () => {
    const previous = process.env.REMOVE_BG_API_KEY;
    delete process.env.REMOVE_BG_API_KEY;

    try {
      const provider = new RemoveBgProvider();
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
      if (previous === undefined) delete process.env.REMOVE_BG_API_KEY;
      else process.env.REMOVE_BG_API_KEY = previous;
    }
  });
});
