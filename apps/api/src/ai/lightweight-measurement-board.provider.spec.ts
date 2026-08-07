import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { LightweightMeasurementBoardProvider } from "./lightweight-measurement-board.provider";

const originalUrl = process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL;
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL;
  else process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL = originalUrl;
  globalThis.fetch = originalFetch;
});

test("returns null without blocking recognition when the detector is unavailable", async () => {
  delete process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL;

  const result = await new LightweightMeasurementBoardProvider().detect({
    body: Buffer.from("image"),
    contentType: "image/jpeg",
    filename: "front.jpg"
  });

  assert.equal(result, null);
});

test("returns deterministic complete-board corners from the lightweight processor", async () => {
  process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL = "https://processor.example.test/";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://processor.example.test/detect-measurement-board");
    assert.equal(init?.method, "POST");
    return new Response(JSON.stringify({
      corners: {
        topLeft: { x: 18, y: 2 },
        topRight: { x: 82, y: 2 },
        bottomRight: { x: 93, y: 98 },
        bottomLeft: { x: 7, y: 98 }
      },
      confidence: 0.93
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await new LightweightMeasurementBoardProvider().detect({
    body: Buffer.from("image"),
    contentType: "image/jpeg",
    filename: "front.jpg"
  });

  assert.equal(result?.confidence, 0.93);
  assert.deepEqual(result?.corners.topRight, { x: 82, y: 2 });
});
