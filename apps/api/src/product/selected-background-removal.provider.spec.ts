import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type {
  BackgroundRemovalInput,
  BackgroundRemovalProvider,
  BackgroundRemovalResult
} from "./background-removal.provider";
import { BackgroundRemovalProviderError } from "./background-removal.provider";
import { SelectedBackgroundRemovalProvider } from "./selected-background-removal.provider";

class StubBackgroundRemovalProvider implements BackgroundRemovalProvider {
  calls = 0;

  constructor(
    private readonly configured: boolean,
    private readonly result: BackgroundRemovalResult,
    private readonly error?: Error
  ) {}

  isConfigured(): boolean {
    return this.configured;
  }

  async removeBackground(_input: BackgroundRemovalInput): Promise<BackgroundRemovalResult> {
    this.calls += 1;
    if (this.error) throw this.error;
    return this.result;
  }
}

const input: BackgroundRemovalInput = {
  body: Buffer.from("image"),
  contentType: "image/jpeg",
  filename: "front.jpg"
};

const lightweightResult: BackgroundRemovalResult = {
  body: Buffer.from("lightweight"),
  contentType: "image/png",
  provider: "lightweight-opencv",
  processorVersion: "lightweight-v1",
  qualityScore: 0.92,
  qualityIssues: []
};

const rembgResult: BackgroundRemovalResult = {
  body: Buffer.from("rembg"),
  contentType: "image/png",
  provider: "rembg-birefnet",
  processorVersion: "rembg-v1",
  qualityScore: 0.88,
  qualityIssues: []
};

const previousEnvironment = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of [
    "BACKGROUND_REMOVAL_PROVIDER",
    "BACKGROUND_REMOVAL_MIN_QUALITY_SCORE",
    "BACKGROUND_REMOVAL_BLOCKING_QUALITY_ISSUES"
  ]) {
    previousEnvironment.set(key, process.env[key]);
  }
  process.env.BACKGROUND_REMOVAL_PROVIDER = "auto";
  process.env.BACKGROUND_REMOVAL_MIN_QUALITY_SCORE = "0.8";
  delete process.env.BACKGROUND_REMOVAL_BLOCKING_QUALITY_ISSUES;
});

afterEach(() => {
  for (const [key, value] of previousEnvironment.entries()) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  previousEnvironment.clear();
});

describe("SelectedBackgroundRemovalProvider", () => {
  it("uses the lightweight provider when auto quality passes", async () => {
    const lightweight = new StubBackgroundRemovalProvider(true, lightweightResult);
    const rembg = new StubBackgroundRemovalProvider(true, rembgResult);
    const provider = new SelectedBackgroundRemovalProvider(lightweight as any, rembg as any, rembg as any);

    const result = await provider.removeBackground(input);

    assert.equal(result.provider, "lightweight-opencv");
    assert.equal(result.fallbackFrom, undefined);
    assert.equal(lightweight.calls, 1);
    assert.equal(rembg.calls, 0);
  });

  it("falls back to rembg BiRefNet when lightweight quality is below threshold", async () => {
    const lightweight = new StubBackgroundRemovalProvider(true, {
      ...lightweightResult,
      qualityScore: 0.41
    });
    const rembg = new StubBackgroundRemovalProvider(true, rembgResult);
    const provider = new SelectedBackgroundRemovalProvider(lightweight as any, rembg as any, rembg as any);

    const result = await provider.removeBackground(input);

    assert.equal(result.provider, "rembg-birefnet");
    assert.equal(result.fallbackFrom, "lightweight-opencv");
    assert.equal(result.fallbackReason, "QUALITY_SCORE_BELOW_THRESHOLD:0.41<0.8");
    assert.equal(result.qualityScore, 0.88);
    assert.deepEqual(result.qualityIssues, []);
    assert.equal(lightweight.calls, 1);
    assert.equal(rembg.calls, 1);
  });

  it("falls back to rembg BiRefNet when lightweight reports a blocking issue", async () => {
    const lightweight = new StubBackgroundRemovalProvider(true, {
      ...lightweightResult,
      qualityIssues: ["SUBJECT_TOUCHES_EDGE"]
    });
    const rembg = new StubBackgroundRemovalProvider(true, rembgResult);
    const provider = new SelectedBackgroundRemovalProvider(lightweight as any, rembg as any, rembg as any);

    const result = await provider.removeBackground(input);

    assert.equal(result.provider, "rembg-birefnet");
    assert.equal(result.fallbackFrom, "lightweight-opencv");
    assert.equal(result.fallbackReason, "QUALITY_ISSUE:SUBJECT_TOUCHES_EDGE");
  });

  it("falls back to rembg BiRefNet when lightweight processing fails", async () => {
    const lightweight = new StubBackgroundRemovalProvider(
      true,
      lightweightResult,
      new BackgroundRemovalProviderError("UNKNOWN", "lightweight failed")
    );
    const rembg = new StubBackgroundRemovalProvider(true, rembgResult);
    const provider = new SelectedBackgroundRemovalProvider(lightweight as any, rembg as any, rembg as any);

    const result = await provider.removeBackground(input);

    assert.equal(result.provider, "rembg-birefnet");
    assert.equal(result.fallbackFrom, "lightweight-opencv");
    assert.equal(result.fallbackReason, "LIGHTWEIGHT_FAILED:lightweight failed");
  });

  it("still supports explicitly selecting rembg BiRefNet", async () => {
    process.env.BACKGROUND_REMOVAL_PROVIDER = "rembg_birefnet";
    const lightweight = new StubBackgroundRemovalProvider(true, lightweightResult);
    const rembg = new StubBackgroundRemovalProvider(true, rembgResult);
    const provider = new SelectedBackgroundRemovalProvider(lightweight as any, rembg as any, rembg as any);

    const result = await provider.removeBackground(input);

    assert.equal(result.provider, "rembg-birefnet");
    assert.equal(lightweight.calls, 0);
    assert.equal(rembg.calls, 1);
  });

  it("allows a calibration retry to force the lightweight provider", async () => {
    const lightweight = new StubBackgroundRemovalProvider(true, lightweightResult);
    const rembg = new StubBackgroundRemovalProvider(true, rembgResult);
    const provider = new SelectedBackgroundRemovalProvider(lightweight as any, rembg as any, rembg as any);

    const result = await provider.removeBackground(input, "lightweight");

    assert.equal(result.provider, "lightweight-opencv");
    assert.equal(lightweight.calls, 1);
    assert.equal(rembg.calls, 0);
  });

  it("allows a calibration retry to force rembg BiRefNet", async () => {
    const lightweight = new StubBackgroundRemovalProvider(true, lightweightResult);
    const rembg = new StubBackgroundRemovalProvider(true, rembgResult);
    const provider = new SelectedBackgroundRemovalProvider(lightweight as any, rembg as any, rembg as any);

    const result = await provider.removeBackground(input, "rembg_birefnet");

    assert.equal(result.provider, "rembg-birefnet");
    assert.equal(lightweight.calls, 0);
    assert.equal(rembg.calls, 1);
  });
});
