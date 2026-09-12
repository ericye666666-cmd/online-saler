import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  authenticateStagingSmoke,
  evaluateStorefrontCutoutQuality,
  exportStagingSmokeSession,
  inspectJpeg,
  inspectTransparentPng,
  readStagingLoginSession,
  runStagingImageProcessingE2E
} from "./verify-staging-image-processing.mjs";

const staffSession = {
  accessToken: "test-payload.test-signature",
  adminUser: { linkedEmployeeId: "00000000-0000-4000-8000-000000000099" }
};

test("validates the staff token and linked employee without trusting request actor IDs", () => {
  assert.deepEqual(readStagingLoginSession(staffSession), {
    accessToken: staffSession.accessToken,
    employeeId: staffSession.adminUser.linkedEmployeeId
  });
  for (const accessToken of [undefined, "", "undefined", "Bearer test", "test.signature\nOTHER_ENV=1", 42]) {
    assert.throws(() => readStagingLoginSession({ ...staffSession, accessToken }), /valid access token/);
  }
  assert.throws(() => readStagingLoginSession({ accessToken: staffSession.accessToken }), /linked employee ID/);
});

test("authentication submits credentials only to login and does not expose failure response bodies", async () => {
  const environment = { SERVICE_URL: "https://smoke.invalid/", STAGING_ADMIN_LOGIN: "operator", STAGING_ADMIN_PASSWORD: "private-password" };
  const result = await authenticateStagingSmoke(environment, async (url, options) => {
    assert.equal(url, "https://smoke.invalid/operations/access/login");
    assert.deepEqual(JSON.parse(options.body), { login: "operator", password: environment.STAGING_ADMIN_PASSWORD });
    assert.equal(options.headers.Authorization, undefined);
    return Response.json(staffSession);
  });
  assert.equal(result.accessToken, staffSession.accessToken);
  await assert.rejects(authenticateStagingSmoke(environment, async () => new Response(
    `${environment.STAGING_ADMIN_PASSWORD} ${staffSession.accessToken}`, { status: 401 }
  )), { message: "Staging staff login failed: HTTP 401" });
  await assert.rejects(authenticateStagingSmoke(environment, async () => new Response(
    `${environment.STAGING_ADMIN_PASSWORD} ${staffSession.accessToken}`
  )), { message: "Staging staff login returned invalid JSON." });
});

test("CI session export masks the token before sharing it with subsequent smoke steps", async () => {
  const directory = await mkdtemp(join(tmpdir(), "staging-auth-test-"));
  const environment = { SERVICE_URL: "https://smoke.invalid", STAGING_ADMIN_PASSWORD: "private-password", GITHUB_ENV: join(directory, "environment") };
  const logs = [];
  try {
    await exportStagingSmokeSession(environment, async () => Response.json(staffSession), (line) => logs.push(line));
    assert.deepEqual(logs, [`::add-mask::${staffSession.accessToken}`]);
    assert.equal(await readFile(environment.GITHUB_ENV, "utf8"),
      `STAGING_SMOKE_ACCESS_TOKEN=${staffSession.accessToken}\nSTAGING_SMOKE_EMPLOYEE_ID=${staffSession.adminUser.linkedEmployeeId}\n`);
    assert.ok(!logs.join("\n").includes(environment.STAGING_ADMIN_PASSWORD));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("image smoke fails closed for an invalid inherited token before sending any request", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests += 1; throw new Error("unexpected request"); });
  await assert.rejects(runStagingImageProcessingE2E({ SERVICE_URL: "https://smoke.invalid", STAGING_SMOKE_ACCESS_TOKEN: "" }), /valid access token/);
  assert.equal(requests, 0);
});

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
}

