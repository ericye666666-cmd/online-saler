import { BadRequestException, Injectable } from "@nestjs/common";
import {
  ImageProcessingOperation as DatabaseImageProcessingOperation,
  ImageProcessingStatus as DatabaseImageProcessingStatus,
  Prisma,
  ProductImageType,
  ProductImageVariant as DatabaseProductImageVariant,
  prisma
} from "@online-saler/database";
import {
  isImageProcessingOperation,
  type ImageProcessingJobRecord,
  type ImageProcessingOperation,
  type ProductImageComparisonResponse,
  type ProductImageVariant,
  type ProductImageVariantRecord
} from "@online-saler/shared-types";
import {
  canRetryImageProcessing,
  evaluateLightweightImageQuality,
  isSelectableMainVariant,
  sourceVariantForOperation,
  targetVariantForOperation
} from "./product-image-processing.rules";
import { ProductDetailGenerationService } from "./product-detail-generation.service";

@Injectable()
export class ProductImageProcessingService {
  constructor(private readonly details: ProductDetailGenerationService) {}

  async start(input: {
    productId: string;
    sourceImageId: string;
    operation: string;
  }): Promise<ImageProcessingJobRecord> {
    if (!isImageProcessingOperation(input.operation)) {
      throw new BadRequestException("Unsupported image processing operation");
    }

    const operation = input.operation;
    const requiredSourceVariant = sourceVariantForOperation(operation);
    await this.requireSourceImage({
      productId: input.productId,
      sourceImageId: input.sourceImageId,
      variant: requiredSourceVariant
    });

    const activeJob = await prisma.productImageProcessingJob.findFirst({
      where: {
        productId: input.productId,
        sourceImageId: input.sourceImageId,
        operation: operation as DatabaseImageProcessingOperation,
        status: {
          in: [DatabaseImageProcessingStatus.PENDING, DatabaseImageProcessingStatus.RUNNING]
        }
      },
      orderBy: { createdAt: "desc" }
    });

    if (activeJob) return this.toJobRecord(activeJob);

    const job = await prisma.productImageProcessingJob.create({
      data: {
        productId: input.productId,
        sourceImageId: input.sourceImageId,
        operation: operation as DatabaseImageProcessingOperation,
        targetVariant: targetVariantForOperation(operation) as DatabaseProductImageVariant,
        status: DatabaseImageProcessingStatus.PENDING
      }
    });

    return this.toJobRecord(job);
  }

  async retry(input: { jobId: string; reason?: string }): Promise<ImageProcessingJobRecord> {
    const job = await prisma.productImageProcessingJob.findUnique({ where: { id: input.jobId } });
    if (!job) throw new BadRequestException("Image processing job not found");

    if (!canRetryImageProcessing(job.status, job.retryCount)) {
      throw new BadRequestException("Only failed jobs below the retry limit can be retried");
    }

    await this.requireSourceImage({
      productId: job.productId,
      sourceImageId: job.sourceImageId,
      variant: sourceVariantForOperation(job.operation)
    });

    const retried = await prisma.productImageProcessingJob.update({
      where: { id: input.jobId },
      data: {
        status: DatabaseImageProcessingStatus.PENDING,
        retryCount: { increment: 1 },
        retryReason: input.reason?.trim() || null,
        provider: null,
        processorVersion: null,
        qualityScore: null,
        qualityIssues: Prisma.JsonNull,
        fallbackFrom: null,
        fallbackReason: null,
        outputImageId: null,
        failureCode: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null
      }
    });

    return this.toJobRecord(retried);
  }

