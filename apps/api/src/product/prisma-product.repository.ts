import { Injectable } from "@nestjs/common";
import { ActorType, Prisma, PrismaClient, prisma } from "@online-saler/database";
import type { ProductRepository } from "./product.repository";
import type {
  CreateProductShellInput,
  ProductAuditEntry,
  ProductDetail,
  ProductRecord,
  ProductSaveData,
  ProductStateChangeData,
  SaveProductInput,
  SaveProductStateChangeInput
} from "./product.types";

@Injectable()
export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async createShell(input: CreateProductShellInput): Promise<ProductRecord> {
    return this.client.product.create({
      data: {
        productCode: input.productCode,
        title: input.title ?? null,
        createdByEmployeeId:
          input.createdByEmployeeId ??
          (input.actor?.actorType === ActorType.EMPLOYEE ? input.actor.actorId ?? null : null)
      }
    });
  }

  async findById(id: string): Promise<ProductDetail | null> {
    return this.client.product.findUnique({
      where: { id },
      include: this.detailInclude()
    });
  }

  async findByProductCode(productCode: string): Promise<ProductDetail | null> {
    return this.client.product.findUnique({
      where: { productCode },
      include: this.detailInclude()
    });
  }

  async findByBarcode(barcode: string): Promise<ProductRecord | null> {
    return this.client.product.findUnique({
      where: { barcode }
    });
  }

  async save(input: SaveProductInput): Promise<ProductRecord> {
    return this.client.product.update({
      where: { id: input.id },
      data: this.toProductUpdateInput(input.data)
    });
  }

  async saveStateChange(input: SaveProductStateChangeInput): Promise<ProductRecord> {
    return this.client.$transaction(async (transaction) => {
      const updated = await transaction.product.update({
        where: { id: input.id },
        data: this.toProductUpdateInput(input.data)
      });

      await transaction.auditLog.create({
        data: this.toAuditCreateInput(input.audit)
      });

      return updated;
    });
  }

  private detailInclude() {
    return {
      images: true,
      measurements: true,
      aiExtractions: true,
      defects: true,
      reviews: true
    } as const;
  }

  private toProductUpdateInput(
    data: ProductSaveData | ProductStateChangeData
  ): Prisma.ProductUpdateInput {
    const update: Prisma.ProductUpdateInput = {};

    if ("status" in data && data.status !== undefined) {
      update.status = data.status;
    }

    if ("barcode" in data && data.barcode !== undefined) {
      update.barcode = data.barcode;
    }

    if (data.title !== undefined) {
      update.title = data.title;
    }

    if ("publishedAt" in data && data.publishedAt !== undefined) {
      update.publishedAt = data.publishedAt;
    }

    if ("unpublishedAt" in data && data.unpublishedAt !== undefined) {
      update.unpublishedAt = data.unpublishedAt;
    }

    if (data.updatedAt !== undefined) {
      update.updatedAt = data.updatedAt;
    }

    return update;
  }

  private toAuditCreateInput(entry: ProductAuditEntry): Prisma.AuditLogUncheckedCreateInput {
    return {
      actorType: entry.actor.actorType,
      actorId: entry.actor.actorId ?? null,
      sourceApp: entry.actor.sourceApp,
      module: entry.module,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      beforeJson: entry.before as Prisma.InputJsonValue,
      afterJson: entry.after as Prisma.InputJsonValue,
      reason: entry.reason ?? null
    };
  }
}
