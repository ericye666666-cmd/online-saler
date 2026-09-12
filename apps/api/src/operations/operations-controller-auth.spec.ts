import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { prisma } from "@online-saler/database";

// Exercise the same emitted decorators and constructor metadata as the deployed
// API. tsx intentionally does not emit Nest's design:paramtypes metadata.
// Run the API build before this suite, as with the existing module smoke test.
const { OperationsAccessService } = require("../../dist/operations/operations-access.service") as typeof import("./operations-access.service");
const { OperationsRequestIdentity } = require("../../dist/operations/operations-request-identity") as typeof import("./operations-request-identity");
const { issueOperationsAccessToken, OPERATIONS_PERMISSIONS } = require("../../dist/operations/operations-access-policy") as typeof import("./operations-access-policy");
const { OperationsProductBatchController } = require("../../dist/operations/operations-product-batch.controller") as typeof import("./operations-product-batch.controller");
const { OperationsProductBatchService } = require("../../dist/operations/operations-product-batch.service") as typeof import("./operations-product-batch.service");
const { OperationsAnalyticsController } = require("../../dist/operations/operations-analytics.controller") as typeof import("./operations-analytics.controller");
const { OperationsAnalyticsService } = require("../../dist/operations/operations-analytics.service") as typeof import("./operations-analytics.service");
const { OperationsWarehouseLocationsController, OperationsInventoryOverviewController } = require("../../dist/operations/operations-fulfillment.controller") as typeof import("./operations-fulfillment.controller");
const { OperationsWarehouseService } = require("../../dist/operations/operations-warehouse.service") as typeof import("./operations-warehouse.service");
const { ProductSetupController } = require("../../dist/product/product-setup.controller") as typeof import("../product/product-setup.controller");
const { ProductApplicationService } = require("../../dist/product/product-application.service") as typeof import("../product/product-application.service");
const { ProductImageStorageService } = require("../../dist/product/product-image-storage.service") as typeof import("../product/product-image-storage.service");
const { ProductImageTransformerService } = require("../../dist/product/product-image-transformer.service") as typeof import("../product/product-image-transformer.service");
const { ProductDetailGenerationService } = require("../../dist/product/product-detail-generation.service") as typeof import("../product/product-detail-generation.service");
const { ProductBarcodeController } = require("../../dist/product/product-barcode.controller") as typeof import("../product/product-barcode.controller");
const { ProductBarcodeService } = require("../../dist/product/product-barcode.service") as typeof import("../product/product-barcode.service");
const { AIJobController } = require("../../dist/ai/ai-job.controller") as typeof import("../ai/ai-job.controller");
const { AIJobService } = require("../../dist/ai/ai-job.service") as typeof import("../ai/ai-job.service");
const { ProductCalibrationController } = require("../../dist/product/product-calibration.controller") as typeof import("../product/product-calibration.controller");
const { ProductCalibrationService } = require("../../dist/product/product-calibration.service") as typeof import("../product/product-calibration.service");
const { ProductImageProcessingController } = require("../../dist/product/product-image-processing.controller") as typeof import("../product/product-image-processing.controller");
const { ProductImageProcessingService } = require("../../dist/product/product-image-processing.service") as typeof import("../product/product-image-processing.service");
const { ProductImageJobRunnerService } = require("../../dist/product/product-image-job-runner.service") as typeof import("../product/product-image-job-runner.service");
const { ProductDetailGenerationController } = require("../../dist/product/product-detail-generation.controller") as typeof import("../product/product-detail-generation.controller");
const { ProductDetailGenerationRunnerService } = require("../../dist/product/product-detail-generation-runner.service") as typeof import("../product/product-detail-generation-runner.service");
const { ProductDetailAssetService } = require("../../dist/product/product-detail-asset.service") as typeof import("../product/product-detail-asset.service");
const { OperationsWorkspaceController } = require("../../dist/operations/operations-workspace.controller") as typeof import("./operations-workspace.controller");
const { OperationsWorkspaceService } = require("../../dist/operations/operations-workspace.service") as typeof import("./operations-workspace.service");
const { OperationsProductFactoryAdminController } = require("../../dist/operations/operations-product-factory-admin.controller") as typeof import("./operations-product-factory-admin.controller");
const { OperationsProductFactoryAdminService } = require("../../dist/operations/operations-product-factory-admin.service") as typeof import("./operations-product-factory-admin.service");
const { OperationsProductControlController } = require("../../dist/operations/operations-product-control.controller") as typeof import("./operations-product-control.controller");
const { OperationsProductControlService } = require("../../dist/operations/operations-product-control.service") as typeof import("./operations-product-control.service");

