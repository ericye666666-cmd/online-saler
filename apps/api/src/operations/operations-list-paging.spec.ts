import "reflect-metadata";
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { FulfillmentStatus, ProductStatus, prisma } from "@online-saler/database";
import { DEFAULT_LIST_PAGE_SIZE, MAX_LIST_PAGE_SIZE, listPageRequest, listPageWindow } from "./list-page";
import { OperationsProductBatchService } from "./operations-product-batch.service";
import { OperationsFulfillmentService, fulfillmentStatusFilter, orderItemImageUrls } from "./operations-fulfillment.service";
import type { OperationsAccessService } from "./operations-access.service";
import type { ProductImageStorageService } from "../product/product-image-storage.service";

/**
 * 商品管理, 订单中心 and 每日打单配送 show 30 rows a page and say how many
 * match in total, so every matching row is reachable and none is loaded twice.
 * The fakes below apply the status filter, skip and take the way Postgres would.
 */

type Row = { id: string; status: string };
type FindArgs = { where?: Record<string, unknown>; skip?: number; take?: number };

function statusMatches(status: string, filter: unknown): boolean {
  if (filter === undefined) return true;
  if (typeof filter === "string") return status === filter;
  const list = (filter as { in?: string[] }).in;
  return Array.isArray(list) ? list.includes(status) : false;
}

function page<T>(rows: T[], args: FindArgs): T[] {
  const start = args.skip ?? 0;
  return rows.slice(start, args.take === undefined ? undefined : start + args.take);
}

// ——— Products ———

// 75 live garments and 5 taken down: three pages of live ones, the last one short.
const products: Row[] = [
  ...Array.from({ length: 75 }, (_, index) => ({ id: `live-${String(index + 1).padStart(3, "0")}`, status: ProductStatus.PUBLISHED })),
  ...Array.from({ length: 5 }, (_, index) => ({ id: `down-${index + 1}`, status: ProductStatus.UNPUBLISHED }))
];

const originals = {
  productFindMany: prisma.product.findMany,
  productCount: prisma.product.count,
  orderFindMany: prisma.order.findMany,
  orderCount: prisma.order.count
};
let productFinds: FindArgs[] = [];
let productService: OperationsProductBatchService;

function productsMatching(where: Record<string, unknown> = {}) {
  return products.filter((product) => statusMatches(product.status, where.status));
}

