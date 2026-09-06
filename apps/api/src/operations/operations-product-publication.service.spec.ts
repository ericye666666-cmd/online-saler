import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { ProductStatus, prisma } from "@online-saler/database";
import { OperationsProductBatchService } from "./operations-product-batch.service";
import { OperationsProductControlService } from "./operations-product-control.service";

const originals = {
  productFind: prisma.product.findUnique,
  productsFind: prisma.product.findMany,
  productCount: prisma.product.count,
  batchFind: prisma.productBatch.findUnique,
  batchUpdate: prisma.productBatch.update,
  selectionFind: prisma.productMainImageSelection.findUnique,
  assetFind: prisma.productImageVariantAsset.findFirst,
  auditCreate: prisma.auditLog.create,
  transaction: prisma.$transaction
};
const now = new Date("2026-09-06T12:00:00Z");
const actor = { employeeId: "employee-1", adminUserId: "admin-1" };

function product(id = "product-1", status: ProductStatus = ProductStatus.READY_FOR_STORAGE) {
  return {
    id, productCode: id, batchId: "batch-1", status, barcode: `BC-${id}`, labelPrintedAt: now,
    title: "Canvas bag", category: "BAG", finalSizeLabel: "One size", conditionGrade: "GOOD", priceKsh: 500,
    images: [{ id: `image-${id}` }], measurements: [], reviews: [{ result: "APPROVED", createdAt: now }],
    inventoryItem: {
      id: `inventory-${id}`, barcode: `BC-${id}`, status: "AVAILABLE", locationId: "shelf-1", checkedInAt: now
    }
  };
}

let records: ReturnType<typeof product>[];
let imageSelections: Map<string, { variant: string; selectedImageId: string; confirmedAt: Date | null }>;
let missingAssets: Set<string>;
let transitions: Array<{ productId: string; toStatus: ProductStatus; review?: { result: string } }>;
let control: OperationsProductControlService;
let batches: OperationsProductBatchService;
let detailApprovals: number;
let mainConfirmations: string[];

beforeEach(() => {
  records = [product()];
  imageSelections = new Map();
  missingAssets = new Set();
  transitions = [];
  detailApprovals = 0;
  mainConfirmations = [];
  prisma.product.findUnique = (async ({ where }: { where: { id: string } }) => records.find((item) => item.id === where.id) ?? null) as never;
  prisma.product.findMany = (async () => records) as never;
  prisma.product.count = (async () => records.filter((item) => item.status !== ProductStatus.PUBLISHED).length) as never;
  prisma.productBatch.findUnique = (async () => ({ id: "batch-1", targetCount: records.length, products: records })) as never;
  prisma.productBatch.update = (async () => ({})) as never;
  prisma.auditLog.create = (async () => ({})) as never;
  prisma.productMainImageSelection.findUnique = (async ({ where }: { where: { productId: string } }) =>
    imageSelections.get(where.productId) ?? { variant: "AI_DISPLAY_MAIN", selectedImageId: `ai-${where.productId}`, confirmedAt: now }
  ) as never;
  prisma.productImageVariantAsset.findFirst = (async ({ where }: { where: { id: string; productId: string } }) =>
    missingAssets.has(where.productId) ? null : { id: where.id }
  ) as never;
  const access = { requirePermission: async () => ({ adminUser: { id: actor.adminUserId } }) };
  const products = {
    transitionProduct: async (command: typeof transitions[number]) => {
      transitions.push(command);
      const item = records.find((entry) => entry.id === command.productId)!;
      item.status = command.toStatus;
      return item;
    }
  };
  control = new OperationsProductControlService(products as never, access as never);
  batches = new OperationsProductBatchService(access as never, {} as never, {} as never, products as never,
    control, { approveBatch: async () => { detailApprovals++; } } as never, {
      getComparison: async (id: string) => ({ aiDisplayMain: missingAssets.has(id) ? null : { imageId: `ai-${id}` } }),
      selectMainImage: async (selection: { productId: string }) => { mainConfirmations.push(selection.productId); }
    } as never);
  batches.batchDetail = (async () => ({ id: "batch-1" })) as never;
});