type Call = { name: string; args: any[] };
type Route = { method: "GET" | "POST" | "PATCH"; path: string; body?: Record<string, unknown>; binary?: boolean };

const forgedAdminId = "another-privileged-admin";
const forgedEmployeeId = "another-employee";
const productCreate: Route = { method: "POST", path: "/products", body: { productCode: "DL-AUTH-TEST" } };
const imageUpload: Route = { method: "POST", path: "/products/product-1/images/upload", binary: true };
const aiSubmit: Route = { method: "POST", path: "/ai-jobs", body: { productId: "product-1" } };
const batchCreate: Route = { method: "POST", path: "/operations/product-batches", body: { targetCount: 10 } };
const batchSummary: Route = { method: "GET", path: "/operations/product-batches/summary" };
const barcodeRead: Route = { method: "GET", path: "/products/barcode/920260910001" };
const analyticsRead: Route = { method: "GET", path: "/operations/analytics/dashboard" };
const warehouseRead: Route = { method: "GET", path: "/operations/warehouse-locations" };
const warehouseCreate: Route = { method: "POST", path: "/operations/warehouse-locations", body: { locationCode: "A-001", capacity: 10 } };

const protectedRoutes: Route[] = [
  productCreate,
  imageUpload,
  { method: "POST", path: "/products/product-1/images", body: { type: "FRONT", originalUrl: "https://example.test/photo.jpg" } },
  { method: "GET", path: "/products/product-1" },
  { method: "POST", path: "/products/product-1/barcode" },
  barcodeRead,
  aiSubmit,
  { method: "GET", path: "/ai-jobs/job-1" },
  batchCreate,
  batchSummary,
  { method: "GET", path: "/operations/product-batches" },
  { method: "GET", path: "/operations/product-batches/products" },
  { method: "GET", path: "/operations/product-batches/batch-1" },
  ...["run-ai", "generate-barcodes", "mark-labels-printed", "stock-in", "prepare-storage", "publish", "complete-and-publish"].map((action): Route => ({
    method: "POST", path: `/operations/product-batches/batch-1/${action}`
  })),
  ...["review", "recalibration", "retake"].map((action): Route => ({
    method: "POST", path: `/operations/product-batches/products/product-1/${action}`, body: { result: "APPROVED", reason: "Test" }
  })),
  analyticsRead,
  warehouseRead,
  { method: "GET", path: "/operations/warehouse-locations/summary" },
  warehouseCreate,
  { method: "POST", path: "/operations/warehouse-locations/bulk", body: { prefix: "A-", start: 1, end: 3 } },
  { method: "PATCH", path: "/operations/warehouse-locations/location-1/status", body: { status: "ACTIVE" } },
  { method: "PATCH", path: "/operations/warehouse-locations/location-1/capacity", body: { capacity: 20 } },
  { method: "POST", path: "/operations/warehouse-locations/move-item", body: { inventoryItemId: "item-1", locationId: "location-1" } },
  { method: "GET", path: "/operations/inventory-overview" },
  { method: "POST", path: "/products/product-1/calibrate" },
  { method: "POST", path: "/products/product-1/images/image-1/processing-jobs", body: { operation: "REMOVE_BACKGROUND" } },
  { method: "POST", path: "/image-processing-jobs/job-1/run" },
  { method: "GET", path: "/products/product-1/image-comparison" },
  { method: "POST", path: "/products/product-1/main-image", body: { imageId: "image-1" } },
  { method: "POST", path: "/products/product-1/images/image-1/manual-cutout", binary: true },
  { method: "POST", path: "/products/product-1/images/image-1/guided-cutout", body: { points: [] } },
  { method: "POST", path: "/image-processing-jobs/job-1/retry" },
  { method: "GET", path: "/operations/product-detail-generation" },
  { method: "GET", path: "/product-detail-profiles/profile-1" },
  { method: "GET", path: "/products/product-1/detail-profile" },
  { method: "GET", path: "/operations/product-batches/batch-1/detail-generation" },
  { method: "POST", path: "/operations/product-batches/batch-1/detail-generation-jobs" },
  ...["retry", "run"].map((action): Route => ({ method: "POST", path: `/product-detail-generation-jobs/job-1/${action}` })),
  ...["run", "retry-failed", "regenerate-outdated", "approve"].map((action): Route => ({
    method: "POST", path: `/operations/product-batches/batch-1/detail-generation/${action}`
  })),
  { method: "PATCH", path: "/product-detail-profiles/profile-1/copy" },
  ...["recalculate-fit", "regenerate-openai", "approve", "assets/generate", "main-image"].map((action): Route => ({
    method: "POST", path: `/product-detail-profiles/profile-1/${action}`, body: { imageId: "image-1" }
  })),
  { method: "GET", path: "/operations/workspace/summary" },
  { method: "GET", path: "/operations/workspace/active" },
  { method: "POST", path: "/operations/workspace/start" },
  { method: "GET", path: "/operations/product-factory-admin/taxonomy" },
  { method: "POST", path: "/operations/product-factory-admin/taxonomy/options", body: { group: "TAG", code: "TEST_TAG", displayName: "Test" } },
  { method: "PATCH", path: "/operations/product-factory-admin/taxonomy/TAG/TEST_TAG", body: { displayName: "Updated" } },
  { method: "GET", path: "/operations/product-factory-admin/configuration" },
  ...["summary", "products", "locations"].map((action): Route => ({ method: "GET", path: `/operations/product-control/${action}` })),
  { method: "PATCH", path: "/operations/product-control/products/product-1/price", body: { priceKsh: 200 } },
  ...["prepare-storage", "location-hint", "confirm-placed", "publish", "unpublish"].map((action): Route => ({
    method: "POST", path: `/operations/product-control/products/product-1/${action}`
  })),
  { method: "POST", path: "/operations/product-control/labels/printed", body: { productIds: ["product-1"] } }
];