  async selectMainImage(input: {
    productId: string;
    imageId: string;
  }): Promise<ProductImageComparisonResponse> {
    const currentSelection = await prisma.productMainImageSelection.findUnique({
      where: { productId: input.productId },
      select: { selectedImageId: true }
    });
    const original = await prisma.productImage.findFirst({
      where: {
        id: input.imageId,
        productId: input.productId,
        type: ProductImageType.FRONT
      },
      select: { id: true }
    });

    let variant: ProductImageVariant = "ORIGINAL";
    let derivedSourceImageId: string | null = null;
    if (!original) {
      const asset = await prisma.productImageVariantAsset.findFirst({
        where: {
          id: input.imageId,
          productId: input.productId
        },
        select: { variant: true, sourceImageId: true }
      });
      if (!asset) throw new BadRequestException("Front image variant not found for this product");
      variant = asset.variant;
      derivedSourceImageId = asset.sourceImageId;
    }

    if (!isSelectableMainVariant(variant)) {
      throw new BadRequestException("Transparent cutout cannot be selected as the storefront main image");
    }
    if (derivedSourceImageId) {
      await this.requireStorefrontQuality(input.productId, derivedSourceImageId);
    }

    await prisma.productMainImageSelection.upsert({
      where: { productId: input.productId },
      create: {
        productId: input.productId,
        selectedImageId: input.imageId,
        variant: variant as DatabaseProductImageVariant
      },
      update: {
        selectedImageId: input.imageId,
        variant: variant as DatabaseProductImageVariant,
        selectedAt: new Date()
      }
    });
    if (currentSelection?.selectedImageId !== input.imageId) {
      await this.details.recordSourceChange(input.productId, "MAIN_IMAGE_CHANGED");
    }

    return this.getComparison(input.productId);
  }

  private async requireStorefrontQuality(productId: string, initialSourceImageId: string): Promise<void> {
    let sourceImageId = initialSourceImageId;

    for (let depth = 0; depth < 4; depth += 1) {
      const job = await prisma.productImageProcessingJob.findUnique({
        where: { outputImageId: sourceImageId },
        select: {
          productId: true,
          operation: true,
          provider: true,
          qualityScore: true,
          qualityIssues: true
        }
      });
      if (job?.productId === productId && job.operation === DatabaseImageProcessingOperation.REMOVE_BACKGROUND) {
        if (job.provider !== "lightweight-opencv") return;
        const decision = evaluateLightweightImageQuality({
          qualityScore: job.qualityScore,
          qualityIssues: this.toQualityIssues(job.qualityIssues)
        });
        if (!decision.pass) {
          throw new BadRequestException(
            `Lightweight cutout quality is insufficient for storefront use (${decision.reason}). Run BiRefNet and select its result.`
          );
        }
        return;
      }

      const sourceAsset = await prisma.productImageVariantAsset.findFirst({
        where: { id: sourceImageId, productId },
        select: { sourceImageId: true }
      });
      if (!sourceAsset) return;
      sourceImageId = sourceAsset.sourceImageId;
    }
  }

