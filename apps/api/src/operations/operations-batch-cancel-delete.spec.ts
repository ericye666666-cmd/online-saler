import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { InventoryItemStatus, ProductBatchStatus, ProductStatus, prisma } from "@online-saler/database";
import { OperationsProductBatchService } from "./operations-product-batch.service";

type Row = {
  id: string;
  productCode: string;
  batchId: string;
  status: ProductStatus;
  inventoryItem: { id: string; status: InventoryItemStatus; locationId: string | null; location: { locationCode: string } | null } | null;
};

const originalTransaction = prisma.$transaction;

let products: Row[];
let orderLines: string[];
let deletedIds: string[];
let imageDeletes: string[];
let archivedIds: string[];
let audits: Array<{ action: string; beforeJson?: unknown; afterJson?: unknown }>;
let batchStatus: ProductBatchStatus;
let service: OperationsProductBatchService;

function row(id: string, status: ProductStatus, locationId: string | null = null): Row {
  return {
    id,
    productCode: `BATCH-1-${id}`,
    batchId: "batch-1",
    status,
    inventoryItem: locationId
      ? { id: `item-${id}`, status: InventoryItemStatus.PENDING_STOCK_IN, locationId, location: { locationCode: `${locationId}-01` } }
      : null
  };
}

function fakeTransaction() {
  const imageTable = (name: string) => ({
    deleteMany: async ({ where }: { where: { productId: { in: string[] } } }) => {
      imageDeletes.push(`${name}:${where.productId.in.join(",")}`);
      return { count: 0 };
    }
  });
  return {
    productBatch: {
      findUnique: async () => ({ id: "batch-1", batchCode: "BATCH-1", status: batchStatus }),
      update: async ({ data }: { data: { status: ProductBatchStatus } }) => { batchStatus = data.status; return {}; }
    },
    product: {
      findMany: async () => products.map((item) => ({ ...item })),
      deleteMany: async ({ where }: { where: { id: string; status: ProductStatus } }) => {
        const index = products.findIndex((item) => item.id === where.id && item.status === where.status);
        if (index < 0) return { count: 0 };
        deletedIds.push(where.id);
        products.splice(index, 1);
        return { count: 1 };
      },
      updateMany: async ({ where, data }: { where: { id: string; status: ProductStatus }; data: { status: ProductStatus } }) => {
        const item = products.find((entry) => entry.id === where.id && entry.status === where.status);
        if (!item) return { count: 0 };
        item.status = data.status;
        archivedIds.push(item.id);
        return { count: 1 };
      }
    },
    orderItem: {
      groupBy: async () => [...new Set(orderLines)].map((productId) => ({ productId, _count: { _all: 1 } }))
    },
    productImageVariantAsset: imageTable("variant"),
    productImageProcessingJob: imageTable("job"),
    productMainImageSelection: imageTable("selection"),
    inventoryItem: { update: async () => ({}), findMany: async () => [], groupBy: async () => [] },
    inventoryMovement: { create: async () => ({}) },
    warehouseLocation: { findMany: async () => [], updateMany: async () => ({ count: 0 }), update: async () => ({}) },
    auditLog: {
      create: async ({ data }: { data: { action: string; beforeJson?: unknown; afterJson?: unknown } }) => { audits.push(data); return {}; }
    }
  };
}

