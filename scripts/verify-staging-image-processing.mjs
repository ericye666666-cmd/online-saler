import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { inflateSync } from "node:zlib";

const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000001";
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_SIGNATURE = Buffer.from([255, 216, 255]);
const DEFAULT_STOREFRONT_MINIMUM_QUALITY_SCORE = 0.75;
const DEFAULT_STOREFRONT_BLOCKING_ISSUES = ["SUBJECT_TOUCHES_EDGE", "EDGE_FRAGMENTED"];

export function evaluateStorefrontCutoutQuality(input, environment = process.env) {
  const configuredMinimum = Number.parseFloat(
    environment.BACKGROUND_REMOVAL_MIN_QUALITY_SCORE ?? String(DEFAULT_STOREFRONT_MINIMUM_QUALITY_SCORE)
  );
  const minimumScore = Number.isFinite(configuredMinimum)
    ? Math.max(0, Math.min(1, configuredMinimum))
    : DEFAULT_STOREFRONT_MINIMUM_QUALITY_SCORE;

  if (typeof input.qualityScore === "number" && input.qualityScore < minimumScore) {
    return {
      pass: false,
      reason: `QUALITY_SCORE_BELOW_THRESHOLD:${input.qualityScore}<${minimumScore}`
    };
  }

  const blockingIssues = new Set(
    environment.BACKGROUND_REMOVAL_BLOCKING_QUALITY_ISSUES?.trim()
      ? environment.BACKGROUND_REMOVAL_BLOCKING_QUALITY_ISSUES.split(",")
        .map((issue) => issue.trim())
        .filter(Boolean)
      : DEFAULT_STOREFRONT_BLOCKING_ISSUES
  );
  const blockingIssue = (input.qualityIssues ?? []).find((issue) => blockingIssues.has(issue));
  if (blockingIssue) {
    return { pass: false, reason: `QUALITY_ISSUE:${blockingIssue}` };
  }

  return { pass: true, reason: null };
}

export function inspectJpeg(input) {
  const jpeg = Buffer.from(input);
  assert.ok(jpeg.subarray(0, 3).equals(JPEG_SIGNATURE), "output must have a JPEG signature");
  assert.ok(jpeg.length > 4 && jpeg.at(-2) === 255 && jpeg.at(-1) === 217, "JPEG must end with an EOI marker");
  return { byteLength: jpeg.length };
}

export function inspectTransparentPng(input) {
  const png = Buffer.from(input);
  assert.ok(png.subarray(0, 8).equals(PNG_SIGNATURE), "output must have a PNG signature");

  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  const compressed = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      assert.equal(data[10], 0, "compressed PNG color data is unsupported");
      assert.equal(data[11], 0, "nonstandard PNG filters are unsupported");
      assert.equal(data[12], 0, "interlaced PNG output is unsupported");
    } else if (type === "IDAT") {
      compressed.push(data);
    }
    offset += 12 + length;
    if (type === "IEND") break;
  }

  assert.ok(width && height, "PNG must contain dimensions");
  assert.equal(bitDepth, 8, "PNG must use 8-bit channels");
  assert.ok(colorType === 4 || colorType === 6, "PNG must contain an alpha channel");
  const bytesPerPixel = colorType === 6 ? 4 : 2;
  const rowLength = width * bytesPerPixel;
  const raw = inflateSync(Buffer.concat(compressed));
  assert.equal(raw.length, height * (rowLength + 1), "PNG scanline length must match dimensions");

  let previous = Buffer.alloc(rowLength);
  let transparentPixels = 0;
  let opaquePixels = 0;
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const encoded = raw.subarray(cursor, cursor + rowLength);
    cursor += rowLength;
    const decoded = unfilterScanline(filter, encoded, previous, bytesPerPixel);
    for (let x = bytesPerPixel - 1; x < rowLength; x += bytesPerPixel) {
      if (decoded[x] === 0) transparentPixels += 1;
      if (decoded[x] === 255) opaquePixels += 1;
    }
    previous = decoded;
  }

  assert.ok(transparentPixels > 0, "PNG alpha must include transparent background pixels");
  assert.ok(opaquePixels > 0, "PNG alpha must include opaque garment pixels");
  return { width, height, colorType, transparentPixels, opaquePixels };
}