beforeEach(() => {
  productFinds = [];
  prisma.product.findMany = (async (args: FindArgs) => {
    productFinds.push(args);
    return page(productsMatching(args.where), args);
  }) as never;
  prisma.product.count = (async (args: FindArgs) => productsMatching(args.where).length) as never;
  const access = { requirePermission: async () => ({ adminUser: { id: "admin-1" } }) };
  productService = new OperationsProductBatchService(access as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
});

afterEach(() => {
  prisma.product.findMany = originals.productFindMany;
  prisma.product.count = originals.productCount;
  prisma.order.findMany = originals.orderFindMany;
  prisma.order.count = originals.orderCount;
});

type Paged = { items: Row[]; total: number; page: number; pageSize: number; pageCount: number };

async function managedPage(input: Partial<Parameters<OperationsProductBatchService["listProducts"]>[0]>) {
  return (await productService.listProducts({ adminUserId: "admin-1", queue: "managed", ...input })) as unknown as Paged;
}

test("商品管理 returns 30 per page with the total of every match", async () => {
  const first = await managedPage({ page: "1" });
  assert.equal(first.items.length, 30);
  assert.equal(first.pageSize, 30);
  assert.equal(first.total, 75);
  assert.equal(first.pageCount, 3);
  assert.equal(first.items[0]?.id, "live-001");
});

test("商品管理 reaches every live item, past the old 200 cap, with no repeats", async () => {
  const seen: string[] = [];
  for (let current = 1; current <= 3; current += 1) {
    const result = await managedPage({ page: String(current) });
    assert.equal(result.page, current);
    seen.push(...result.items.map((item) => item.id));
  }
  assert.equal(seen.length, 75);
  assert.equal(new Set(seen).size, 75);
  assert.equal((await managedPage({ page: "3" })).items.length, 15);
});

test("商品管理 answers a page past the end with the last page", async () => {
  const result = await managedPage({ page: "9" });
  assert.equal(result.page, 3);
  assert.equal(result.total, 75);
  assert.deepEqual(result.items.map((item) => item.id), products.slice(60, 75).map((item) => item.id));
});

test("商品管理 pages within the filter: 已下架 has its own total", async () => {
  const result = await managedPage({ page: "1", status: ProductStatus.UNPUBLISHED, search: "down", batchId: "batch-1" });
  assert.equal(result.total, 5);
  assert.equal(result.pageCount, 1);
  assert.ok(result.items.every((item) => item.status === ProductStatus.UNPUBLISHED));
  const where = productFinds[0]?.where ?? {};
  assert.equal(where.batchId, "batch-1");
  assert.ok(Array.isArray(where.OR), "search is still applied on the paged list");
});

test("an empty filter is one empty page, without reading any rows", async () => {
  prisma.product.count = (async () => 0) as never;
  const result = await managedPage({ page: "1" });
  assert.deepEqual(result, { items: [], total: 0, page: 1, pageSize: 30, pageCount: 1 });
  assert.equal(productFinds.length, 0);
});

test("the intake queues that do not ask for a page still get the plain capped list", async () => {
  const rows = await productService.listProducts({ adminUserId: "admin-1", queue: "all" });
  assert.ok(Array.isArray(rows));
  assert.equal(productFinds[0]?.take, 200);
});

test("the CSV export may ask for large pages, but never more than 200 at a time", async () => {
  const result = await managedPage({ page: "1", pageSize: "5000" });
  assert.equal(result.pageSize, MAX_LIST_PAGE_SIZE);
  assert.equal(result.items.length, 75);
});

// ——— Orders ———

const orders: Array<Row & { fulfillment: { status: FulfillmentStatus } }> = Array.from({ length: 64 }, (_, index) => ({
  id: `order-${String(index + 1).padStart(3, "0")}`,
  status: "PAID",
  fulfillment: { status: index < 40 ? FulfillmentStatus.PAID : FulfillmentStatus.PACKED }
}));

function ordersMatching(where: unknown) {
  const text = JSON.stringify(where ?? {});
  if (text.includes('"in":["PACKED"]')) return orders.filter((order) => order.fulfillment.status === FulfillmentStatus.PACKED);
  if (text.includes('"in":["PAID"]')) return orders.filter((order) => order.fulfillment.status === FulfillmentStatus.PAID);
  return orders;
}

function orderService() {
  prisma.order.findMany = (async (args: FindArgs) => page(ordersMatching(args.where), args)) as never;
  prisma.order.count = (async (args: FindArgs) => ordersMatching(args.where).length) as never;
  const session = { adminUser: { id: "admin", linkedEmployee: null }, permissions: ["orders.view"] };
  const access = { requirePermission: async () => session, session: async () => session } as unknown as OperationsAccessService;
  const service = new OperationsFulfillmentService(access, {} as ProductImageStorageService);
  Object.assign(service as unknown as Record<string, unknown>, {
    ensurePaidFulfillments: async () => undefined,
    attachInventory: async (rows: unknown[]) => rows
  });
  return service;
}

test("订单中心 returns 30 orders a page with the tab's total", async () => {
  const result = (await orderService().listOrders({ adminUserId: "admin", scope: "all", tab: "all", page: "1" })) as unknown as Paged;
  assert.equal(result.items.length, 30);
  assert.equal(result.total, 64);
  assert.equal(result.pageCount, 3);
  const last = (await orderService().listOrders({ adminUserId: "admin", scope: "all", tab: "all", page: "3" })) as unknown as Paged;
  assert.equal(last.items.length, 4);
  const beyond = (await orderService().listOrders({ adminUserId: "admin", scope: "all", tab: "all", page: "7" })) as unknown as Paged;
  assert.equal(beyond.page, 3);
});

test("每日打单配送 pages one step at a time", async () => {
  const packed = (await orderService().listOrders({ adminUserId: "admin", scope: "workbench", tab: "all", fulfillmentStatus: "PACKED", page: "1" })) as unknown as Paged;
  assert.equal(packed.total, 24);
  assert.equal(packed.items.length, 24);
  const paid = (await orderService().listOrders({ adminUserId: "admin", scope: "workbench", tab: "all", fulfillmentStatus: "PAID", page: "2" })) as unknown as Paged;
  assert.equal(paid.total, 40);
  assert.equal(paid.items.length, 10);
});

test("the step badges count every order per fulfillment status", async () => {
  const counts = await orderService().fulfillmentStatusCounts({ adminUserId: "admin", scope: "workbench" });
  assert.equal(counts.PAID, 40);
  assert.equal(counts.PACKED, 24);
  assert.equal(counts.PICKING, 0);
});

test("the store console, picking and pack station still get the plain list", async () => {
  const rows = await orderService().listOrders({ adminUserId: "admin", scope: "workbench", tab: "all" });
  assert.ok(Array.isArray(rows));
  assert.equal((rows as unknown[]).length, 64);
});

// ——— Helpers ———

test("paging requests: absent means unpaged, junk falls back to page 1 of 30", () => {
  assert.equal(listPageRequest(undefined), null);
  assert.equal(listPageRequest(""), null);
  assert.deepEqual(listPageRequest("abc"), { page: 1, pageSize: DEFAULT_LIST_PAGE_SIZE });
  assert.deepEqual(listPageRequest("0", "-4"), { page: 1, pageSize: DEFAULT_LIST_PAGE_SIZE });
  assert.deepEqual(listPageRequest("2", "10"), { page: 2, pageSize: 10 });
  assert.deepEqual(listPageWindow({ page: 2, pageSize: 30 }, 45), { page: 2, pageCount: 2, skip: 30, take: 30 });
  assert.deepEqual(listPageWindow({ page: 5, pageSize: 30 }, 0), { page: 1, pageCount: 1, skip: 0, take: 30 });
});

test("fulfillment status filter keeps known statuses only", () => {
  assert.deepEqual(fulfillmentStatusFilter("PAID, PICKING,NOPE,PAID"), [FulfillmentStatus.PAID, FulfillmentStatus.PICKING]);
  assert.deepEqual(fulfillmentStatusFilter(""), []);
  assert.deepEqual(fulfillmentStatusFilter(undefined), []);
});

test("the enlarged order photo pages through the order's photo first, then the garment's, without repeats", () => {
  assert.deepEqual(orderItemImageUrls("/a.jpg", ["/b.jpg", "/a.jpg", ""]), ["/a.jpg", "/b.jpg"]);
  assert.deepEqual(orderItemImageUrls(null, []), []);
});
