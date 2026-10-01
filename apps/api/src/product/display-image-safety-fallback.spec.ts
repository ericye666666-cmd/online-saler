import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import sharp from "sharp";
import { prisma } from "@online-saler/database";
import {
  OpenAIDisplayImageError,
  OpenAIProductDisplayImageProvider,
  isSafetyRejection
} from "./openai-product-display-image.provider";
import {
  OPENAI_SAFETY_REJECTED,
  ProductImageJobRunnerService,
  STAFF_USE_ORIGINAL,
  displayFallbackReason
} from "./product-image-job-runner.service";
import { ProductImageTransformerService } from "./product-image-transformer.service";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;
const originalModeration = process.env.OPENAI_IMAGE_EDIT_MODERATION;

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv("OPENAI_API_KEY", originalApiKey);
  restoreEnv("OPENAI_IMAGE_EDIT_MODERATION", originalModeration);
});

const SAFETY_BODY = JSON.stringify({
  error: {
    message: "Your request was rejected by the safety system. If you believe this is an error, contact us.",
    type: "image_generation_user_error",
    param: null,
    code: "moderation_blocked"
  }
});

const okImage = () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("generated").toString("base64") }] }), { status: 200 });

const photo = () => sharp({ create: { width: 600, height: 800, channels: 3, background: "#9aa3ad" } }).jpeg().toBuffer();

// A cutout as the background-removal service returns it: transparent around an opaque garment.
const transparentCutout = () =>
  sharp({ create: { width: 600, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: { create: { width: 300, height: 500, channels: 4, background: { r: 200, g: 30, b: 40, alpha: 1 } } }, left: 150, top: 150 }])
    .png()
    .toBuffer();

describe("display image request", () => {
  it("asks OpenAI for low moderation by default, and auto when configured", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.OPENAI_IMAGE_EDIT_MODERATION;
    const forms: FormData[] = [];
    globalThis.fetch = (async (_input, init) => {
      forms.push(init?.body as FormData);
      return okImage();
    }) as typeof fetch;

    const provider = new OpenAIProductDisplayImageProvider();
    await provider.generate({ body: Buffer.from("x"), contentType: "image/png", filename: "a.png" });
    assert.equal(forms[0]?.get("moderation"), "low");

    process.env.OPENAI_IMAGE_EDIT_MODERATION = "auto";
    await provider.generate({ body: Buffer.from("x"), contentType: "image/png", filename: "a.png" });
    assert.equal(forms[1]?.get("moderation"), "auto");

    process.env.OPENAI_IMAGE_EDIT_MODERATION = "nonsense";
    await provider.generate({ body: Buffer.from("x"), contentType: "image/png", filename: "a.png" });
    assert.equal(forms[2]?.get("moderation"), "low");
  });

  it("sends the request again without moderation when the model does not accept the parameter", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const forms: FormData[] = [];
    globalThis.fetch = (async (_input, init) => {
      forms.push(init?.body as FormData);
      if (forms.length === 1) {
        return new Response(JSON.stringify({ error: { message: "Unknown parameter: 'moderation'.", type: "invalid_request_error", param: "moderation", code: "unknown_parameter" } }), { status: 400 });
      }
      return okImage();
    }) as typeof fetch;

    const result = await new OpenAIProductDisplayImageProvider().generate({ body: Buffer.from("x"), contentType: "image/png", filename: "a.png" });
    assert.equal(forms.length, 2);
    assert.equal(forms[0]?.has("moderation"), true);
    assert.equal(forms[1]?.has("moderation"), false);
    assert.equal(result.body.toString(), "generated");
  });

  it("reports a safety refusal with OpenAI's code and request id", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    globalThis.fetch = (async () => new Response(SAFETY_BODY, { status: 400, headers: { "x-request-id": "req_abc123" } })) as typeof fetch;

    await assert.rejects(
      new OpenAIProductDisplayImageProvider().generate({ body: Buffer.from("x"), contentType: "image/png", filename: "a.png" }),
      (error: unknown) => {
        assert.ok(error instanceof OpenAIDisplayImageError);
        assert.equal(error.code, "PROCESSOR_REJECTED_IMAGE");
        assert.equal(error.details.httpStatus, 400);
        assert.equal(error.details.openaiCode, "moderation_blocked");
        assert.equal(error.details.requestId, "req_abc123");
        assert.equal(error.details.safetyRejected, true);
        assert.equal(error.details.permanent, true);
        return true;
      }
    );
  });

  it("treats key and model-access errors as configuration faults, not refusals of the photo", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    for (const status of [401, 403, 404, 429]) {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: "nope", code: "x" } }), { status })) as typeof fetch;
      await assert.rejects(
        new OpenAIProductDisplayImageProvider().generate({ body: Buffer.from("x"), contentType: "image/png", filename: "a.png" }),
        (error: unknown) => error instanceof OpenAIDisplayImageError && !error.details.permanent && displayFallbackReason(error) === null
      );
    }
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: "Invalid image file", code: "invalid_image" } }), { status: 400 })) as typeof fetch;
    await assert.rejects(
      new OpenAIProductDisplayImageProvider().generate({ body: Buffer.from("x"), contentType: "image/png", filename: "a.png" }),
      (error: unknown) => error instanceof OpenAIDisplayImageError && error.details.permanent && !error.details.safetyRejected &&
        displayFallbackReason(error) === "OPENAI_REJECTED_400"
    );
  });

  it("recognises safety refusals by code or wording, and nothing else", () => {
    assert.equal(isSafetyRejection(400, { code: "moderation_blocked" }), true);
    assert.equal(isSafetyRejection(400, { message: "Your request was rejected by the safety system." }), true);
    assert.equal(isSafetyRejection(400, { code: "invalid_image_format", message: "Invalid image" }), false);
    assert.equal(isSafetyRejection(500, { code: "moderation_blocked" }), false);
  });
});