beforeEach(() => {
  products = [];
  orderLines = [];
  deletedIds = [];
  imageDeletes = [];
  archivedIds = [];
  audits = [];
  batchStatus = ProductBatchStatus.OPEN;
  prisma.$transaction = (async (callback: (transaction: unknown) => unknown) => callback(fakeTransaction())) as never;
  const access = { requirePermission: async () => ({ adminUser: { id: "admin-1" } }) };
  service = new OperationsProductBatchService(access as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
});

afterEach(() => {
  prisma.$transaction = originalTransaction;
});

test("cancelling a batch deletes its unfinished items as if never entered", async () => {
  products = [row("01", ProductStatus.DRAFT), row("02", ProductStatus.CALIBRATED), row("03", ProductStatus.BARCODE_ASSIGNED, "A")];

  const result = await service.cancelBatch("batch-1", { employeeId: "employee-1", reason: "Wrong stock" });

  assert.deepEqual(deletedIds, ["01", "02", "03"]);
  assert.deepEqual(archivedIds, []);
  assert.equal(result.deletedCount, 3);
  assert.equal(result.archivedCount, 0);
  assert.equal(batchStatus, ProductBatchStatus.CANCELLED);
  // The image tables without a foreign key are cleaned up for exactly those items.
  assert.deepEqual(imageDeletes, ["variant:01,02,03", "job:01,02,03", "selection:01,02,03"]);
  // The garment that held a shelf slot is still reported so staff can take it down.
  assert.deepEqual(result.releasedShelves.map((shelf) => shelf.productCode), ["BATCH-1-03"]);
});

test("items that already went live or were already rejected stay", async () => {
  products = [
    row("01", ProductStatus.DRAFT),
    row("02", ProductStatus.PUBLISHED),
    row("03", ProductStatus.UNPUBLISHED),
    row("04", ProductStatus.ARCHIVED)
  ];

  const result = await service.cancelBatch("batch-1", { employeeId: "employee-1", reason: "Wrong stock" });

  assert.deepEqual(deletedIds, ["01"]);
  assert.deepEqual(products.map((item) => [item.id, item.status]), [
    ["02", ProductStatus.PUBLISHED],
    ["03", ProductStatus.UNPUBLISHED],
    ["04", ProductStatus.ARCHIVED]
  ]);
  assert.equal(result.keptCount, 3);
});

test("an unfinished item that was on a customer order is archived, not deleted", async () => {
  products = [row("01", ProductStatus.DRAFT), row("02", ProductStatus.READY_FOR_STORAGE)];
  orderLines = ["02"];

  const result = await service.cancelBatch("batch-1", { employeeId: "employee-1", reason: "Wrong stock" });

  assert.deepEqual(deletedIds, ["01"]);
  assert.deepEqual(archivedIds, ["02"]);
  assert.deepEqual(result.archivedProductCodes, ["BATCH-1-02"]);
  assert.equal(products.find((item) => item.id === "02")?.status, ProductStatus.ARCHIVED);
});

test("the deletion is written to the audit log with every deleted product code", async () => {
  products = [row("01", ProductStatus.DRAFT), row("02", ProductStatus.CALIBRATED)];

  await service.cancelBatch("batch-1", { employeeId: "employee-1", reason: "Wrong stock" });

  const entry = audits.find((audit) => audit.action === "PRODUCT_BATCH_CANCEL_DELETE");
  assert.ok(entry, "expected a PRODUCT_BATCH_CANCEL_DELETE audit entry");
  assert.deepEqual((entry.afterJson as { deletedProductCodes: string[] }).deletedProductCodes, ["BATCH-1-01", "BATCH-1-02"]);
  const cancelled = audits.find((audit) => audit.action === "PRODUCT_BATCH_CANCELLED");
  assert.deepEqual((cancelled?.afterJson as { deletedProductIds: string[] }).deletedProductIds, ["01", "02"]);
});

test("a dry run reports the plan and changes nothing", async () => {
  products = [row("01", ProductStatus.DRAFT), row("02", ProductStatus.CALIBRATED)];
  orderLines = ["02"];

  const result = await service.cancelBatch("batch-1", { employeeId: "employee-1", dryRun: true });

  assert.equal(result.dryRun, true);
  assert.equal(result.deletedCount, 1);
  assert.deepEqual(result.archivedProductCodes, ["BATCH-1-02"]);
  assert.deepEqual(deletedIds, []);
  assert.deepEqual(archivedIds, []);
  assert.deepEqual(audits, []);
  assert.equal(batchStatus, ProductBatchStatus.OPEN);
});