function rgbaPng(alphaValues) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(alphaValues.length, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanline = Buffer.from([0, ...alphaValues.flatMap((alpha) => [10, 20, 30, alpha])]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scanline)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

test("accepts an RGBA PNG containing transparent and opaque pixels", () => {
  const result = inspectTransparentPng(rgbaPng([0, 255]));
  assert.equal(result.transparentPixels, 1);
  assert.equal(result.opaquePixels, 1);
  assert.equal(result.colorType, 6);
});

test("rejects output without transparent background pixels", () => {
  assert.throws(() => inspectTransparentPng(rgbaPng([255, 255])), /transparent background/);
});

test("accepts a complete JPEG byte stream", () => {
  assert.equal(inspectJpeg(Buffer.from([255, 216, 255, 224, 0, 255, 217])).byteLength, 7);
});

test("rejects a truncated JPEG byte stream", () => {
  assert.throws(() => inspectJpeg(Buffer.from([255, 216, 255, 224])), /EOI marker/);
});

test("accepts cutout quality that satisfies the storefront gate", () => {
  assert.deepEqual(evaluateStorefrontCutoutQuality({ qualityScore: 0.8, qualityIssues: [] }, {}), {
    pass: true,
    reason: null
  });
});

test("rejects cutout quality below the storefront score threshold", () => {
  assert.deepEqual(evaluateStorefrontCutoutQuality({ qualityScore: 0.487, qualityIssues: [] }, {}), {
    pass: false,
    reason: "QUALITY_SCORE_BELOW_THRESHOLD:0.487<0.75"
  });
});

test("rejects blocking cutout issues even when the score passes", () => {
  assert.deepEqual(
    evaluateStorefrontCutoutQuality({ qualityScore: 0.9, qualityIssues: ["SUBJECT_TOUCHES_EDGE"] }, {}),
    { pass: false, reason: "QUALITY_ISSUE:SUBJECT_TOUCHES_EDGE" }
  );
});

test("allows non-blocking cutout issues when the score passes", () => {
  assert.deepEqual(
    evaluateStorefrontCutoutQuality({ qualityScore: 0.9, qualityIssues: ["SUBJECT_TOO_SMALL"] }, {}),
    { pass: true, reason: null }
  );
});

test("complete image smoke authenticates protected operations and keeps media reads public", async (t) => {
  const products = new Map();
  const jobs = new Map();
  const logs = [];
  let protectedRequests = 0;
  let mediaReads = 0;
  t.mock.method(console, "log", (line) => logs.push(line));
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    const path = new URL(url).pathname;
    const method = options.method ?? "GET";
    const headers = new Headers(options.headers);
    const isMedia = path.endsWith("/content");
    if (isMedia) {
      mediaReads += 1;
      assert.equal(headers.get("authorization"), null);
    } else {
      protectedRequests += 1;
      assert.equal(headers.get("authorization"), `Bearer ${staffSession.accessToken}`, `${method} ${path}`);
    }
    assert.equal(headers.get("x-admin-user-id"), null);
    assert.equal(headers.get("x-employee-id"), null);
    const body = headers.get("content-type") === "application/json" && options.body ? JSON.parse(options.body) : {};
    assert.equal(body.adminUserId, undefined);
    assert.equal(body.employeeId, undefined);

    if (path === "/products" && method === "POST") {
      const product = { id: `product-${products.size + 1}`, code: body.productCode };
      products.set(product.id, product);
      return Response.json({ id: product.id });
    }
    const productMatch = path.match(/^\/products\/([^/]+)/);
    const product = productMatch ? products.get(productMatch[1]) : null;
    if (path.endsWith("/images/upload")) {
      product.original = Buffer.from(options.body);
      product.imageId = `${product.id}-original`;
      return Response.json({ id: product.imageId });
    }
    if (isMedia && path.includes("/images/")) return new Response(product.original);
    if (isMedia) {
      const outputId = path.split("/").at(-2);
      const job = [...jobs.values()].find((entry) => entry.outputImageId === outputId);
      assert.ok(job, "asset must refer to a generated image");
      return new Response(job.operation === "REMOVE_BACKGROUND"
        ? rgbaPng([0, 255]) : Buffer.from([255, 216, 255, 224, 0, 255, 217]));
    }
    if (path.endsWith("/processing-jobs")) {
      if (body.operation === "COMPOSE_WHITE_BACKGROUND" && product.code.startsWith("E2E-FALLBACK")) {
        return Response.json({ message: "Cutout quality is insufficient for storefront use: QUALITY_SCORE_BELOW_THRESHOLD:0.5<0.75" }, { status: 400 });
      }
      const job = { id: `job-${jobs.size + 1}`, productId: product.id, operation: body.operation, status: "PENDING", retryCount: 0 };
      jobs.set(job.id, job);
      return Response.json(job);
    }
    if (path.startsWith("/image-processing-jobs/")) {
      const job = jobs.get(path.split("/")[2]);
      if (path.endsWith("/retry")) {
        Object.assign(job, { status: "PENDING", retryCount: 1, failureCode: null, outputImageId: null });
      } else {
        assert.ok(path.endsWith("/run"));
        const owner = products.get(job.productId);
        if (owner.code.startsWith("E2E-RETRY")) {
          Object.assign(job, { status: "FAILED", failureCode: "INVALID_IMAGE" });
        } else if (job.operation === "REMOVE_BACKGROUND") {
          const fallback = owner.code.startsWith("E2E-FALLBACK");
          Object.assign(job, {
            status: "SUCCEEDED", provider: fallback ? "rembg-birefnet" : "lightweight-opencv",
            qualityScore: fallback ? 0.5 : 0.8, qualityIssues: [], outputImageId: `${job.id}-output`,
            fallbackFrom: fallback ? "lightweight-opencv" : null, fallbackReason: fallback ? "LOW_QUALITY" : null
          });
        } else {
          Object.assign(job, {
            status: "SUCCEEDED", outputImageId: `${job.id}-output`,
            provider: job.operation === "OPTIMIZE_BALANCED_MAIN_IMAGE" ? "lightweight-opencv" : "deterministic-sharp",
            targetVariant: { COMPOSE_WHITE_BACKGROUND: "CUTOUT_WHITE", OPTIMIZE_MAIN_IMAGE: "OPTIMIZED_MAIN", OPTIMIZE_BALANCED_MAIN_IMAGE: "OPTIMIZED_BALANCED_MAIN" }[job.operation]
          });
        }
      }
      return Response.json(job);
    }
    if (path.endsWith("/image-comparison")) {
      const productJobs = [...jobs.values()].filter((job) => job.productId === product.id);
      const comparison = { original: { imageId: product.imageId }, jobs: productJobs, selectedMainImageId: null };
      for (const job of productJobs) {
        const key = { REMOVE_BACKGROUND: "cutoutTransparent", COMPOSE_WHITE_BACKGROUND: "cutoutWhite", OPTIMIZE_MAIN_IMAGE: "optimizedMain", OPTIMIZE_BALANCED_MAIN_IMAGE: "optimizedBalancedMain" }[job.operation];
        comparison[key] = { imageId: job.outputImageId, mimeType: "image/jpeg", widthPx: 1200, heightPx: 1200 };
      }
      return Response.json(comparison);
    }
    if (path.endsWith("/main-image")) {
      return Response.json({ selectedMainImageId: body.imageId, optimizedBalancedMain: { selectedAsMain: true } }, { status: 201 });
    }
    throw new Error(`Unexpected mocked request ${method} ${path}`);
  });

  const summary = await runStagingImageProcessingE2E({
    SERVICE_URL: "https://smoke.invalid", GITHUB_RUN_ID: "auth-test", GITHUB_RUN_ATTEMPT: "1",
    STAGING_SMOKE_ACCESS_TOKEN: staffSession.accessToken,
    STAGING_SMOKE_EMPLOYEE_ID: staffSession.adminUser.linkedEmployeeId
  });
  assert.equal(summary.status, "ok");
  assert.equal(summary.cutouts.length, 2);
  assert.equal(summary.retry.retryCount, 1);
  assert.ok(protectedRequests > 20, "exercise creation, upload, job runs/retry, comparisons, derived images and selection");
  assert.ok(mediaReads > 5);
  assert.ok(!logs.join("\n").includes(staffSession.accessToken));
});
