import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ActorType, ProductStatus, SourceApp } from "@online-saler/database";
import { ProductApplicationService } from "./product-application.service";
import { ProductDomainError } from "./product.errors";
import type { ProductRepository } from "./product.repository";
import { ProductStateMachine } from "./product-state-machine";
import type {
  CreateProductShellInput,
  ProductAuditEntry,
  ProductDetail,
  ProductRecord,
  SaveProductInput,
  SaveProductStateChangeInput
} from "./product.types";

const actor = {
  actorType: ActorType.EMPLOYEE,
  actorId: "employee-1",
  sourceApp: SourceApp.OPERATIONS
};

describe("Product domain service", () => {
  it("allows the frozen happy path through ready for storage and writes audit logs", async () => {
    const repository = new InMemoryProductRepository();
    const service = new ProductApplicationService(repository, new ProductStateMachine());
    const product = await service.createProductShell({ productCode: "P-1001", actor });

    await transition(service, product.id, ProductStatus.PHOTOGRAPHED);
    await transition(service, product.id, ProductStatus.AI_PROCESSING);
    await transition(service, product.id, ProductStatus.AI_PROCESSED);
    await transition(service, product.id, ProductStatus.CALIBRATION_PENDING);
    await transition(service, product.id, ProductStatus.CALIBRATED);
    await transition(service, product.id, ProductStatus.BARCODE_ASSIGNED, {
      barcode: "BC-1001"
    });
    await transition(service, product.id, ProductStatus.REVIEW_PENDING);
    await transition(service, product.id, ProductStatus.APPROVED);
    const ready = await transition(service, product.id, ProductStatus.READY_FOR_STORAGE);

    assert.equal(ready.status, ProductStatus.READY_FOR_STORAGE);
    assert.equal(ready.barcode, "BC-1001");
    assert.equal(repository.auditLogs.length, 9);
    assert.deepEqual(repository.auditLogs[5].before, {
      status: ProductStatus.CALIBRATED,
      barcode: null
    });
    assert.deepEqual(repository.auditLogs[5].after, {
      status: ProductStatus.BARCODE_ASSIGNED,
      barcode: "BC-1001"
    });
    assert.equal(repository.auditLogs[5].action, "PRODUCT_ASSIGN_BARCODE");
    assert.equal(repository.auditLogs[5].actor.sourceApp, SourceApp.OPERATIONS);
  });

  it("requires available inventory before publishing", async () => {
    const repository = new InMemoryProductRepository();
    const service = new ProductApplicationService(repository, new ProductStateMachine());
    const product = await repository.createWithStatus(
      "P-1010",
      ProductStatus.READY_FOR_STORAGE,
      "BC-1010"
    );

    await assert.rejects(
      () => transition(service, product.id, ProductStatus.PUBLISHED),
      (error) => hasCode(error, "STATE_CONFLICT")
    );

    const published = await transition(service, product.id, ProductStatus.PUBLISHED, {
      inventoryAvailable: true
    });

    assert.equal(published.status, ProductStatus.PUBLISHED);
    assert.ok(published.publishedAt);
    assert.equal(repository.auditLogs.at(-1)?.action, "PRODUCT_PUBLISH");
  });

  it("rejects illegal transitions as STATE_CONFLICT", async () => {
    const repository = new InMemoryProductRepository();
    const service = new ProductApplicationService(repository, new ProductStateMachine());
    const product = await service.createProductShell({ productCode: "P-1002", actor });

    await assert.rejects(
      () => transition(service, product.id, ProductStatus.APPROVED),
      (error) => hasCode(error, "STATE_CONFLICT")
    );
    assert.equal(repository.auditLogs.length, 0);
  });

  it("rejects formal barcode assignment before calibration", async () => {
    const repository = new InMemoryProductRepository();
    const service = new ProductApplicationService(repository, new ProductStateMachine());
    const product = await service.createProductShell({ productCode: "P-1003", actor });

    await assert.rejects(
      () =>
        transition(service, product.id, ProductStatus.BARCODE_ASSIGNED, {
          barcode: "BC-EARLY"
        }),
      (error) => hasCode(error, "STATE_CONFLICT")
    );
  });

  it("rejects duplicate formal barcodes", async () => {
    const repository = new InMemoryProductRepository();
    const service = new ProductApplicationService(repository, new ProductStateMachine());
    const first = await repository.createWithStatus("P-1004", ProductStatus.CALIBRATED);
    const second = await repository.createWithStatus("P-1005", ProductStatus.CALIBRATED);

    await transition(service, first.id, ProductStatus.BARCODE_ASSIGNED, {
      barcode: "BC-DUP"
    });

    await assert.rejects(
      () =>
        transition(service, second.id, ProductStatus.BARCODE_ASSIGNED, {
          barcode: "BC-DUP"
        }),
      (error) => hasCode(error, "STATE_CONFLICT")
    );
  });

  it("allows the REWORK_REQUIRED return loops when a reason is provided", async () => {
    const repository = new InMemoryProductRepository();
    const service = new ProductApplicationService(repository, new ProductStateMachine());
    const calibrationRework = await repository.createWithStatus(
      "P-1006",
      ProductStatus.REVIEW_PENDING,
      "BC-1006"
    );
    const photoRework = await repository.createWithStatus(
      "P-1007",
      ProductStatus.REVIEW_PENDING,
      "BC-1007"
    );

    await transition(service, calibrationRework.id, ProductStatus.REWORK_REQUIRED, {
      reason: "Condition needs correction."
    });
    const calibrationPending = await transition(
      service,
      calibrationRework.id,
      ProductStatus.CALIBRATION_PENDING,
      {
        reason: "Only data correction is needed."
      }
    );

    await transition(service, photoRework.id, ProductStatus.REWORK_REQUIRED, {
      reason: "Front photo is blurred."
    });
    const photographed = await transition(service, photoRework.id, ProductStatus.PHOTOGRAPHED, {
      reason: "New photos required."
    });

    assert.equal(calibrationPending.status, ProductStatus.CALIBRATION_PENDING);
    assert.equal(photographed.status, ProductStatus.PHOTOGRAPHED);
    assert.equal(repository.auditLogs[0].reason, "Condition needs correction.");
    assert.equal(repository.auditLogs[0].action, "PRODUCT_REQUEST_REWORK");
  });

  it("requires a reason for manual rework and archive exceptions", async () => {
    const repository = new InMemoryProductRepository();
    const service = new ProductApplicationService(repository, new ProductStateMachine());
    const product = await repository.createWithStatus(
      "P-1008",
      ProductStatus.REVIEW_PENDING,
      "BC-1008"
    );

    await assert.rejects(
      () => transition(service, product.id, ProductStatus.REWORK_REQUIRED),
      (error) => hasCode(error, "STATE_CONFLICT")
    );
    await assert.rejects(
      () => transition(service, product.id, ProductStatus.ARCHIVED),
      (error) => hasCode(error, "STATE_CONFLICT")
    );
  });
});