test("operations HTTP boundaries authenticate tokens before any product, AI or warehouse work", async (t) => {
  const calls: Call[] = [];
  const effects: Call[] = [];
  const authLookups: string[] = [];
  const access = new OperationsAccessService();
  const identity = new OperationsRequestIdentity(access);
  const permissionCodes = OPERATIONS_PERMISSIONS.map((permission) => permission.code);
  const employee = { id: "employee-real", name: "Actual Employee", employeeCode: "EMP-REAL", status: "ACTIVE" };

  function account(id: string, permissions: string[] = permissionCodes) {
    return {
      id, name: id, loginAccount: id, email: null, phone: null,
      passwordHash: `test-only-password-hash-${id}`, status: "ACTIVE",
      linkedEmployeeId: employee.id, linkedEmployee: employee, lastLoginAt: null,
      roles: [{ role: {
        id: `role-${id}`, code: `ROLE_${id}`, name: "Test role", description: null,
        permissions: permissions.map((code) => ({ permission: { id: code, code, module: "test", scope: "ACTION", page: null, action: null, description: null } }))
      } }]
    };
  }

  const actor = account("admin-real");
  const restricted = account("admin-restricted", []);
  const privileged = account(forgedAdminId);
  const accounts = new Map([actor, restricted, privileged].map((value) => [value.id, value]));
  // Prisma delegates expose methods through a Proxy rather than own method
  // descriptors, so restore explicit replacements instead of t.mock.method.
  function replaceMethod(target: any, name: string, implementation: (...args: any[]) => any) {
    const original = target[name];
    target[name] = implementation;
    t.after(() => { target[name] = original; });
  }
  const findAdmin = async ({ where }: { where: { id: string } }) => {
    authLookups.push(where.id);
    return accounts.get(where.id) ?? null;
  };
  replaceMethod(prisma.adminUser, "findFirst", findAdmin);
  replaceMethod(prisma.adminUser, "findUnique", findAdmin);
  replaceMethod(prisma.employee, "findUnique", async ({ where }: { where: { id: string } }) => where.id === employee.id ? employee : null);

  const record = (name: string, args: any[]) => {
    const call = { name, args };
    calls.push(call);
    effects.push(call);
    return { ok: true, args };
  };
  const stub = (name: string) => async (...args: any[]) => record(name, args);
  const methods = (prefix: string, names: string[]) => Object.fromEntries(names.map((name) => [name, stub(`${prefix}.${name}`)]));
  // The real services enforce these permissions. Keep the real access check in
  // the stub while replacing only subsequent DB / AI / storage side effects.
  const guarded = (name: string, permission: string, actorFrom: (...args: any[]) => string | undefined) => async (...args: any[]) => {
    calls.push({ name, args });
    await access.requirePermission(actorFrom(...args), permission);
    effects.push({ name, args });
    return { ok: true, args };
  };

  const batchService = {
    createBatch: guarded("batch.create", "action.product.create", (input) => input.adminUserId),
    summary: guarded("batch.summary", "page.product.digitalization", (adminId) => adminId),
    ...Object.fromEntries(["listBatches", "listProducts", "batchDetail", "runBatchAi", "generateBatchBarcodes", "markBatchPrinted", "stockInBatch", "prepareBatchStorage", "publishBatch", "completeAndPublishBatch", "reviewProduct", "markProductForRecalibration", "markProductForRetake"].map((name) => [name, stub(`batch.${name}`)]))
  };
  const warehouseService = {
    listLocations: guarded("warehouse.list", "warehouse-locations.view", (input) => input.adminUserId),
    createLocation: guarded("warehouse.create", "warehouse-locations.manage", (input) => input.adminUserId),
    ...Object.fromEntries(["locationSummary", "bulkCreateLocations", "setLocationStatus", "updateCapacity", "moveInventoryItem", "inventoryOverview"].map((name) => [name, stub(`warehouse.${name}`)]))
  };
  const storage = {
    bucket: "auth-test-images",
    validate: (...args: any[]) => record("storage.validate", args),
    objectName: () => "product-1/upload.jpg",
    upload: stub("storage.upload"),
    download: async (...args: any[]) => {
      record("storage.download", args);
      return { contentType: "image/jpeg", body: Buffer.from("public image bytes") };
    }
  };
  replaceMethod(prisma.product, "findUnique", async (...args: any[]) => {
    record("product.findUnique", args);
    return { id: "product-1", status: "PHOTOGRAPHED" };
  });
  replaceMethod(prisma.productImage, "create", async ({ data }: { data: Record<string, unknown> }) => {
    record("productImage.create", [data]);
    return data;
  });
  replaceMethod(prisma.productImage, "findFirst", async () => ({
    originalUrl: "gs://auth-test-images/product-1/public.jpg"
  }));
  replaceMethod(prisma.productImageVariantAsset, "findFirst", async () => ({ storageUrl: "gs://auth-test-images/product-1/variant.jpg" }));
  replaceMethod(prisma.productDetailAsset, "findUnique", async () => ({ storageUrl: "gs://auth-test-images/product-1/detail.jpg", mimeType: "image/jpeg" }));

  class AuthenticationHttpTestModule {}
  Module({
    controllers: [OperationsProductBatchController, OperationsAnalyticsController, OperationsWarehouseLocationsController, OperationsInventoryOverviewController, ProductSetupController, ProductBarcodeController, AIJobController, ProductCalibrationController, ProductImageProcessingController, ProductDetailGenerationController, OperationsWorkspaceController, OperationsProductFactoryAdminController, OperationsProductControlController],
    providers: [
      { provide: OperationsAccessService, useValue: access },
      { provide: OperationsRequestIdentity, useValue: identity },
      { provide: OperationsProductBatchService, useValue: batchService },
      { provide: OperationsAnalyticsService, useValue: { dashboard: guarded("analytics.dashboard", "action.analytics.view", (input) => input.adminUserId) } },
      { provide: OperationsWarehouseService, useValue: warehouseService },
      { provide: ProductApplicationService, useValue: { createProductShell: stub("product.create"), getOperationsProductDetail: stub("product.detail") } },
      { provide: ProductImageStorageService, useValue: storage },
      { provide: ProductImageTransformerService, useValue: { orientUploadedImage: stub("image.orient") } },
      { provide: ProductDetailGenerationService, useValue: {
        recordSourceChange: stub("detail.sourceChange"),
        ...methods("detail", ["listDetailGenerationBatches", "getProfileDetail", "getProductDetail", "getBatchDetailStatus", "ensureBatchGenerationJobs", "retryJob", "resetBatchJobs", "approveBatch", "updateCopy", "recalculateFit", "resetOpenAiGeneration", "approveProfile", "prepareMainImageChange"])
      } },
      { provide: ProductBarcodeService, useValue: { generate: stub("barcode.generate"), getByBarcode: stub("barcode.get") } },
      { provide: AIJobService, useValue: { submit: stub("ai.submit"), get: stub("ai.get") } },
      { provide: ProductCalibrationService, useValue: methods("calibration", ["calibrate"]) },
      { provide: ProductImageProcessingService, useValue: methods("imageProcessing", ["start", "getComparison", "selectMainImage", "saveManualCutout", "saveGuidedCutout", "retry"]) },
      { provide: ProductImageJobRunnerService, useValue: methods("imageRunner", ["run"]) },
      { provide: ProductDetailGenerationRunnerService, useValue: methods("detailRunner", ["run", "runBatch"]) },
      { provide: ProductDetailAssetService, useValue: methods("detailAsset", ["generateForProfile"]) },
      { provide: OperationsWorkspaceService, useValue: methods("workspace", ["summary", "active", "start"]) },
      { provide: OperationsProductFactoryAdminService, useValue: methods("factory", ["taxonomy", "createOption", "updateOption", "configuration"]) },
      { provide: OperationsProductControlService, useValue: methods("control", ["summary", "list", "locations", "setPrice", "prepareForStorage", "assignRandomLocation", "confirmPlaced", "publish", "unpublish", "markLabelsPrinted"]) }
    ]
  })(AuthenticationHttpTestModule);
  const app = await NestFactory.create(AuthenticationHttpTestModule, { logger: false, abortOnError: false });
  t.after(async () => { await app.close(); });
  await app.listen(0, "127.0.0.1");
  const baseUrl = await app.getUrl();

  const tokenFor = (value = actor, now?: Date) => issueOperationsAccessToken(value.id, value.passwordHash, now).accessToken;
  async function request(route: Route, token?: string) {
    const headers: Record<string, string> = {
      "x-admin-user-id": forgedAdminId,
      "x-employee-id": forgedEmployeeId,
      ...(token ? { authorization: `Bearer ${token}` } : {})
    };
    let body: string | undefined;
    if (route.binary) {
      headers["content-type"] = "image/jpeg";
      headers["x-image-type"] = "FRONT";
      body = "fixture image bytes";
    } else if (route.method !== "GET") {
      headers["content-type"] = "application/json";
      body = JSON.stringify({ ...route.body, adminUserId: forgedAdminId, employeeId: forgedEmployeeId });
    }
    const response = await fetch(`${baseUrl}${route.path}?adminUserId=${forgedAdminId}&employeeId=${forgedEmployeeId}`, {
      method: route.method, headers, body
    });
    return { status: response.status, body: await response.json() as any };
  }
  function reset() {
    calls.length = 0;
    effects.length = 0;
    authLookups.length = 0;
  }

  await t.test("forged IDs alone cannot read or mutate any digitalization route", async () => {
    for (const route of protectedRoutes) {
      reset();
      const response = await request(route);
      assert.equal(response.status, 401, `${route.method} ${route.path}: ${JSON.stringify(response.body)}`);
      assert.deepEqual(calls, [], `${route.path} invoked domain/storage code before authentication`);
      assert.deepEqual(effects, []);
      assert.deepEqual(authLookups, [], "forged IDs must not even select an admin account");
    }
  });

  await t.test("malformed, wrong-signature, expired and unknown-account tokens fail before reads or writes", async () => {
    const invalidTokens = [
      "not-an-access-token",
      issueOperationsAccessToken(actor.id, "incorrect-signing-key").accessToken,
      tokenFor(actor, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      issueOperationsAccessToken("missing-admin", "missing-password-hash").accessToken
    ];
    for (const token of invalidTokens) {
      for (const route of [batchCreate, productCreate, imageUpload, aiSubmit, barcodeRead, analyticsRead, warehouseCreate]) {
        reset();
        const response = await request(route, token);
        assert.equal(response.status, 401, `${route.path}: ${JSON.stringify(response.body)}`);
        assert.deepEqual(calls, []);
        assert.deepEqual(effects, []);
      }
    }
  });

  await t.test("disabling an account or changing its password revokes an already issued token", async () => {
    const token = tokenFor();
    for (const status of ["DISABLED", "LOCKED"]) {
      actor.status = status;
      try {
        for (const route of [batchCreate, imageUpload, aiSubmit, warehouseRead]) {
          reset();
          assert.equal((await request(route, token)).status, 401);
          assert.deepEqual(calls, []);
          assert.deepEqual(effects, []);
        }
      } finally {
        actor.status = "ACTIVE";
      }
    }
    const originalHash = actor.passwordHash;
    actor.passwordHash = "replacement-password-hash";
    try {
      reset();
      assert.equal((await request(productCreate, token)).status, 401);
      assert.deepEqual(calls, []);
      assert.deepEqual(effects, []);
    } finally {
      actor.passwordHash = originalHash;
    }
  });

  await t.test("a real restricted token cannot borrow permissions from forged admin IDs", async () => {
    for (const route of [batchCreate, productCreate, imageUpload, aiSubmit, barcodeRead, analyticsRead, warehouseCreate]) {
      reset();
      const response = await request(route, tokenFor(restricted));
      assert.equal(response.status, 403, `${route.path}: ${JSON.stringify(response.body)}`);
      assert.deepEqual(effects, [], `${route.path} performed work despite missing permission`);
      assert.ok(authLookups.length > 0);
      assert.ok(authLookups.every((id) => id === restricted.id), "permission lookup used a forged admin ID");
    }
  });

  await t.test("valid tokens bind batch and AI identity to the authenticated admin", async () => {
    for (const [route, expectedCall] of [[batchCreate, "batch.create"], [aiSubmit, "ai.submit"]] as const) {
      reset();
      const response = await request(route, tokenFor());
      assert.equal(response.status, 201, JSON.stringify(response.body));
      const invocation = calls.find((call) => call.name === expectedCall);
      assert.ok(invocation);
      assert.equal(invocation.args[0].adminUserId, actor.id);
      if (expectedCall === "batch.create") assert.equal(invocation.args[0].employeeId, employee.id);
      assert.ok(authLookups.every((id) => id === actor.id));
    }
    reset();
    assert.equal((await request(productCreate, tokenFor())).status, 201);
    assert.equal(calls.find((call) => call.name === "product.create")?.args[0].createdByEmployeeId, employee.id);
  });

  await t.test("binary upload ignores a forged employee header and records the signed-in employee", async () => {
    reset();
    const response = await request(imageUpload, tokenFor());
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(calls.find((call) => call.name === "productImage.create")?.args[0].uploadedByEmployeeId, employee.id);
    assert.equal(calls.filter((call) => call.name === "storage.upload").length, 1);
    assert.ok(authLookups.every((id) => id === actor.id));
  });

  await t.test("valid read and warehouse requests ignore caller-provided admin identity", async () => {
    for (const [route, expectedCall, directId] of [
      [batchSummary, "batch.summary", true],
      [analyticsRead, "analytics.dashboard", false],
      [warehouseRead, "warehouse.list", false],
      [warehouseCreate, "warehouse.create", false]
    ] as const) {
      reset();
      const response = await request(route, tokenFor());
      assert.equal(response.status, route.method === "GET" ? 200 : 201, JSON.stringify(response.body));
      const invocation = calls.find((call) => call.name === expectedCall);
      assert.ok(invocation);
      assert.equal(directId ? invocation.args[0] : invocation.args[0].adminUserId, actor.id);
      assert.ok(authLookups.every((id) => id === actor.id));
    }
    reset();
    assert.equal((await request(barcodeRead, tokenFor())).status, 200);
    assert.deepEqual(calls.find((call) => call.name === "barcode.get")?.args, ["920260910001"]);
  });

  await t.test("product work requires an active linked employee even when the admin token is valid", async () => {
    const originalEmployeeId = actor.linkedEmployeeId;
    actor.linkedEmployeeId = "missing-employee";
    try {
      for (const route of [batchCreate, productCreate, imageUpload]) {
        reset();
        assert.equal((await request(route, tokenFor())).status, 403);
        assert.deepEqual(calls, []);
        assert.deepEqual(effects, []);
      }
    } finally {
      actor.linkedEmployeeId = originalEmployeeId;
    }
    employee.status = "INACTIVE";
    try {
      reset();
      assert.equal((await request(productCreate, tokenFor())).status, 403);
      assert.deepEqual(calls, []);
      assert.deepEqual(effects, []);
    } finally {
      employee.status = "ACTIVE";
    }
  });

  await t.test("public original, processed and detail image bytes remain accessible without an employee session", async () => {
    for (const path of ["/products/product-1/images/image-1/content", "/products/product-1/image-assets/asset-1/content", "/product-detail-assets/asset-1/content"]) {
      reset();
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /^image\/jpeg/);
      assert.equal(await response.text(), "public image bytes");
      assert.deepEqual(authLookups, []);
      assert.deepEqual(calls.map((call) => call.name), ["storage.download"]);
    }
  });
});
