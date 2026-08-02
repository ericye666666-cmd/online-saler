import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { LightweightGarmentBalanceProvider } from "./lightweight-garment-balance.provider";

const originalFetch = globalThis.fetch;
const originalUrl = process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL;
  else process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL = originalUrl;
});

describe("LightweightGarmentBalanceProvider", () => {
  it("calls the non-generative balance endpoint and returns a 1200px storefront image", async () => {
    process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL = "https://lightweight.example";
    let requestedUrl = "";
    let requestedType = "";
    globalThis.fetch = (async (input, init) => {
      requestedUrl = String(input);
      requestedType = String((init?.headers as Record<string, string>)["Content-Type"]);
      return new Response(Buffer.from("balanced-jpeg"), {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "X-Processor": "lightweight-opencv",
          "X-Processor-Version": "opencv-balance-v2"
        }
      });
    }) as typeof fetch;

    const result = await new LightweightGarmentBalanceProvider().balance({
      body: Buffer.from("transparent-png"),
      contentType: "image/png",
      filename: "cutout.png"
    });

    assert.equal(requestedUrl, "https://lightweight.example/balance-garment");
    assert.equal(requestedType, "image/png");
    assert.equal(result.provider, "lightweight-opencv");
    assert.equal(result.processorVersion, "opencv-balance-v2");
    assert.equal(result.widthPx, 1200);
    assert.equal(result.heightPx, 1200);
  });
});
