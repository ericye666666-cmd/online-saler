import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { ProductStatus, prisma } from "@online-saler/database";
import { OperationsProductBatchService } from "./operations-product-batch.service";

// Every status a garment can be in, one product each. The fake findMany applies the status part of
// the where clause the way Postgres would, so the test sees exactly what the page would get.
const everyStatus = Object.values(ProductStatus).map((status) => ({ id: `product-${status}`, status }));

const originalFindMany = prisma.product.findMany;
let lastWhere: Record<string, unknown> | undefined;
let service: OperationsProductBatchService;

function matchesStatus(status: ProductStatus, filter: unknown): boolean {
  if (filter === undefined) return true;
  if (typeof filter === "string") return status === filter;
  const list = (filter as { in?: ProductStatus[] }).in;
  return Array.isArray(list) ? list.includes(status) : false;
}

beforeEach(() => {
  lastWhere = undefined;
  prisma.product.findMany = (async ({ where }: { where: Record<string, unknown> }) => {
    lastWhere = where;
    return everyStatus.filter((product) => matchesStatus(product.status, where.status));
  }) as never;
  const access = { requirePermission: async () => ({ adminUser: { id: "admin-1" } }) };
  service = new OperationsProductBatchService(access as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
});

afterEach(() => {
  prisma.product.findMany = originalFindMany;
});

async function statusesListed(input: Parameters<OperationsProductBatchService["listProducts"]>[0]) {
  const rows = (await service.listProducts(input)) as unknown as Array<{ status: ProductStatus }>;
  return rows.map((row) => row.status);
}

test("商品管理 lists only live products by default", async () => {
  assert.deepEqual(await statusesListed({ adminUserId: "admin-1", queue: "managed" }), [ProductStatus.PUBLISHED]);
});

test("商品管理 lists only taken-down products when 已下架 is picked", async () => {
  assert.deepEqual(
    await statusesListed({ adminUserId: "admin-1", queue: "managed", status: ProductStatus.UNPUBLISHED }),
    [ProductStatus.UNPUBLISHED]
  );
});

test("商品管理 never lists items still in intake, review, storage or rejected", async () => {
  for (const status of Object.values(ProductStatus)) {
    if (status === ProductStatus.PUBLISHED || status === ProductStatus.UNPUBLISHED) continue;
    await assert.rejects(
      service.listProducts({ adminUserId: "admin-1", queue: "managed", status }),
      /only lists PUBLISHED or UNPUBLISHED/,
      `${status} leaked into 商品管理`
    );
  }
});

test("商品管理 keeps search and the other filters on top of the status", async () => {
  await service.listProducts({ adminUserId: "admin-1", queue: "managed", search: "SHIRT", batchId: "batch-1" });
  assert.equal(lastWhere?.status, ProductStatus.PUBLISHED);
  assert.equal(lastWhere?.batchId, "batch-1");
  assert.ok(Array.isArray(lastWhere?.OR));
});

test("other product pages keep the old queue and single-status parameters", async () => {
  assert.equal((await statusesListed({ adminUserId: "admin-1", queue: "all" })).length, everyStatus.length);
  assert.deepEqual(await statusesListed({ adminUserId: "admin-1", queue: "all", status: ProductStatus.CALIBRATION_PENDING }), [ProductStatus.CALIBRATION_PENDING]);
  assert.deepEqual(await statusesListed({ adminUserId: "admin-1", queue: "rejected" }), [ProductStatus.ARCHIVED]);
  assert.deepEqual(
    await statusesListed({ adminUserId: "admin-1", queue: "calibration" }),
    [ProductStatus.AI_PROCESSED, ProductStatus.CALIBRATION_PENDING, ProductStatus.CALIBRATED]
  );
});
