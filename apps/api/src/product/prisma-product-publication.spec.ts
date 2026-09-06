import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ActorType, ProductStatus, SourceApp, prisma } from "@online-saler/database";
import { PrismaProductRepository } from "./prisma-product.repository";
import type { SaveProductStateChangeInput } from "./product.types";

const originalTransaction = prisma.$transaction;
afterEach(() => { prisma.$transaction = originalTransaction; });
const now = new Date("2026-09-06T12:00:00Z");

function saveInput(status: ProductStatus = ProductStatus.PUBLISHED): SaveProductStateChangeInput {
  return {
    id: "product-1", data: { status },
    audit: {
      actor: { actorType: ActorType.EMPLOYEE, actorId: "employee-1", sourceApp: SourceApp.OPERATIONS },
      module: "Product", entityType: "Product", entityId: "product-1", action: "PRODUCT_PUBLISH",
      before: { status: status === ProductStatus.APPROVED ? ProductStatus.REVIEW_PENDING : ProductStatus.READY_FOR_STORAGE, barcode: "BC-1" },
      after: { status, barcode: "BC-1" }
    }
  };
}

function persistenceFixture() {
  const product = {
    id: "product-1", status: ProductStatus.READY_FOR_STORAGE as ProductStatus, barcode: "BC-1", labelPrintedAt: now,
    title: "Bag", category: "BAG", finalSizeLabel: "One size", conditionGrade: "GOOD", priceKsh: 500,
    images: [{ id: "front-1" }], measurements: [], reviews: [{ result: "APPROVED", createdAt: now }],
    inventoryItem: { status: "AVAILABLE", barcode: "BC-1", locationId: "shelf-1", checkedInAt: now }
  };
  const saved: string[] = [];
  const transaction = {
    product: {
      findUnique: async () => product,
      update: async ({ where }: { where: Record<string, unknown> }) => {
        assert.ok(where.status, "state writes must compare their expected source status");
        saved.push("product");
        return product;
      }
    },
    productMainImageSelection: {
      findUnique: async () => ({ selectedImageId: "ai-1", variant: "AI_DISPLAY_MAIN", confirmedAt: now })
    },
    productImageVariantAsset: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        assert.deepEqual(where, { id: "ai-1", productId: "product-1", variant: "AI_DISPLAY_MAIN" });
        return { id: "ai-1" };
      }
    },
    productReview: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        assert.equal(data.productId, "product-1");
        assert.equal(data.reviewerEmployeeId, "employee-1");
        saved.push("review");
      }
    },
    auditLog: { create: async () => { saved.push("audit"); } }
  };
  prisma.$transaction = (async (callback: (client: unknown) => Promise<unknown>, options: { isolationLevel: string }) => {
    assert.equal(options.isolationLevel, "Serializable");
    return callback(transaction);
  }) as never;
  return { product, saved, transaction };
}

test("the final product repository rejects publish bypasses even when callers claim inventory is ready", async () => {
  const fixture = persistenceFixture();
  fixture.product.inventoryItem.status = "RESERVED";
  await assert.rejects(new PrismaProductRepository().saveStateChange(saveInput()), /placed in the warehouse/);
  assert.deepEqual(fixture.saved, []);
});

test("publication persistence rechecks the selected asset and latest review inside the transaction", async () => {
  const fixture = persistenceFixture();
  fixture.product.reviews.push({ result: "REWORK_REQUIRED", createdAt: new Date(now.getTime() + 1) });
  await assert.rejects(new PrismaProductRepository().saveStateChange(saveInput()), /Approve the product/);
  assert.deepEqual(fixture.saved, []);
  fixture.product.reviews.pop();
  fixture.transaction.productImageVariantAsset.findFirst = (async () => null) as never;
  await assert.rejects(new PrismaProductRepository().saveStateChange(saveInput()), /confirmed AI display image/);
  assert.deepEqual(fixture.saved, []);
});

test("publication write predicates still require physically available inventory at the state update", async () => {
  const fixture = persistenceFixture();
  fixture.transaction.product.update = (async ({ where }: { where: Record<string, unknown> }) => {
    assert.equal(where.status, "READY_FOR_STORAGE");
    assert.deepEqual(where.inventoryItem, {
      is: { status: "AVAILABLE", locationId: { not: null }, checkedInAt: { not: null } }
    });
    fixture.saved.push("product");
    return fixture.product;
  }) as never;
  await new PrismaProductRepository().saveStateChange(saveInput());
  assert.deepEqual(fixture.saved, ["product", "audit"]);
});

test("approval writes its decision, employee and state audit in the same transaction without requiring stock-in", async () => {
  const fixture = persistenceFixture();
  fixture.product.status = ProductStatus.REVIEW_PENDING;
  fixture.product.inventoryItem.status = "PENDING_STOCK_IN";
  fixture.product.inventoryItem.checkedInAt = null as never;
  const input = saveInput(ProductStatus.APPROVED);
  input.review = { result: "APPROVED", reviewerEmployeeId: "employee-1" };
  await new PrismaProductRepository().saveStateChange(input);
  assert.deepEqual(fixture.saved, ["product", "review", "audit"]);
});

test("a stale review decision cannot leave a review record when its state update fails", async () => {
  const fixture = persistenceFixture();
  fixture.transaction.product.update = async () => { throw new Error("Product state changed"); };
  const input = saveInput(ProductStatus.APPROVED);
  input.review = { result: "APPROVED", reviewerEmployeeId: "employee-1" };
  await assert.rejects(new PrismaProductRepository().saveStateChange(input), /Product state changed/);
  assert.deepEqual(fixture.saved, []);
});