  async getComparison(productId: string): Promise<ProductImageComparisonResponse> {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true }
    });
    if (!product) throw new BadRequestException("Product not found");

    const [original, assets, jobs, selection] = await Promise.all([
      prisma.productImage.findFirst({
        where: {
          productId,
          type: ProductImageType.FRONT
        },
        orderBy: { createdAt: "desc" }
      }),
      prisma.productImageVariantAsset.findMany({
        where: { productId },
        orderBy: { createdAt: "desc" }
      }),
      prisma.productImageProcessingJob.findMany({
        where: { productId },
        orderBy: { createdAt: "desc" }
      }),
      prisma.productMainImageSelection.findUnique({ where: { productId } })
    ]);

    const byVariant = new Map<ProductImageVariant, (typeof assets)[number]>();
    for (const asset of assets) {
      const variant = asset.variant as ProductImageVariant;
      if (!byVariant.has(variant)) byVariant.set(variant, asset);
    }

    const mapAsset = (variant: Exclude<ProductImageVariant, "ORIGINAL">) => {
      const asset = byVariant.get(variant);
      return asset ? this.toAssetRecord(asset, selection?.selectedImageId ?? null) : null;
    };

    return {
      productId,
      original: original
        ? {
            imageId: original.id,
            productId: original.productId,
            sourceImageId: null,
            variant: "ORIGINAL",
            originalUrl: original.originalUrl,
            publicUrl: original.publicUrl,
            widthPx: null,
            heightPx: null,
            mimeType: null,
            selectedAsMain: original.id === selection?.selectedImageId,
            createdAt: original.createdAt.toISOString()
          }
        : null,
      cutoutTransparent: mapAsset("CUTOUT_TRANSPARENT"),
      cutoutWhite: mapAsset("CUTOUT_WHITE"),
      optimizedMain: mapAsset("OPTIMIZED_MAIN"),
      optimizedBalancedMain: mapAsset("OPTIMIZED_BALANCED_MAIN"),
      selectedMainImageId: selection?.selectedImageId ?? null,
      jobs: jobs.map((job) => this.toJobRecord(job))
    };
  }

  private async requireSourceImage(input: {
    productId: string;
    sourceImageId: string;
    variant: ProductImageVariant;
  }): Promise<void> {
    if (input.variant === "ORIGINAL") {
      const original = await prisma.productImage.findFirst({
        where: {
          id: input.sourceImageId,
          productId: input.productId,
          type: ProductImageType.FRONT
        },
        select: { id: true }
      });
      if (!original) {
        throw new BadRequestException("A FRONT original image is required for background removal");
      }
      return;
    }

    const asset = await prisma.productImageVariantAsset.findFirst({
      where: {
        id: input.sourceImageId,
        productId: input.productId,
        variant: input.variant as DatabaseProductImageVariant
      },
      select: { id: true }
    });
    if (!asset) {
      throw new BadRequestException(`${input.variant} source image not found for this product`);
    }
  }

  private toAssetRecord(
    asset: {
      id: string;
      productId: string;
      sourceImageId: string;
      variant: DatabaseProductImageVariant;
      storageUrl: string;
      publicUrl: string | null;
      widthPx: number | null;
      heightPx: number | null;
      mimeType: string | null;
      createdAt: Date;
    },
    selectedMainImageId: string | null
  ): ProductImageVariantRecord {
    return {
      imageId: asset.id,
      productId: asset.productId,
      sourceImageId: asset.sourceImageId,
      variant: asset.variant,
      originalUrl: asset.storageUrl,
      publicUrl: asset.publicUrl,
      widthPx: asset.widthPx,
      heightPx: asset.heightPx,
      mimeType: asset.mimeType,
      selectedAsMain: asset.id === selectedMainImageId,
      createdAt: asset.createdAt.toISOString()
    };
  }

  private toQualityIssues(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((issue): issue is string => typeof issue === "string")
      : [];
  }

  private toJobRecord(job: {
    id: string;
    productId: string;
    sourceImageId: string;
    operation: DatabaseImageProcessingOperation;
    targetVariant: DatabaseProductImageVariant;
    status: DatabaseImageProcessingStatus;
      provider: string | null;
      processorVersion: string | null;
      qualityScore: number | null;
      qualityIssues: unknown;
      fallbackFrom: string | null;
      fallbackReason: string | null;
      outputImageId: string | null;
    retryCount: number;
    failureCode: string | null;
    errorMessage: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ImageProcessingJobRecord {
    return {
      id: job.id,
      productId: job.productId,
      sourceImageId: job.sourceImageId,
      operation: job.operation as ImageProcessingOperation,
      targetVariant: job.targetVariant,
      status: job.status,
      provider: job.provider,
      processorVersion: job.processorVersion,
      qualityScore: job.qualityScore,
      qualityIssues: this.toQualityIssues(job.qualityIssues),
      fallbackFrom: job.fallbackFrom,
      fallbackReason: job.fallbackReason,
      outputImageId: job.outputImageId,
      retryCount: job.retryCount,
      failureCode: (job.failureCode as ImageProcessingJobRecord["failureCode"]) ?? null,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString()
    };
  }
}