function unfilterScanline(filter, encoded, previous, bytesPerPixel) {
  const decoded = Buffer.alloc(encoded.length);
  for (let index = 0; index < encoded.length; index += 1) {
    const left = index >= bytesPerPixel ? decoded[index - bytesPerPixel] : 0;
    const up = previous[index] ?? 0;
    const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
    let predictor;
    if (filter === 0) predictor = 0;
    else if (filter === 1) predictor = left;
    else if (filter === 2) predictor = up;
    else if (filter === 3) predictor = Math.floor((left + up) / 2);
    else if (filter === 4) predictor = paeth(left, up, upperLeft);
    else throw new Error(`Unsupported PNG filter ${filter}`);
    decoded[index] = (encoded[index] + predictor) & 0xff;
  }
  return decoded;
}

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${url} failed: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function requestBytes(url, options = {}) {
  const response = await fetch(url, options);
  const body = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${url} failed: ${response.status} ${body.toString("utf8")}`);
  return body;
}

export async function runStagingImageProcessingE2E(environment = process.env) {
  const serviceUrl = environment.SERVICE_URL?.replace(/\/$/, "");
  assert.ok(serviceUrl, "SERVICE_URL is required");
  const login = environment.STAGING_ADMIN_LOGIN ?? "superadmin";
  const password = environment.STAGING_ADMIN_PASSWORD;
  assert.ok(password, "STAGING_ADMIN_PASSWORD is required");
  const fixtureRoot = environment.IMAGE_PROCESSING_FIXTURE_ROOT ?? resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../tests/fixtures/image-processing"
  );

  const loginResponse = await requestJson(`${serviceUrl}/operations/access/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password })
  });
  const adminUserId = loginResponse?.adminUser?.id;
  assert.ok(adminUserId, "staging login must return adminUser.id");
  const adminHeaders = { "X-Admin-User-Id": adminUserId };
  const runKey = `${environment.GITHUB_RUN_ID ?? Date.now()}-${environment.GITHUB_RUN_ATTEMPT ?? "local"}`;

  const results = [];
  results.push(await verifyCutoutPath({
    serviceUrl,
    adminUserId,
    adminHeaders,
    runKey,
    fixturePath: resolve(fixtureRoot, "mundu-black-shirt-standard.jpg"),
    expectedProvider: "lightweight-opencv",
    expectFallback: false,
    productCode: `E2E-LIGHT-${runKey}`
  }));
  results.push(await verifyCutoutPath({
    serviceUrl,
    adminUserId,
    adminHeaders,
    runKey,
    fixturePath: resolve(fixtureRoot, "mundu-black-shirt-close.jpg"),
    expectedProvider: "rembg-birefnet",
    expectFallback: true,
    productCode: `E2E-FALLBACK-${runKey}`
  }));
  const retry = await verifyRetry({ serviceUrl, adminUserId, adminHeaders, runKey });

  const summary = { status: "ok", cutouts: results, retry };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

