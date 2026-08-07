import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ProductDetailAssetType,
  ProductDetailStatus,
  ProductImageType,
  ProductImageVariant,
  ProductStatus,
  Prisma,
  prisma
} from "@online-saler/database";
import { normalizeProductDetailCopy } from "./product-detail-copy";

const CALIBRATED_OR_LATER_STATUSES: ProductStatus[] = [
  ProductStatus.CALIBRATED,
  ProductStatus.BARCODE_ASSIGNED,
  ProductStatus.REVIEW_PENDING,
  ProductStatus.APPROVED,
  ProductStatus.READY_FOR_STORAGE,
  ProductStatus.PUBLISHED,
  ProductStatus.UNPUBLISHED,
  ProductStatus.ARCHIVED
];
const CALIBRATED_OR_LATER = new Set<ProductStatus>(CALIBRATED_OR_LATER_STATUSES);

export type DetailBatchProduct = {
  status: ProductStatus;
};

export function isBatchReadyForDetailGeneration(
  products: DetailBatchProduct[],
  targetCount: number
): boolean {
  return products.length === targetCount && products.every((product) => CALIBRATED_OR_LATER.has(product.status));
}

export type DetailBatchSummaryInput = {
  id: string;
  batchCode: string;
  targetCount: number;
  createdAt: Date;
  products: Array<{
    id: string;
    productCode: string;
    batchItemNumber: number | null;
    status: ProductStatus;
    title: string | null;
    category: string | null;
    finalSizeLabel: string | null;
    images: Array<{
      id: string;
      publicUrl: string | null;
    }>;
    detailProfiles: Array<{
      id: string;
      status: ProductDetailStatus;
      sourceDataVersion: number;
      updatedAt: Date;
      assets: Array<{
        id: string;
        type: ProductDetailAssetType;
        status: ProductDetailStatus;
      }>;
    }>;
  }>;
};

export function summarizeDetailBatch(batch: DetailBatchSummaryInput) {
  const generationReady = isBatchReadyForDetailGeneration(batch.products, batch.targetCount);
  const calibrated = batch.products.filter((product) => CALIBRATED_OR_LATER.has(product.status)).length;
  const products = batch.products.map((product) => {
    const profile = product.detailProfiles[0] ?? null;
    return {
      id: product.id,
      productCode: product.productCode,
      batchItemNumber: product.batchItemNumber,
      productStatus: product.status,
      title: product.title,
      category: product.category,
      finalSizeLabel: product.finalSizeLabel,
      frontImage: product.images[0] ?? null,
      profileId: profile?.id ?? null,
      detailStatus: profile?.status ?? null,
      sourceDataVersion: profile?.sourceDataVersion ?? null,
      updatedAt: profile?.updatedAt ?? null,
      assets: profile?.assets ?? []
    };
  });
  const count = (status: ProductDetailStatus) => products.filter((product) => product.detailStatus === status).length;
  return {
    id: batch.id,
    batchCode: batch.batchCode,
    targetCount: batch.targetCount,
    createdAt: batch.createdAt,
    calibrated,
    generationReady,
    awaitingCalibration: Math.max(0, batch.targetCount - calibrated),
    pending: products.filter((product) =>
      product.detailStatus === ProductDetailStatus.PENDING || (generationReady && !product.detailStatus)
    ).length,
    generating: count(ProductDetailStatus.GENERATING),
    succeeded: count(ProductDetailStatus.READY),
    failed: count(ProductDetailStatus.FAILED),
    outdated: count(ProductDetailStatus.OUTDATED),
    approved: count(ProductDetailStatus.APPROVED),
    products
  };
}