afterEach(() => {
  prisma.product.findUnique = originals.productFind;
  prisma.product.findMany = originals.productsFind;
  prisma.product.count = originals.productCount;
  prisma.productBatch.findUnique = originals.batchFind;
  prisma.productBatch.update = originals.batchUpdate;
  prisma.productMainImageSelection.findUnique = originals.selectionFind;
  prisma.productImageVariantAsset.findFirst = originals.assetFind;
  prisma.auditLog.create = originals.auditCreate;
  prisma.$transaction = originals.transaction;
});

test("single-item publication rejects missing, unconfirmed, non-AI and deleted display assets", async () => {
  for (const selection of [
    { variant: "ORIGINAL", selectedImageId: "front-1", confirmedAt: now },
    { variant: "AI_DISPLAY_MAIN", selectedImageId: "ai-1", confirmedAt: null }
  ]) {
    imageSelections.set("product-1", selection);
    await assert.rejects(control.publish("product-1", actor), /Confirm the AI display/);
  }
  prisma.productMainImageSelection.findUnique = (async () => null) as never;
  await assert.rejects(control.publish("product-1", actor), /Confirm the AI display/);
  prisma.productMainImageSelection.findUnique = (async () => ({ variant: "AI_DISPLAY_MAIN", selectedImageId: "deleted", confirmedAt: now })) as never;
  missingAssets.add("product-1");
  await assert.rejects(control.publish("product-1", actor), /Confirm the AI display/);
  assert.equal(transitions.length, 0);
});

test("single-item and republish paths require current review and physical inventory evidence", async () => {
  const scenarios = [
    { ...product(), barcode: null },
    { ...product(), labelPrintedAt: null },
    { ...product(), reviews: [] },
    { ...product(), reviews: [{ result: "REWORK_REQUIRED", createdAt: new Date(now.getTime() + 1) }, ...product().reviews] },
    { ...product(), inventoryItem: { ...product().inventoryItem, locationId: null } },
    { ...product(), inventoryItem: { ...product().inventoryItem, checkedInAt: null } },
    { ...product(), inventoryItem: { ...product().inventoryItem, barcode: "ANOTHER-ITEM" } },
    { ...product(), inventoryItem: { ...product().inventoryItem, status: "RESERVED" } }
  ];
  for (const invalid of scenarios) {
    records = [invalid as never];
    await assert.rejects(control.publish("product-1", actor));
    records[0].status = ProductStatus.UNPUBLISHED;
    await assert.rejects(control.publish("product-1", actor));
  }
  assert.equal(transitions.length, 0);
  records = [product()];
  await control.publish("product-1", actor);
  assert.equal(transitions.at(-1)?.toStatus, ProductStatus.PUBLISHED);
});

test("review approval requires confirmed AI evidence but does not require stock-in before review", async () => {
  records = [product("product-1", ProductStatus.REVIEW_PENDING)];
  records[0].inventoryItem.status = "PENDING_STOCK_IN";
  records[0].inventoryItem.checkedInAt = null as never;
  imageSelections.set("product-1", { variant: "ORIGINAL", selectedImageId: "front-1", confirmedAt: now });
  await assert.rejects(batches.reviewProduct("product-1", { ...actor, result: "APPROVED" }), /Confirm the AI/);
  assert.equal(transitions.length, 0);
  imageSelections.clear();
  await batches.reviewProduct("product-1", { ...actor, result: "APPROVED" });
  assert.equal(transitions[0].review?.result, "APPROVED", "the review must be committed with the status change");
  assert.equal(records[0].status, ProductStatus.APPROVED);
  await assert.rejects(batches.reviewProduct("product-1", { ...actor, result: "APPROVED" }), /waiting for review/);
  assert.equal(transitions.length, 1);
});

test("batch publication validates every unfinished item before publishing the first", async () => {
  records = [product("first"), product("second")];
  missingAssets.add("second");
  await assert.rejects(batches.publishBatch("batch-1", actor), /Confirm the AI display/);
  assert.equal(transitions.length, 0);
});