async function verifyCutoutPath(input) {
  const original = await readFile(input.fixturePath);
  const product = await createProduct(input, input.productCode);
  const image = await uploadFront(input, product.id, original, "image/jpeg");
  await assertOriginalUnchanged(input.serviceUrl, product.id, image.id, original);

  const job = await requestJson(
    `${input.serviceUrl}/products/${product.id}/images/${image.id}/processing-jobs`,
    {
      method: "POST",
      headers: { ...input.adminHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "REMOVE_BACKGROUND" })
    }
  );
  const completed = await requestJson(`${input.serviceUrl}/image-processing-jobs/${job.id}/run`, {
    method: "POST",
    headers: input.adminHeaders
  });
  assert.equal(completed.status, "SUCCEEDED");
  assert.equal(completed.provider, input.expectedProvider);
  assert.equal(typeof completed.qualityScore, "number");
  assert.ok(Array.isArray(completed.qualityIssues));
  assert.ok(completed.outputImageId);

  if (input.expectFallback) {
    assert.equal(completed.fallbackFrom, "lightweight-opencv");
    assert.ok(completed.fallbackReason, "fallback must persist a reason");
    assert.ok(
      completed.qualityScore < 0.75 || completed.qualityIssues.length > 0,
      "fallback must retain lightweight quality evidence"
    );
  } else {
    assert.ok(completed.qualityScore >= 0.75);
    assert.equal(completed.fallbackFrom, null);
    assert.equal(completed.fallbackReason, null);
  }

  const comparison = await requestJson(`${input.serviceUrl}/products/${product.id}/image-comparison`, {
    headers: input.adminHeaders
  });
  const persisted = comparison.jobs.find((item) => item.id === job.id);
  assert.deepEqual(persisted, completed, "comparison endpoint must expose persisted routing metadata");
  assert.equal(comparison.original.imageId, image.id);
  assert.equal(comparison.cutoutTransparent.imageId, completed.outputImageId);

  const transparent = await requestBytes(
    `${input.serviceUrl}/products/${product.id}/image-assets/${completed.outputImageId}/content`
  );
  const alpha = inspectTransparentPng(transparent);
  const white = await runDerivedOperation({
    ...input,
    productId: product.id,
    sourceImageId: completed.outputImageId,
    operation: "COMPOSE_WHITE_BACKGROUND",
    expectedVariant: "CUTOUT_WHITE",
    expectedProvider: "deterministic-sharp"
  });
  const optimized = await runDerivedOperation({
    ...input,
    productId: product.id,
    sourceImageId: white.outputImageId,
    operation: "OPTIMIZE_MAIN_IMAGE",
    expectedVariant: "OPTIMIZED_MAIN",
    expectedProvider: "deterministic-sharp"
  });
  const balanced = await runDerivedOperation({
    ...input,
    productId: product.id,
    sourceImageId: completed.outputImageId,
    operation: "OPTIMIZE_BALANCED_MAIN_IMAGE",
    expectedVariant: "OPTIMIZED_BALANCED_MAIN",
    expectedProvider: "lightweight-opencv"
  });
  const storefrontQuality = evaluateStorefrontCutoutQuality(completed);
  const selectionResponse = await fetch(`${input.serviceUrl}/products/${product.id}/main-image`, {
    method: "POST",
    headers: { ...input.adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ imageId: balanced.outputImageId })
  });
  const selectionText = await selectionResponse.text();
  const selection = selectionText ? JSON.parse(selectionText) : null;
  if (storefrontQuality.pass) {
    assert.equal(selectionResponse.status, 201, selectionText);
    assert.equal(selection.selectedMainImageId, balanced.outputImageId);
    assert.equal(selection.optimizedBalancedMain.selectedAsMain, true);
  } else {
    assert.equal(selectionResponse.status, 400, selectionText);
    assert.match(
      String(selection?.message ?? ""),
      /Cutout quality is insufficient for storefront use/,
      "low-quality cutouts must be rejected as storefront main images"
    );
    assert.match(String(selection.message), new RegExp(escapeRegExp(storefrontQuality.reason)));
    const comparisonAfterRejection = await requestJson(
      `${input.serviceUrl}/products/${product.id}/image-comparison`,
      { headers: input.adminHeaders }
    );
    assert.equal(comparisonAfterRejection.selectedMainImageId, null);
  }
  await assertOriginalUnchanged(input.serviceUrl, product.id, image.id, original);

  return {
    productId: product.id,
    provider: completed.provider,
    qualityScore: completed.qualityScore,
    qualityIssues: completed.qualityIssues,
    fallbackFrom: completed.fallbackFrom,
    fallbackReason: completed.fallbackReason,
    originalSha256: sha256(original),
    alpha,
    white,
    optimized,
    balanced,
    mainImageSelection: storefrontQuality.pass ? "selected" : "rejected-low-quality"
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function runDerivedOperation(input) {
  const job = await requestJson(
    `${input.serviceUrl}/products/${input.productId}/images/${input.sourceImageId}/processing-jobs`,
    {
      method: "POST",
      headers: { ...input.adminHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ operation: input.operation })
    }
  );
  const completed = await requestJson(`${input.serviceUrl}/image-processing-jobs/${job.id}/run`, {
    method: "POST",
    headers: { ...input.adminHeaders, "Content-Type": "application/json" },
    body: "{}"
  });
  assert.equal(completed.status, "SUCCEEDED");
  assert.equal(completed.provider, input.expectedProvider);
  assert.equal(completed.targetVariant, input.expectedVariant);
  assert.ok(completed.outputImageId);

  const comparison = await requestJson(`${input.serviceUrl}/products/${input.productId}/image-comparison`, {
    headers: input.adminHeaders
  });
  const property = input.expectedVariant === "CUTOUT_WHITE"
    ? "cutoutWhite"
    : input.expectedVariant === "OPTIMIZED_BALANCED_MAIN"
      ? "optimizedBalancedMain"
      : "optimizedMain";
  const asset = comparison[property];
  assert.equal(asset.imageId, completed.outputImageId);
  assert.equal(asset.mimeType, "image/jpeg");
  if (input.expectedVariant === "OPTIMIZED_MAIN" || input.expectedVariant === "OPTIMIZED_BALANCED_MAIN") {
    assert.equal(asset.widthPx, 1200);
    assert.equal(asset.heightPx, 1200);
  }

  const bytes = await requestBytes(
    `${input.serviceUrl}/products/${input.productId}/image-assets/${completed.outputImageId}/content`
  );
  const jpeg = inspectJpeg(bytes);
  return {
    jobId: completed.id,
    outputImageId: completed.outputImageId,
    variant: completed.targetVariant,
    mimeType: asset.mimeType,
    widthPx: asset.widthPx,
    heightPx: asset.heightPx,
    jpeg
  };
}