@Injectable()
export class ProductDetailGenerationService {
  async listDetailGenerationBatches(batchId?: string) {
    const batches = await prisma.productBatch.findMany({
      where: batchId?.trim()
        ? { id: batchId.trim() }
        : { products: { some: { status: { in: CALIBRATED_OR_LATER_STATUSES } } } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        batchCode: true,
        targetCount: true,
        createdAt: true,
        products: {
          orderBy: { batchItemNumber: "asc" },
          select: {
            id: true,
            productCode: true,
            batchItemNumber: true,
            status: true,
            title: true,
            category: true,
            finalSizeLabel: true,
            images: {
              where: { type: ProductImageType.FRONT },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { id: true, publicUrl: true }
            },
            detailProfiles: {
              orderBy: { sourceDataVersion: "desc" },
              take: 1,
              select: {
                id: true,
                status: true,
                sourceDataVersion: true,
                updatedAt: true,
                assets: { select: { id: true, type: true, status: true } }
              }
            }
          }
        }
      }
    });
    return batches.map(summarizeDetailBatch);
  }

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
            category: true,
            subcategory: true,
            gender: true,
            finalSizeLabel: true,
            fitType: true,
            stretchLevel: true,
            fabricWeight: true,
            measurements: {
              select: { measurementType: true, finalValueCm: true }
            }
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
          update: {
            fitType: product.fitType,
            stretchLevel: product.stretchLevel,
            fabricWeight: product.fabricWeight,
            bodyChestMinCm: null,
            bodyChestMaxCm: null,
            bodyWaistMinCm: null,
            bodyWaistMaxCm: null,
            bodyHipMinCm: null,
            bodyHipMaxCm: null,
            heightMinCm: null,
            heightMaxCm: null,
            weightMinKg: null,
            weightMaxKg: null,
            expectedFit: null,
            recommendationConfidence: null,
            recommendationBasis: [],
            recommendationWarnings: [],
            sizeDisclaimer: null
          }
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

  async getProfileDetail(profileId: string) {
    const profile = await prisma.productDetailProfile.findUnique({
      where: { id: profileId },
      include: {
        assets: { orderBy: { type: "asc" } },
        generationJobs: { orderBy: { createdAt: "desc" } },
        product: {
          include: {
            images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
            measurements: { orderBy: { measurementType: "asc" } },
            defects: { orderBy: { createdAt: "asc" } }
          }
        }
      }
    });
    if (!profile) throw new NotFoundException("Product detail profile not found");
    return profile;
  }

  async updateCopy(profileId: string, value: unknown) {
    const copy = normalizeProductDetailCopy(value);
    const profile = await this.requireCurrentProfile(profileId);
    return prisma.productDetailProfile.update({
      where: { id: profile.id },
      data: {
        status: ProductDetailStatus.READY,
        sellingPointsJson: copy.sellingPoints,
        customerDescription: copy.shortDescription,
        fitSummary: copy.fitSummary,
        measurementSummary: null,
        conditionSummary: copy.conditionSummary,
        styleTagsJson: [],
        missingInformationJson: [],
        warningsJson: copy.warnings,
        finalOutputJson: copy as unknown as Prisma.InputJsonValue,
        contentVersion: { increment: 1 },
        approvedAt: null,
        approvedByEmployeeId: null
      }
    });
  }

  async prepareMainImageChange(profileId: string) {
    const profile = await this.requireCurrentProfile(profileId);
    return prisma.productDetailProfile.update({
      where: { id: profile.id },
      data: {
        status: ProductDetailStatus.READY,
        contentVersion: { increment: 1 },
        approvedAt: null,
        approvedByEmployeeId: null
      },
      select: { id: true, productId: true }
    });
  }

  async recalculateFit(profileId: string) {
    const profile = await this.requireCurrentProfile(profileId);
    return prisma.productDetailProfile.update({
      where: { id: profile.id },
      data: {
        status: ProductDetailStatus.READY,
        fitType: profile.product.fitType,
        stretchLevel: profile.product.stretchLevel,
        fabricWeight: profile.product.fabricWeight,
        bodyChestMinCm: null,
        bodyChestMaxCm: null,
        bodyWaistMinCm: null,
        bodyWaistMaxCm: null,
        bodyHipMinCm: null,
        bodyHipMaxCm: null,
        heightMinCm: null,
        heightMaxCm: null,
        weightMinKg: null,
        weightMaxKg: null,
        expectedFit: null,
        recommendationConfidence: null,
        recommendationBasis: [],
        recommendationWarnings: [],
        sizeDisclaimer: null,
        approvedAt: null,
        approvedByEmployeeId: null
      }
    });
  }

  async resetOpenAiGeneration(profileId: string) {
    const profile = await this.requireCurrentProfile(profileId);
    const job = await prisma.productDetailGenerationJob.findFirst({
      where: { detailProfileId: profile.id, sourceDataVersion: profile.sourceDataVersion },
      orderBy: { createdAt: "desc" }
    });
    if (!job) throw new NotFoundException("Product detail generation job not found");
    await prisma.$transaction([
      prisma.productDetailProfile.update({
        where: { id: profile.id },
        data: {
          status: ProductDetailStatus.PENDING,
          approvedAt: null,
          approvedByEmployeeId: null,
          outdatedAt: null,
          outdatedReason: null
        }
      }),
      prisma.productDetailAsset.updateMany({
        where: { detailProfileId: profile.id },
        data: { status: ProductDetailStatus.PENDING, failureCode: null, errorMessage: null }
      }),
      prisma.productDetailGenerationJob.update({
        where: { id: job.id },
        data: {
          status: ProductDetailStatus.PENDING,
          retryCount: { increment: 1 },
          failureCode: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
          outdatedAt: null,
          outdatedReason: null
        }
      })
    ]);
    return job.id;
  }

