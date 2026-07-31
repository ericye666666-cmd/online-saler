import { BadRequestException, Injectable } from "@nestjs/common";
import {
  ImageProcessingOperation as DatabaseImageProcessingOperation,
  ImageProcessingStatus as DatabaseImageProcessingStatus,
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
  isSelectableMainVariant,
  sourceVariantForOperation,
  targetVariantForOperation
} from "./product-image-processing.rules";

@Injectable()
export class ProductImageProcessingService {
  async start(input: {
    productId: string;
    sourceImageId: string;
    operation: string;
  }): Promise<ImageProcessingJobRecord> {
    if (!isImageProcessingOperation(input.operation)) {
      throw new BadRequestException("Unsupported image processing operation");
    }

    const operation = input.operation;
    const sourceImage = await prisma.productImage.findFirst({
      where: {
        id: input.sourceImageId,
        productId: input.productId
      }
    });

    if (!sourceImage) {
      throw new BadRequestException("Source image not found for this product");
    }
    if (sourceImage.type !== ProductImageType.FRONT) {
      throw new BadRequestException("Only FRONT images can enter the main-image pipeline");
    }

    const requiredSourceVariant = sourceVariantForOperation(operation);
    if (sourceImage.variant !== requiredSourceVariant) {
      throw new BadRequestException(
        `${operation} requires a ${requiredSourceVariant} source image`
      );
    }

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

    if (activeJob) {
      return this.toJobRecord(activeJob);
    }

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

    const retried = await prisma.productImageProcessingJob.update({
      where: { id: input.jobId },
      data: {
        status: DatabaseImageProcessingStatus.PENDING,
        retryCount: { increment: 1 },
        retryReason: input.reason?.trim() || null,
        provider: null,
        processorVersion: null,
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
    const image = await prisma.productImage.findFirst({
      where: {
        id: input.imageId,
        productId: input.productId,
        type: ProductImageType.FRONT
      }
    });

    if (!image) throw new BadRequestException("Front image not found for this product");
    if (!isSelectableMainVariant(image.variant)) {
      throw new BadRequestException("Transparent cutout cannot be selected as the storefront main image");
    }

    await prisma.product.update({
      where: { id: input.productId },
      data: { selectedMainImageId: image.id }
    });

    return this.getComparison(input.productId);
  }

  async getComparison(productId: string): Promise<ProductImageComparisonResponse> {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        selectedMainImageId: true,
        images: {
          where: { type: ProductImageType.FRONT },
          orderBy: { createdAt: "desc" }
        },
        imageProcessingJobs: {
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!product) throw new BadRequestException("Product not found");

    const byVariant = new Map<ProductImageVariant, (typeof product.images)[number]>();
    for (const image of product.images) {
      const variant = image.variant as ProductImageVariant;
      if (!byVariant.has(variant)) byVariant.set(variant, image);
    }

    const mapVariant = (variant: ProductImageVariant): ProductImageVariantRecord | null => {
      const image = byVariant.get(variant);
      return image ? this.toImageRecord(image, product.selectedMainImageId) : null;
    };

    return {
      productId,
      original: mapVariant("ORIGINAL"),
      cutoutTransparent: mapVariant("CUTOUT_TRANSPARENT"),
      cutoutWhite: mapVariant("CUTOUT_WHITE"),
      optimizedMain: mapVariant("OPTIMIZED_MAIN"),
      selectedMainImageId: product.selectedMainImageId,
      jobs: product.imageProcessingJobs.map((job) => this.toJobRecord(job))
    };
  }

  private toImageRecord(
    image: {
      id: string;
      productId: string;
      sourceImageId: string | null;
      variant: DatabaseProductImageVariant;
      originalUrl: string;
      publicUrl: string | null;
      widthPx: number | null;
      heightPx: number | null;
      mimeType: string | null;
      createdAt: Date;
    },
    selectedMainImageId: string | null
  ): ProductImageVariantRecord {
    return {
      imageId: image.id,
      productId: image.productId,
      sourceImageId: image.sourceImageId,
      variant: image.variant,
      originalUrl: image.originalUrl,
      publicUrl: image.publicUrl,
      widthPx: image.widthPx,
      heightPx: image.heightPx,
      mimeType: image.mimeType,
      selectedAsMain: image.id === selectedMainImageId,
      createdAt: image.createdAt.toISOString()
    };
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