async function verifyRetry(input) {
  const invalidImage = Buffer.from("invalid PNG fixture for retry verification", "utf8");
  const product = await createProduct(input, `E2E-RETRY-${input.runKey}`);
  const image = await uploadFront(input, product.id, invalidImage, "image/png");
  const job = await requestJson(
    `${input.serviceUrl}/products/${product.id}/images/${image.id}/processing-jobs`,
    {
      method: "POST",
      headers: { ...input.adminHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "REMOVE_BACKGROUND" })
    }
  );
  const failed = await requestJson(`${input.serviceUrl}/image-processing-jobs/${job.id}/run`, {
    method: "POST",
    headers: input.adminHeaders
  });
  assert.equal(failed.status, "FAILED");
  assert.ok(failed.failureCode);

  const retried = await requestJson(`${input.serviceUrl}/image-processing-jobs/${job.id}/retry`, {
    method: "POST",
    headers: { ...input.adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "staging E2E retry verification" })
  });
  assert.equal(retried.id, job.id);
  assert.equal(retried.status, "PENDING");
  assert.equal(retried.retryCount, 1);
  assert.equal(retried.failureCode, null);
  assert.equal(retried.outputImageId, null);

  const failedAgain = await requestJson(`${input.serviceUrl}/image-processing-jobs/${job.id}/run`, {
    method: "POST",
    headers: input.adminHeaders
  });
  assert.equal(failedAgain.status, "FAILED");
  assert.equal(failedAgain.retryCount, 1);
  await assertOriginalUnchanged(input.serviceUrl, product.id, image.id, invalidImage);
  return { productId: product.id, jobId: job.id, retryCount: failedAgain.retryCount };
}

async function createProduct(input, productCode) {
  return requestJson(`${input.serviceUrl}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productCode, employeeId: EMPLOYEE_ID, adminUserId: input.adminUserId })
  });
}

async function uploadFront(input, productId, bytes, contentType) {
  return requestJson(`${input.serviceUrl}/products/${productId}/images/upload`, {
    method: "POST",
    headers: {
      ...input.adminHeaders,
      "Content-Type": contentType,
      "X-Image-Type": "FRONT",
      "X-Employee-Id": EMPLOYEE_ID
    },
    body: new Uint8Array(bytes)
  });
}

async function assertOriginalUnchanged(serviceUrl, productId, imageId, expected) {
  const downloaded = await requestBytes(`${serviceUrl}/products/${productId}/images/${imageId}/content`);
  assert.equal(sha256(downloaded), sha256(expected), "image processing must not overwrite original bytes");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  await runStagingImageProcessingE2E();
}
