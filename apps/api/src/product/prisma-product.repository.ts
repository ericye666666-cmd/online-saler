import { Injectable } from "@nestjs/common";
import { ActorType, Prisma, ProductStatus, prisma } from "@online-saler/database";
import { stateConflict } from "./product.errors";
import { productPublicationBlocker } from "./product-publication-readiness";
import { loadConfirmedDisplayImage } from "./product-publication-evidence";
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
  private readonly client = prisma;

  async createShell(input: CreateProductShellInput): Promise<ProductRecord> {
    const actor = input.actor;

    return this.client.product.create({
      data: {
        productCode: input.productCode,
        title: input.title ?? null,
        createdByEmployeeId:
          input.createdByEmployeeId ??
          (actor?.actorType === ActorType.EMPLOYEE ? actor.actorId ?? null : null)
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
      if (input.data.status === ProductStatus.PUBLISHED || input.data.status === ProductStatus.APPROVED) {
        const product = await transaction.product.findUnique({
          where: { id: input.id },
          include: { images: true, measurements: true, reviews: true, inventoryItem: true }
        });
        if (!product) throw stateConflict("Product changed before the transition could be saved.");
        const mainImage = await loadConfirmedDisplayImage(transaction, input.id);
        if (!product.barcode || !product.labelPrintedAt || !mainImage) {
          throw stateConflict("Approval and publication require a printed barcode and a confirmed AI display image.");
        }
        if (input.data.status === ProductStatus.PUBLISHED) {
          const blocker = productPublicationBlocker(product, mainImage);
          if (blocker) throw stateConflict(blocker);
        }
      }
      const updated = await transaction.product.update({
        where: {
          id: input.id,
          ...(input.audit.before ? { status: input.audit.before.status } : {}),
          ...(input.data.status === ProductStatus.PUBLISHED ? {
            inventoryItem: { is: { status: "AVAILABLE", locationId: { not: null }, checkedInAt: { not: null } } }
          } : {})
        },
        data: this.toProductUpdateInput(input.data)
      });

      if (input.review) {
        await transaction.productReview.create({
          data: { productId: input.id, ...input.review }
        });
      }

      await transaction.auditLog.create({
        data: this.toAuditCreateInput(input.audit)
      });

      return updated;
    }, {
      isolationLevel: input.review || input.data.status === ProductStatus.PUBLISHED || input.data.status === ProductStatus.APPROVED
        ? Prisma.TransactionIsolationLevel.Serializable
        : undefined
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2025" || error.code === "P2034")) {
        throw stateConflict("Product or inventory changed during this action. Refresh the product before retrying.", { productId: input.id });
      }
      throw error;
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