  async approveProfile(profileId: string, employeeId?: string | null) {
    const profile = await this.requireCurrentProfile(profileId, false, true);
    if (profile.status !== ProductDetailStatus.READY && profile.status !== ProductDetailStatus.APPROVED) {
      throw new BadRequestException("Only ready product details can be approved");
    }
    const mainSelection = await prisma.productMainImageSelection.findUnique({
      where: { productId: profile.productId },
      select: { variant: true, confirmedAt: true }
    });
    if (mainSelection?.variant === ProductImageVariant.AI_DISPLAY_MAIN && !mainSelection.confirmedAt) {
      throw new BadRequestException("Confirm the AI display main image against the original before approving product details");
    }
    const customerDescription = profile.customerDescription?.trim();
    const approvedAt = new Date();
    return prisma.$transaction(async (transaction) => {
      const approved = await transaction.productDetailProfile.update({
        where: { id: profile.id },
        data: {
          status: ProductDetailStatus.APPROVED,
          approvedAt,
          approvedByEmployeeId: employeeId?.trim() || null
        }
      });
      if (customerDescription) {
        await transaction.product.update({
          where: { id: profile.productId },
          data: { description: customerDescription }
        });
      }
      return approved;
    });
  }

  async approveBatch(batchId: string, employeeId?: string | null) {
    const batch = await prisma.productBatch.findUnique({
      where: { id: batchId },
      include: {
        products: {
          include: {
            detailProfiles: {
              orderBy: { sourceDataVersion: "desc" },
              take: 1,
              include: { assets: true }
            }
          }
        }
      }
    });
    if (!batch) throw new NotFoundException("Product batch not found");
    const profiles = batch.products.flatMap((product) => {
      const profile = product.detailProfiles[0];
      if (!profile || profile.sourceDataVersion !== product.detailSourceVersion) return [];
      return profile.status === ProductDetailStatus.READY || profile.status === ProductDetailStatus.APPROVED
        ? [profile]
        : [];
    });
    if (profiles.length === 0) return this.getBatchDetailStatus(batchId);
    const unconfirmedAiMainImages = await prisma.productMainImageSelection.count({
      where: {
        productId: { in: profiles.map((profile) => profile.productId) },
        variant: ProductImageVariant.AI_DISPLAY_MAIN,
        confirmedAt: null
      }
    });
    if (unconfirmedAiMainImages > 0) {
      throw new BadRequestException("Confirm every AI display main image against the originals before approving the batch");
    }
    const approvedAt = new Date();
    await prisma.$transaction(async (transaction) => {
      await transaction.productDetailProfile.updateMany({
        where: { id: { in: profiles.map((profile) => profile.id) } },
        data: {
          status: ProductDetailStatus.APPROVED,
          approvedAt,
          approvedByEmployeeId: employeeId?.trim() || null
        }
      });
      for (const profile of profiles) {
        const customerDescription = profile.customerDescription?.trim();
        if (customerDescription) {
          await transaction.product.update({
            where: { id: profile.productId },
            data: { description: customerDescription }
          });
        }
      }
    });
    return this.getBatchDetailStatus(batchId);
  }

  async resetBatchJobs(batchId: string, statuses: ProductDetailStatus[]) {
    await this.ensureBatchGenerationJobs(batchId);
    const jobs = await prisma.productDetailGenerationJob.findMany({
      where: { batchId, status: { in: statuses } },
      include: { product: { select: { detailSourceVersion: true } } },
      orderBy: { createdAt: "asc" }
    });
    const reset: string[] = [];
    for (const job of jobs) {
      if (job.sourceDataVersion !== job.product.detailSourceVersion) continue;
      await this.retryJob(job.id);
      reset.push(job.id);
    }
    return reset;
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

  private async requireCurrentProfile(profileId: string, includeMeasurements = false, includeAssets = false) {
    const profile = await prisma.productDetailProfile.findUnique({
      where: { id: profileId },
      include: {
        product: {
          include: { measurements: includeMeasurements }
        },
        assets: includeAssets
      }
    });
    if (!profile) throw new NotFoundException("Product detail profile not found");
    if (profile.sourceDataVersion !== profile.product.detailSourceVersion || profile.status === ProductDetailStatus.OUTDATED) {
      throw new BadRequestException("Product detail profile is outdated");
    }
    return profile;
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
