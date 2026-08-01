import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import {
  ImageProcessingOperation,
  ImageProcessingStatus,
  Prisma,
  ProductImageType,
  ProductImageVariant,
  prisma
} from "@online-saler/database";
import type { BackgroundRemovalMode, ImageProcessingJobRecord } from "@online-saler/shared-types";
import {
  BackgroundRemovalProviderError,
  type BackgroundRemovalResult
} from "./background-removal.provider";
import { ProductImageStorageService } from "./product-image-storage.service";
import {
  ProductImageTransformerService,
  type ProductImageTransformResult
} from "./product-image-transformer.service";
import { SelectedBackgroundRemovalProvider } from "./selected-background-removal.provider";

type ProcessingResult = BackgroundRemovalResult | ProductImageTransformResult;

@Injectable()
export class ProductImageJobRunnerService {
  constructor(
    private readonly storage: ProductImageStorageService,
    private readonly backgroundRemoval: SelectedBackgroundRemovalProvider,
    private readonly transformer: ProductImageTransformerService
  ) {}

  async run(
    jobId: string,
    backgroundRemovalMode?: BackgroundRemovalMode
  ): Promise<ImageProcessingJobRecord> {
    const claimed = await prisma.productImageProcessingJob.updateMany({
      where: { id: jobId, status: ImageProcessingStatus.PENDING },
      data: {
        status: ImageProcessingStatus.RUNNING,
        provider: null,
        processorVersion: null,
        qualityScore: null,
        qualityIssues: Prisma.JsonNull,
        fallbackFrom: null,
        fallbackReason: null,
        startedAt: new Date(),
        completedAt: null,
        failureCode: null,
        errorMessage: null
      }
    });

    if (claimed.count !== 1) {
      const existing = await prisma.productImageProcessingJob.findUnique({ where: { id: jobId } });
      if (!existing) throw new BadRequestException("Image processing job not found");
      throw new BadRequestException(
        `Job must be PENDING before execution; current status is ${existing.status}`
      );
    }

    const job = await prisma.productImageProcessingJob.findUnique({ where: { id: jobId } });
    if (!job) throw new BadRequestException("Image processing job not found after claim");

    try {
      const source = await this.loadSource(job);
      const result = await this.process(job.operation, source, backgroundRemovalMode);
      const asset = await this.saveResult(job, result);
      const completed = await prisma.productImageProcessingJob.findUnique({ where: { id: job.id } });
      if (!completed) throw new BadRequestException("Completed image processing job not found");
      return this.toRecord(completed, asset.id);
    } catch (error) {
      const failure = error instanceof BackgroundRemovalProviderError
        ? error
        : new BackgroundRemovalProviderError(
            "UNKNOWN",
            error instanceof Error ? error.message : "Unknown image processing failure"
          );
      const failed = await prisma.productImageProcessingJob.update({
        where: { id: job.id },
        data: {
          status: ImageProcessingStatus.FAILED,
          failureCode: failure.code,
          errorMessage: failure.message.slice(0, 1000),
          completedAt: new Date()
        }
      });
      return this.toRecord(failed, null);
    }
  }

  private async loadSource(job: {
    id: string;
    productId: string;
    sourceImageId: string;
    operation: ImageProcessingOperation;
  }): Promise<{ id: string; body: Buffer; contentType: string }> {
    if (job.operation === ImageProcessingOperation.REMOVE_BACKGROUND) {
      const source = await prisma.productImage.findFirst({
        where: { id: job.sourceImageId, productId: job.productId, type: ProductImageType.FRONT }
      });
      if (!source) throw new BackgroundRemovalProviderError("PROCESSOR_REJECTED_IMAGE", "FRONT source image no longer exists");
      return this.downloadStoredSource(source.id, source.originalUrl);
    }

    const source = await prisma.productImageVariantAsset.findFirst({
      where: { id: job.sourceImageId, productId: job.productId }
    });
    if (!source) throw new BackgroundRemovalProviderError("PROCESSOR_REJECTED_IMAGE", "Derived source image no longer exists");
    return this.downloadStoredSource(source.id, source.storageUrl);
  }

