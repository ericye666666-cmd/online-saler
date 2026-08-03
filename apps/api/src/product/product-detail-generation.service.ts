import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ProductDetailAssetType,
  ProductDetailStatus,
  ProductImageType,
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
export const REQUIRED_DETAIL_ASSET_TYPES = [
  ProductDetailAssetType.FRONT_MAIN,
  ProductDetailAssetType.BACK_MAIN,
  ProductDetailAssetType.MODEL_DISPLAY,
  ProductDetailAssetType.MEASUREMENT_GUIDE,
  ProductDetailAssetType.DETAIL_GALLERY,
  ProductDetailAssetType.DELIVERY_GUIDE
] as const;

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
        fitSummary: null,
        measurementSummary: copy.measurementSummary,
        conditionSummary: copy.conditionSummary,
        styleTagsJson: copy.styleTags,
        missingInformationJson: copy.missingInformation,
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
    const customerDescription = profile.customerDescription?.trim();
    if (!customerDescription) throw new BadRequestException("Product description is required before detail approval");
    const mainImage = await prisma.productMainImageSelection.findUnique({
      where: { productId: profile.productId },
      select: { selectedImageId: true }
    });
    if (!mainImage) throw new BadRequestException("Select the storefront main image before detail approval");
    const readyTypes = new Set(profile.assets.filter((asset) => asset.status === ProductDetailStatus.READY).map((asset) => asset.type));
    const missing = REQUIRED_DETAIL_ASSET_TYPES.filter((type) => !readyTypes.has(type));
    if (missing.length) throw new BadRequestException(`Product detail assets are incomplete: ${missing.join(", ")}`);
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
      await transaction.product.update({
        where: { id: profile.productId },
        data: { description: customerDescription }
      });
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
    if (batch.products.length !== batch.targetCount) throw new BadRequestException("Product batch is incomplete");
    const profiles = batch.products.map((product) => product.detailProfiles[0]).filter(Boolean);
    if (profiles.length !== batch.targetCount) throw new BadRequestException("Every product must have generated details");
    const mainImageSelections = await prisma.productMainImageSelection.findMany({
      where: { productId: { in: profiles.map((profile) => profile.productId) } },
      select: { productId: true }
    });
    const productsWithMainImages = new Set(mainImageSelections.map((selection) => selection.productId));
    for (const profile of profiles) {
      if (profile.sourceDataVersion !== batch.products.find((item) => item.id === profile.productId)?.detailSourceVersion) {
        throw new BadRequestException("A product detail profile is outdated");
      }
      if (profile.status !== ProductDetailStatus.READY && profile.status !== ProductDetailStatus.APPROVED) {
        throw new BadRequestException("Every product detail must be ready before batch approval");
      }
      const readyTypes = new Set(profile.assets.filter((asset) => asset.status === ProductDetailStatus.READY).map((asset) => asset.type));
      if (REQUIRED_DETAIL_ASSET_TYPES.some((type) => !readyTypes.has(type))) {
        throw new BadRequestException("Every product detail must have all required assets before batch approval");
      }
      if (!profile.customerDescription?.trim()) {
        throw new BadRequestException("Every product detail must have a product description before batch approval");
      }
      if (!productsWithMainImages.has(profile.productId)) {
        throw new BadRequestException("Every product detail must have a selected storefront main image before batch approval");
      }
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
        await transaction.product.update({
          where: { id: profile.productId },
          data: { description: profile.customerDescription!.trim() }
        });
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