describe("display image fallback", () => {
  const runnerWith = (options: {
    generate: () => Promise<unknown>;
    removeBackground?: () => Promise<unknown>;
    logs?: string[];
  }) => {
    const runner = new ProductImageJobRunnerService(
      {} as never,
      { removeBackground: options.removeBackground ?? (async () => { throw new Error("cutout must not run"); }) } as never,
      new ProductImageTransformerService(),
      {} as never,
      { generate: options.generate } as never
    );
    const logger = (runner as unknown as { logger: { warn: (line: string) => void; error: (line: string) => void } }).logger;
    logger.warn = (line: string) => options.logs?.push(line);
    logger.error = (line: string) => options.logs?.push(line);
    return runner as unknown as {
      process: (operation: string, source: unknown, mode: undefined, category: string, context?: Record<string, unknown>) => Promise<any>;
    };
  };

  const safetyError = () => new OpenAIDisplayImageError("PROCESSOR_REJECTED_IMAGE", "OpenAI display image generation failed (400): rejected by the safety system", {
    httpStatus: 400, openaiCode: "moderation_blocked", openaiType: "image_generation_user_error",
    openaiMessage: "Your request was rejected by the safety system.", requestId: "req_abc123", safetyRejected: true, permanent: true
  });

  it("makes the display image with the local cutout when OpenAI's safety system refuses, and records it", async () => {
    process.env.OPENAI_API_KEY = "sk-secret-never-logged";
    const logs: string[] = [];
    let cutoutCalls = 0;
    const runner = runnerWith({
      generate: async () => { throw safetyError(); },
      removeBackground: async () => {
        cutoutCalls += 1;
        return { body: await transparentCutout(), contentType: "image/png", provider: "lightweight-opencv", processorVersion: "v1", qualityScore: 0.9, qualityIssues: [] };
      },
      logs
    });

    const result = await runner.process("GENERATE_AI_DISPLAY_MAIN_IMAGE", { id: "front-1", body: await photo(), contentType: "image/jpeg" }, undefined, "SWEATSHIRTS", {
      jobId: "job-1", productId: "p-1", productCode: "P-0010", batchCode: "BATCH-1790840438119"
    });

    assert.equal(cutoutCalls, 1);
    assert.equal(result.provider, "local-cutout");
    assert.equal(result.fallbackFrom, "openai-image-edit");
    assert.equal(result.fallbackReason, OPENAI_SAFETY_REJECTED);
    assert.equal(result.qualityScore, 0.9);
    const meta = await sharp(result.body).metadata();
    assert.equal(meta.width, 1200);
    assert.equal(meta.height, 1200);
    // The garment keeps its own colour: the centre pixel is the cutout's red, untouched.
    const { data } = await sharp(result.body).extract({ left: 600, top: 600, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    assert.ok(Math.abs(data[0]! - 200) <= 3 && Math.abs(data[1]! - 30) <= 3 && Math.abs(data[2]! - 40) <= 3, `centre pixel ${[...data]}`);
    // Corners stay pure white.
    const corner = await sharp(result.body).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    assert.deepEqual([...corner], [255, 255, 255]);

    assert.equal(logs.length, 1);
    const line = JSON.parse(logs[0]!);
    assert.equal(line.event, "display_image_openai_rejected_used_cutout");
    assert.equal(line.productCode, "P-0010");
    assert.equal(line.batchCode, "BATCH-1790840438119");
    assert.equal(line.httpStatus, 400);
    assert.equal(line.openaiCode, "moderation_blocked");
    assert.equal(line.openaiRequestId, "req_abc123");
    assert.equal(line.provider, "openai-image-edit");
    assert.doesNotMatch(logs[0]!, /sk-secret-never-logged/);
  });

  it("also falls back on other permanent OpenAI refusals", () => {
    const rejected = (httpStatus: number | null, safetyRejected: boolean, permanent: boolean) => new OpenAIDisplayImageError("PROCESSOR_REJECTED_IMAGE", "x", {
      httpStatus, openaiCode: null, openaiType: null, openaiMessage: "x", requestId: null, safetyRejected, permanent
    });
    assert.equal(displayFallbackReason(rejected(400, true, true)), OPENAI_SAFETY_REJECTED);
    assert.equal(displayFallbackReason(rejected(400, false, true)), "OPENAI_REJECTED_400");
    assert.equal(displayFallbackReason(rejected(200, false, true)), "OPENAI_REJECTED_200");
    // Rate limits, outages and timeouts stay failures: a plain retry gives the better AI image.
    assert.equal(displayFallbackReason(rejected(429, false, false)), null);
    assert.equal(displayFallbackReason(rejected(500, false, false)), null);
    assert.equal(displayFallbackReason(new Error("timeout")), null);
  });

  it("leaves a server error from OpenAI a failure, as before", async () => {
    const runner = runnerWith({
      generate: async () => { throw new OpenAIDisplayImageError("UNKNOWN", "OpenAI display image generation failed (500): oops", {
        httpStatus: 500, openaiCode: null, openaiType: null, openaiMessage: "oops", requestId: null, safetyRejected: false, permanent: false
      }); }
    });
    await assert.rejects(
      runner.process("GENERATE_AI_DISPLAY_MAIN_IMAGE", { id: "front-1", body: await photo(), contentType: "image/jpeg" }, undefined, "TSHIRTS"),
      /\(500\)/
    );
  });

  it("fails with both reasons when the local cutout fails too", async () => {
    const runner = runnerWith({
      generate: async () => { throw safetyError(); },
      removeBackground: async () => { throw new Error("cutout service unavailable"); }
    });
    await assert.rejects(
      runner.process("GENERATE_AI_DISPLAY_MAIN_IMAGE", { id: "front-1", body: await photo(), contentType: "image/jpeg" }, undefined, "TSHIRTS"),
      (error: unknown) => {
        assert.ok(error instanceof OpenAIDisplayImageError);
        assert.match(error.message, /safety system/);
        assert.match(error.message, /cutout service unavailable/);
        assert.equal(error.details.requestId, "req_abc123");
        return true;
      }
    );
  });
});

describe("use the original photo", () => {
  it("stores the untouched original as the display image, records why, and audit-logs it", async () => {
    const saved = {
      product: prisma.product.findUnique,
      image: prisma.productImage.findFirst,
      jobFind: prisma.productImageProcessingJob.findFirst,
      jobCreate: prisma.productImageProcessingJob.create,
      jobFindUnique: prisma.productImageProcessingJob.findUnique,
      audit: prisma.auditLog.create,
      transaction: prisma.$transaction
    };
    const audits: Array<Record<string, unknown>> = [];
    const jobUpdates: Array<Record<string, unknown>> = [];
    const uploads: Buffer[] = [];
    const now = new Date();
    const job = { id: "job-orig", productId: "p-1", sourceImageId: "front-1", operation: "GENERATE_AI_DISPLAY_MAIN_IMAGE", targetVariant: "AI_DISPLAY_MAIN", status: "RUNNING", provider: null, processorVersion: null, qualityScore: null, qualityIssues: [], fallbackFrom: null, fallbackReason: null, outputImageId: null, retryCount: 0, failureCode: null, errorMessage: null, startedAt: now, completedAt: null, createdAt: now, updatedAt: now };
    try {
      prisma.product.findUnique = (async () => ({ status: "CALIBRATED", productCode: "P-0010" })) as never;
      prisma.productImage.findFirst = (async () => ({ id: "front-1", originalUrl: "gs://bucket/front-1.jpg" })) as never;
      prisma.productImageProcessingJob.findFirst = (async () => ({ id: "job-failed", status: "FAILED", provider: null, failureCode: "PROCESSOR_REJECTED_IMAGE" })) as never;
      prisma.productImageProcessingJob.create = (async ({ data }: { data: Record<string, unknown> }) => ({ ...job, ...data })) as never;
      prisma.productImageProcessingJob.findUnique = (async () => ({ ...job, ...Object.assign({}, ...jobUpdates) })) as never;
      prisma.auditLog.create = (async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return data; }) as never;
      (prisma as unknown as { $transaction: unknown }).$transaction = async (callback: (tx: unknown) => unknown) => callback({
        productImageVariantAsset: { create: async ({ data }: { data: Record<string, unknown> }) => data },
        productImageProcessingJob: { update: async ({ data }: { data: Record<string, unknown> }) => { jobUpdates.push(data); return data; } }
      });

      const original = await photo();
      const runner = new ProductImageJobRunnerService({
        bucket: "bucket",
        download: async () => ({ body: original, contentType: "image/jpeg" }),
        derivedObjectName: (_p: string, assetId: string) => `products/${assetId}.jpg`,
        upload: async (_name: string, _type: string, body: Buffer) => { uploads.push(body); }
      } as never, {} as never, new ProductImageTransformerService(), {} as never, { generate: async () => { throw new Error("AI must not run"); } } as never);

      const record = await runner.useOriginalAsDisplay({ productId: "p-1", sourceImageId: "front-1", adminUserId: "admin-1", employeeId: "emp-1" });

      assert.equal(record.status, "SUCCEEDED");
      assert.ok(record.outputImageId);
      assert.equal(jobUpdates[0]?.provider, "original-photo");
      assert.equal(jobUpdates[0]?.fallbackReason, STAFF_USE_ORIGINAL);
      assert.equal(uploads.length, 1);
      const meta = await sharp(uploads[0]!).metadata();
      assert.equal(meta.width, 1200);
      assert.equal(meta.height, 1200);
      assert.equal(audits.length, 1);
      assert.equal(audits[0]?.action, "PRODUCT_DISPLAY_IMAGE_USE_ORIGINAL");
      assert.equal(audits[0]?.actorId, "emp-1");
      assert.equal(audits[0]?.actorAdminUserId, "admin-1");
      assert.equal(audits[0]?.entityId, "p-1");
    } finally {
      prisma.product.findUnique = saved.product;
      prisma.productImage.findFirst = saved.image;
      prisma.productImageProcessingJob.findFirst = saved.jobFind;
      prisma.productImageProcessingJob.create = saved.jobCreate;
      prisma.productImageProcessingJob.findUnique = saved.jobFindUnique;
      prisma.auditLog.create = saved.audit;
      (prisma as unknown as { $transaction: unknown }).$transaction = saved.transaction;
    }
  });

  it("refuses a published item and a photo that is not the latest front original", async () => {
    const saved = { product: prisma.product.findUnique, image: prisma.productImage.findFirst };
    try {
      const runner = new ProductImageJobRunnerService({} as never, {} as never, new ProductImageTransformerService(), {} as never, {} as never);
      prisma.product.findUnique = (async () => ({ status: "PUBLISHED", productCode: "P" })) as never;
      await assert.rejects(runner.useOriginalAsDisplay({ productId: "p", sourceImageId: "front" }), /Unpublish/);
      prisma.product.findUnique = (async () => ({ status: "CALIBRATED", productCode: "P" })) as never;
      prisma.productImage.findFirst = (async () => ({ id: "newer-front" })) as never;
      await assert.rejects(runner.useOriginalAsDisplay({ productId: "p", sourceImageId: "front" }), /latest original FRONT/);
    } finally {
      prisma.product.findUnique = saved.product;
      prisma.productImage.findFirst = saved.image;
    }
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