test("a returned item in REVIEW_PENDING can be reviewed and republished using its inspected available stock", async () => {
  records = [product("returned", ProductStatus.REVIEW_PENDING)];
  await batches.reviewProduct("returned", { ...actor, result: "APPROVED" });
  await control.prepareForStorage("returned", actor);
  await control.publish("returned", actor);
  assert.deepEqual(transitions.map((command) => command.toStatus), ["APPROVED", "READY_FOR_STORAGE", "PUBLISHED"]);
  assert.equal(records[0].inventoryItem.checkedInAt, now);
  assert.equal(records[0].inventoryItem.status, "AVAILABLE");
});

test("partial batch retry resumes unfinished items without restocking already sold products", async () => {
  records = [product("sold", ProductStatus.PUBLISHED), product("ready")];
  records[0].inventoryItem.status = "SOLD";
  records[0].inventoryItem.locationId = null as never;
  const prepared: string[] = [];
  const stocked: string[] = [];
  control.prepareForStorage = (async (id: string) => { prepared.push(id); return records.find((item) => item.id === id); }) as never;
  control.assignBatchLocations = (async (ids: string[]) => { assert.deepEqual(ids, ["ready"]); return []; }) as never;
  control.confirmPlaced = (async (id: string) => { stocked.push(id); return records.find((item) => item.id === id); }) as never;
  await batches.completeAndPublishBatch("batch-1", actor);
  assert.deepEqual(prepared, ["ready"]);
  assert.deepEqual(stocked, ["ready"]);
  assert.deepEqual(transitions.map((command) => command.productId), ["ready"]);
  assert.equal(records[0].inventoryItem.status, "SOLD");
  assert.equal(detailApprovals, 0);
  assert.deepEqual(mainConfirmations, []);
  await batches.completeAndPublishBatch("batch-1", actor);
  assert.equal(transitions.length, 1, "a fully completed retry must not write another state change");
});

test("batch completion does not auto-confirm earlier items if a later AI image is missing", async () => {
  records = [product("first", ProductStatus.REVIEW_PENDING), product("second", ProductStatus.REVIEW_PENDING)];
  missingAssets.add("second");
  await assert.rejects(batches.completeAndPublishBatch("batch-1", actor), /missing its AI display image/);
  assert.deepEqual(mainConfirmations, []);
  assert.equal(detailApprovals, 0);
  assert.equal(transitions.length, 0);
});

test("batch completion cannot use an approved status to bypass current AI-image confirmation", async () => {
  records = [product("product-1", ProductStatus.APPROVED)];
  imageSelections.set("product-1", { variant: "AI_DISPLAY_MAIN", selectedImageId: "regenerated", confirmedAt: null });
  await assert.rejects(batches.completeAndPublishBatch("batch-1", actor), /Confirm the AI/);
  assert.deepEqual(mainConfirmations, []);
  assert.equal(transitions.length, 0);
});

test("stock-in rejects reserved or sold inventory and does not mutate published products", async () => {
  control.assignRandomLocation = (async () => records[0]) as never;
  let writes = 0;
  prisma.$transaction = (async () => { writes++; }) as never;
  for (const status of ["RESERVED", "SOLD", "REMOVED"]) {
    records[0].inventoryItem.status = status;
    await assert.rejects(control.confirmPlaced("product-1", actor), /Only pending stock-in/);
  }
  records[0].status = ProductStatus.PUBLISHED;
  await assert.rejects(control.confirmPlaced("product-1", actor), /Only storage-ready/);
  assert.equal(writes, 0);
});

test("stock-in requires a conditional update and aborts when inventory changes during confirmation", async () => {
  records[0].inventoryItem.status = "PENDING_STOCK_IN";
  control.assignRandomLocation = (async () => records[0]) as never;
  let movements = 0;
  prisma.$transaction = (async (callback: (client: unknown) => Promise<unknown>) => callback({
    inventoryItem: {
      updateMany: async ({ where }: { where: Record<string, unknown> }) => {
        assert.equal(where.status, "PENDING_STOCK_IN");
        assert.equal(where.locationId, "shelf-1");
        assert.deepEqual(where.product, { status: "READY_FOR_STORAGE" });
        return { count: 0 };
      }
    },
    inventoryMovement: { create: async () => { movements++; } }
  })) as never;
  await assert.rejects(control.confirmPlaced("product-1", actor), /Inventory changed/);
  assert.equal(movements, 0);
});