async function transition(
  service: ProductApplicationService,
  productId: string,
  toStatus: ProductStatus,
  options: { barcode?: string; reason?: string; inventoryAvailable?: boolean } = {}
) {
  return service.transitionProduct({
    productId,
    toStatus,
    actor,
    ...options
  });
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof ProductDomainError && error.code === code;
}

class InMemoryProductRepository implements ProductRepository {
  readonly products = new Map<string, ProductRecord>();
  readonly auditLogs: ProductAuditEntry[] = [];
  private sequence = 1;

  async createShell(input: CreateProductShellInput): Promise<ProductRecord> {
    return this.createWithStatus(input.productCode, ProductStatus.DRAFT);
  }

  async createWithStatus(
    productCode: string,
    status: ProductStatus,
    barcode: string | null = null
  ): Promise<ProductRecord> {
    const now = new Date("2026-07-28T00:00:00.000Z");
    const product: ProductRecord = {
      id: `product-${this.sequence++}`,
      productCode,
      barcode,
      status,
      title: null,
      category: null,
      subcategory: null,
      brand: null,
      color: null,
      gender: null,
      kidsAgeRange: null,
      tagSize: null,
      finalSizeLabel: null,
      conditionGrade: null,
      priceKsh: null,
      labelPrintedAt: null,
      createdByEmployeeId: null,
      approvedByEmployeeId: null,
      publishedAt: null,
      unpublishedAt: null,
      createdAt: now,
      updatedAt: now
    };

    this.products.set(product.id, product);
    return product;
  }

  async findById(id: string): Promise<ProductDetail | null> {
    const product = this.products.get(id);
    return product ? this.toDetail(product) : null;
  }

  async findByProductCode(productCode: string): Promise<ProductDetail | null> {
    const product = [...this.products.values()].find((candidate) => candidate.productCode === productCode);
    return product ? this.toDetail(product) : null;
  }

  async findByBarcode(barcode: string): Promise<ProductRecord | null> {
    return [...this.products.values()].find((candidate) => candidate.barcode === barcode) ?? null;
  }

  async save(input: SaveProductInput): Promise<ProductRecord> {
    const product = this.mustFind(input.id);
    const updated = {
      ...product,
      ...input.data,
      updatedAt: input.data.updatedAt ?? product.updatedAt
    };
    this.products.set(updated.id, updated);
    return updated;
  }

  async saveStateChange(input: SaveProductStateChangeInput): Promise<ProductRecord> {
    const updated = await this.save(input);
    this.auditLogs.push(input.audit);
    return updated;
  }

  private mustFind(id: string): ProductRecord {
    const product = this.products.get(id);

    if (!product) {
      throw new Error(`Missing test product ${id}`);
    }

    return product;
  }

  private toDetail(product: ProductRecord): ProductDetail {
    return {
      ...product,
      images: [],
      measurements: [],
      aiExtractions: [],
      defects: [],
      reviews: []
    };
  }
}
