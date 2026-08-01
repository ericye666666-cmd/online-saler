import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ProductDetailStatus,
  ProductStatus,
  Prisma,
  prisma
} from "@online-saler/database";

const CALIBRATED_OR_LATER = new Set<ProductStatus>([
  ProductStatus.CALIBRATED,
  ProductStatus.BARCODE_ASSIGNED,
  ProductStatus.REVIEW_PENDING,
  ProductStatus.APPROVED,
  ProductStatus.READY_FOR_STORAGE,
  ProductStatus.PUBLISHED,
  ProductStatus.UNPUBLISHED,
  ProductStatus.ARCHIVED
]);

export type DetailBatchProduct = {
  status: ProductStatus;
};

export function isBatchReadyForDetailGeneration(
  products: DetailBatchProduct[],
  targetCount: number
): boolean {
  return products.length === targetCount && products.every((product) => CALIBRATED_OR_LATER.has(product.status));
}

@Injectable()
export class ProductDetailGenerationService {
  async recordSourceChange(productId: string, reason: string) {
    return prisma.$transaction(async (transaction) => {
      const product = await transaction.product.update({
        where: { id: productId },
        data: { detailSourceVersion: { increment: 1 } },
        select: { id: true, detailSourceVersion: true }
      });
      await this.markExistingVersionsOutdated(transaction, productId, reason);
      return product;
    });
  }

  async afterCalibration(productId: string, batchId?: string | null) {
    await prisma.$transaction((transaction) =>
      this.markExistingVersionsOutdated(transaction, productId, "CALIBRATION_FACTS_CHANGED")
    );
    if (!batchId) return { ready: false, jobs: [] };
    return this.ensureBatchGenerationJobs(batchId);
  }

  async ensureBatchGenerationJobs(batchId: string) {
    const batch = await prisma.productBatch.findUnique({
      where: { id: batchId },
      include: {
        products: {
          orderBy: { batchItemNumber: "asc" },
          select: {
            id: true,
            status: true,
            detailSourceVersion: true,
            fitType: true,
            stretchLevel: true,
            fabricWeight: true
          }
        }
      }
    });
    if (!batch) throw new NotFoundException("Product batch not found");
    if (!isBatchReadyForDetailGeneration(batch.products, batch.targetCount)) {
      return { batchId, ready: false, jobs: [] };
    }

    const jobs = await prisma.$transaction(async (transaction) => {
      const result = [];
      for (const product of batch.products) {
        const profile = await transaction.productDetailProfile.upsert({
          where: {
            productId_sourceDataVersion: {
              productId: product.id,
              sourceDataVersion: product.detailSourceVersion
            }
          },
          create: {
            productId: product.id,
            status: ProductDetailStatus.PENDING,
            fitType: product.fitType,
            stretchLevel: product.stretchLevel,
            fabricWeight: product.fabricWeight,
            sourceDataVersion: product.detailSourceVersion
          },
          update: {}
        });
        const job = await transaction.productDetailGenerationJob.upsert({
          where: {
            productId_sourceDataVersion: {
              productId: product.id,
              sourceDataVersion: product.detailSourceVersion
            }
          },
          create: {
            productId: product.id,
            batchId,
            detailProfileId: profile.id,
            status: ProductDetailStatus.PENDING,
            sourceDataVersion: product.detailSourceVersion
          },
          update: {}
        });
        result.push(job);
      }
      return result;
    });

    return { batchId, ready: true, jobs };
  }

  async retryJob(jobId: string) {
    const job = await prisma.productDetailGenerationJob.findUnique({
      where: { id: jobId },
      include: { product: { select: { detailSourceVersion: true } } }
    });
    if (!job) throw new NotFoundException("Product detail generation job not found");
    if (job.status !== ProductDetailStatus.FAILED && job.status !== ProductDetailStatus.OUTDATED) {
      throw new BadRequestException("Only failed or outdated detail jobs can be retried");
    }
    if (job.sourceDataVersion !== job.product.detailSourceVersion) {
      throw new BadRequestException("Product facts changed; create a job for the latest source version");
    }

    return prisma.$transaction(async (transaction) => {
      await transaction.productDetailProfile.update({
        where: { id: job.detailProfileId },
        data: { status: ProductDetailStatus.PENDING, outdatedReason: null, outdatedAt: null }
      });
      return transaction.productDetailGenerationJob.update({
        where: { id: job.id },
        data: {
          status: ProductDetailStatus.PENDING,
          retryCount: { increment: 1 },
          failureCode: null,
          errorMessage: null,
          outdatedReason: null,
          outdatedAt: null,
          startedAt: null,
          completedAt: null
        }
      });
    });
  }

  async getProductDetail(productId: string) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        detailSourceVersion: true,
        detailProfiles: {
          include: { assets: true, generationJobs: true },
          orderBy: { sourceDataVersion: "desc" }
        }
      }
    });
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  async getBatchDetailStatus(batchId: string) {
    const batch = await prisma.productBatch.findUnique({
      where: { id: batchId },
      include: {
        products: {
          orderBy: { batchItemNumber: "asc" },
          select: {
            id: true,
            productCode: true,
            batchItemNumber: true,
            detailSourceVersion: true,
            detailProfiles: {
              orderBy: { sourceDataVersion: "desc" },
              take: 1,
              include: { generationJobs: true, assets: true }
            }
          }
        }
      }
    });
    if (!batch) throw new NotFoundException("Product batch not found");
    return batch;
  }

  private async markExistingVersionsOutdated(
    transaction: Prisma.TransactionClient,
    productId: string,
    reason: string
  ) {
    const outdatedAt = new Date();
    await Promise.all([
      transaction.productDetailProfile.updateMany({
        where: { productId, status: { not: ProductDetailStatus.OUTDATED } },
        data: {
          status: ProductDetailStatus.OUTDATED,
          outdatedReason: reason,
          outdatedAt
        }
      }),
      transaction.productDetailAsset.updateMany({
        where: { productId, status: { not: ProductDetailStatus.OUTDATED } },
        data: { status: ProductDetailStatus.OUTDATED, outdatedReason: reason, outdatedAt }
      }),
      transaction.productDetailGenerationJob.updateMany({
        where: { productId, status: { not: ProductDetailStatus.OUTDATED } },
        data: { status: ProductDetailStatus.OUTDATED, outdatedReason: reason, outdatedAt }
      })
    ]);
  }
}
