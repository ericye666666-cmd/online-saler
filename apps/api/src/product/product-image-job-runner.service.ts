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
import type { ImageProcessingJobRecord } from "@online-saler/shared-types";
import { BackgroundRemovalProviderError } from "./background-removal.provider";
import { ProductImageStorageService } from "./product-image-storage.service";
import { SelectedBackgroundRemovalProvider } from "./selected-background-removal.provider";

@Injectable()
export class ProductImageJobRunnerService {
  constructor(
    private readonly storage: ProductImageStorageService,
    private readonly backgroundRemoval: SelectedBackgroundRemovalProvider
  ) {}

  async run(jobId: string): Promise<ImageProcessingJobRecord> {
    const claimed = await prisma.productImageProcessingJob.updateMany({
      where: {
        id: jobId,
        status: ImageProcessingStatus.PENDING,
        operation: ImageProcessingOperation.REMOVE_BACKGROUND
      },
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
      if (existing.operation !== ImageProcessingOperation.REMOVE_BACKGROUND) {
        throw new BadRequestException("This runner only supports REMOVE_BACKGROUND jobs");
      }
      throw new BadRequestException(`Job must be PENDING before execution; current status is ${existing.status}`);
    }

    const job = await prisma.productImageProcessingJob.findUnique({ where: { id: jobId } });
    if (!job) throw new BadRequestException("Image processing job not found after claim");

    try {
      const source = await prisma.productImage.findFirst({
        where: {
          id: job.sourceImageId,
          productId: job.productId,
          type: ProductImageType.FRONT
        }
      });
      if (!source) {
        throw new BackgroundRemovalProviderError(
          "PROCESSOR_REJECTED_IMAGE",
          "FRONT source image no longer exists"
        );
      }
      if (!source.originalUrl.startsWith(`gs://${this.storage.bucket}/`)) {
        throw new BackgroundRemovalProviderError(
          "PROCESSOR_REJECTED_IMAGE",
          "Source image is not stored in the configured product image bucket"
        );
      }

      const sourceObjectName = source.originalUrl.slice(`gs://${this.storage.bucket}/`.length);
      const stored = await this.storage.download(sourceObjectName);
      const result = await this.backgroundRemoval.removeBackground({
        body: Buffer.from(stored.body),
        contentType: stored.contentType,
        filename: `${source.id}.png`
      });

      const existingAsset = await prisma.productImageVariantAsset.findUnique({
        where: {
          productId_sourceImageId_variant: {
            productId: job.productId,
            sourceImageId: job.sourceImageId,
            variant: ProductImageVariant.CUTOUT_TRANSPARENT
          }
        },
        select: { id: true }
      });
      const assetId = existingAsset?.id ?? randomUUID();
      const outputObjectName = this.storage.derivedObjectName(
        job.productId,
        assetId,
        "cutout-transparent",
        result.contentType
      );
      await this.storage.upload(outputObjectName, result.contentType, result.body);

      const asset = await prisma.$transaction(async (tx) => {
        const saved = await tx.productImageVariantAsset.upsert({
          where: {
            productId_sourceImageId_variant: {
              productId: job.productId,
              sourceImageId: job.sourceImageId,
              variant: ProductImageVariant.CUTOUT_TRANSPARENT
            }
          },
          create: {
            id: assetId,
            productId: job.productId,
            sourceImageId: job.sourceImageId,
            variant: ProductImageVariant.CUTOUT_TRANSPARENT,
            storageUrl: `gs://${this.storage.bucket}/${outputObjectName}`,
            publicUrl: `/products/${job.productId}/image-assets/${assetId}/content`,
            mimeType: result.contentType
          },
          update: {
            storageUrl: `gs://${this.storage.bucket}/${outputObjectName}`,
            publicUrl: `/products/${job.productId}/image-assets/${assetId}/content`,
            mimeType: result.contentType
          }
        });

        await tx.productImageProcessingJob.update({
          where: { id: job.id },
          data: {
            status: ImageProcessingStatus.SUCCEEDED,
            provider: result.provider,
            processorVersion: result.processorVersion,
            qualityScore: result.qualityScore ?? null,
            qualityIssues: result.qualityIssues ?? [],
            fallbackFrom: result.fallbackFrom ?? null,
            fallbackReason: result.fallbackReason ?? null,
            outputImageId: saved.id,
            completedAt: new Date(),
            failureCode: null,
            errorMessage: null
          }
        });

        return saved;
      });

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