  private async downloadStoredSource(id: string, storageUrl: string) {
    if (!storageUrl.startsWith(`gs://${this.storage.bucket}/`)) {
      throw new BackgroundRemovalProviderError(
        "PROCESSOR_REJECTED_IMAGE",
        "Source image is not stored in the configured product image bucket"
      );
    }
    const objectName = storageUrl.slice(`gs://${this.storage.bucket}/`.length);
    const stored = await this.storage.download(objectName);
    return { id, body: Buffer.from(stored.body), contentType: stored.contentType };
  }

  private async process(
    operation: ImageProcessingOperation,
    source: { id: string; body: Buffer; contentType: string },
    backgroundRemovalMode?: BackgroundRemovalMode
  ): Promise<ProcessingResult> {
    if (operation === ImageProcessingOperation.REMOVE_BACKGROUND) {
      return this.backgroundRemoval.removeBackground(
        { body: source.body, contentType: source.contentType, filename: `${source.id}.image` },
        backgroundRemovalMode
      );
    }
    if (operation === ImageProcessingOperation.COMPOSE_WHITE_BACKGROUND) {
      return this.transformer.composeWhiteBackground(source.body);
    }
    if (operation === ImageProcessingOperation.OPTIMIZE_MAIN_IMAGE) {
      return this.transformer.optimizeMainImage(source.body);
    }
    if (operation === ImageProcessingOperation.OPTIMIZE_BALANCED_MAIN_IMAGE) {
      return this.transformer.optimizeBalancedMainImage(source.body);
    }
    throw new BadRequestException(`Unsupported image processing operation: ${operation}`);
  }

  private async saveResult(
    job: {
      id: string;
      productId: string;
      sourceImageId: string;
      targetVariant: ProductImageVariant;
    },
    result: ProcessingResult
  ) {
    const assetId = randomUUID();
    const variantSlug = job.targetVariant.toLowerCase().replaceAll("_", "-");
    const outputObjectName = this.storage.derivedObjectName(
      job.productId,
      assetId,
      variantSlug,
      result.contentType
    );
    await this.storage.upload(outputObjectName, result.contentType, result.body);

    return prisma.$transaction(async (tx) => {
      const saved = await tx.productImageVariantAsset.create({
        data: {
          id: assetId,
          productId: job.productId,
          sourceImageId: job.sourceImageId,
          variant: job.targetVariant,
          storageUrl: `gs://${this.storage.bucket}/${outputObjectName}`,
          publicUrl: `/products/${job.productId}/image-assets/${assetId}/content`,
          mimeType: result.contentType,
          widthPx: "widthPx" in result ? result.widthPx : null,
          heightPx: "heightPx" in result ? result.heightPx : null
        }
      });
      await tx.productImageProcessingJob.update({
        where: { id: job.id },
        data: {
          status: ImageProcessingStatus.SUCCEEDED,
          provider: result.provider,
          processorVersion: result.processorVersion,
          qualityScore: "qualityScore" in result ? result.qualityScore ?? null : null,
          qualityIssues: "qualityIssues" in result ? result.qualityIssues ?? [] : [],
          fallbackFrom: "fallbackFrom" in result ? result.fallbackFrom ?? null : null,
          fallbackReason: "fallbackReason" in result ? result.fallbackReason ?? null : null,
          outputImageId: saved.id,
          completedAt: new Date(),
          failureCode: null,
          errorMessage: null
        }
      });
      return saved;
    });
  }

  private toRecord(
    job: {
      id: string;
      productId: string;
      sourceImageId: string;
      operation: ImageProcessingOperation;
      targetVariant: ProductImageVariant;
      status: ImageProcessingStatus;
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
    },
    outputImageId: string | null
  ): ImageProcessingJobRecord {
    return {
      id: job.id,
      productId: job.productId,
      sourceImageId: job.sourceImageId,
      operation: job.operation,
      targetVariant: job.targetVariant,
      status: job.status,
      provider: job.provider,
      processorVersion: job.processorVersion,
      qualityScore: job.qualityScore,
      qualityIssues: Array.isArray(job.qualityIssues)
        ? job.qualityIssues.filter((issue): issue is string => typeof issue === "string")
        : [],
      fallbackFrom: job.fallbackFrom,
      fallbackReason: job.fallbackReason,
      outputImageId: outputImageId ?? job.outputImageId,
      retryCount: job.retryCount,
      failureCode: job.failureCode as ImageProcessingJobRecord["failureCode"],
      errorMessage: job.errorMessage,
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString()
    };
  }
}
