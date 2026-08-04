import { randomUUID } from "node:crypto";
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
import sharp from "sharp";
import type { GuidedCutoutPoint } from "./background-removal.provider";
import { LightweightBackgroundRemovalProvider } from "./lightweight-background-removal.provider";
import {
  canRetryImageProcessing,
  evaluateCutoutImageQuality,
  isSelectableMainVariant,
  sourceVariantForOperation,
  targetVariantForOperation
} from "./product-image-processing.rules";
import { findDerivedImageForSource } from "./product-image-comparison";
import { ProductDetailGenerationService } from "./product-detail-generation.service";
import { ProductImageStorageService } from "./product-image-storage.service";

@Injectable()
export class ProductImageProcessingService {
  constructor(
    private readonly details: ProductDetailGenerationService,
    private readonly storage: ProductImageStorageService,
    private readonly lightweight: LightweightBackgroundRemovalProvider
  ) {}

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

  async saveManualCutout(input: {
    productId: string;
    sourceImageId: string;
    body: Buffer;
  }): Promise<ImageProcessingJobRecord> {
    await this.requireSourceImage({
      productId: input.productId,
      sourceImageId: input.sourceImageId,
      variant: "ORIGINAL"
    });
    this.storage.validate("image/png", input.body.length);

    const analyzed = await analyzeManualCutout(input.body);
    const decision = evaluateCutoutImageQuality(analyzed);
    if (!decision.pass) {
      throw new BadRequestException(
        `Manual cutout still contains an invalid foreground (${decision.reason}). Continue erasing the board or mark the photo for retake.`
      );
    }

    return this.saveCorrectedCutout({
      ...input,
      analyzed,
      provider: "manual-cutout-editor",
      processorVersion: "manual-v1",
      fallbackReason: "MANUAL_CORRECTION",
      variantSlug: "cutout-transparent-manual"
    });
  }

  async saveGuidedCutout(input: {
    productId: string;
    sourceImageId: string;
    points: unknown;
  }): Promise<ImageProcessingJobRecord> {
    const points = validateGuidedCutoutPoints(input.points);
    const source = await prisma.productImage.findFirst({
      where: {
        id: input.sourceImageId,
        productId: input.productId,
        type: ProductImageType.FRONT
      },
      select: { id: true, originalUrl: true }
    });
    if (!source) {
      throw new BadRequestException("A FRONT original image is required for guided cutout");
    }
    if (!source.originalUrl.startsWith(`gs://${this.storage.bucket}/`)) {
      throw new BadRequestException("Original image is not stored in the configured image bucket");
    }
    const objectName = source.originalUrl.slice(`gs://${this.storage.bucket}/`.length);
    const stored = await this.storage.download(objectName);
    let guided;
    try {
      guided = await this.lightweight.removeBackgroundGuided(
        {
          body: Buffer.from(stored.body),
          contentType: stored.contentType,
          filename: `${source.id}.image`
        },
        points
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Guided cutout processing failed"
      );
    }

    const baseAnalysis = await analyzeManualCutout(guided.body);
    const analyzed = {
      ...baseAnalysis,
      qualityScore: Math.min(baseAnalysis.qualityScore, guided.qualityScore ?? 1),
      qualityIssues: [...new Set([...baseAnalysis.qualityIssues, ...(guided.qualityIssues ?? [])])]
    };
    const decision = evaluateCutoutImageQuality(analyzed);
    if (!decision.pass) {
      throw new BadRequestException(
        `Guided cutout did not isolate the garment (${decision.reason}). Move the outline closer to the garment or mark the photo for retake.`
      );
    }

    return this.saveCorrectedCutout({
      productId: input.productId,
      sourceImageId: input.sourceImageId,
      body: guided.body,
      analyzed,
      provider: guided.provider || "manual-guided-grabcut",
      processorVersion: guided.processorVersion || "guided-grabcut-v1",
      fallbackReason: "MANUAL_CONTOUR",
      variantSlug: "cutout-transparent-guided"
    });
  }

  private async saveCorrectedCutout(input: {
    productId: string;
    sourceImageId: string;
    body: Buffer;
    analyzed: Awaited<ReturnType<typeof analyzeManualCutout>>;
    provider: string;
    processorVersion: string;
    fallbackReason: string;
    variantSlug: string;
  }): Promise<ImageProcessingJobRecord> {
    const previousJob = await prisma.productImageProcessingJob.findFirst({
      where: {
        productId: input.productId,
        operation: DatabaseImageProcessingOperation.REMOVE_BACKGROUND
      },
      orderBy: { createdAt: "desc" },
      select: { provider: true }
    });
    const assetId = randomUUID();
    const objectName = this.storage.derivedObjectName(
      input.productId,
      assetId,
      input.variantSlug,
      "image/png"
    );
    await this.storage.upload(objectName, "image/png", input.body);

    const result = await prisma.$transaction(async (tx) => {
      const staleSelection = await tx.productMainImageSelection.findUnique({
        where: { productId: input.productId },
        select: { variant: true }
      });
      if (staleSelection && staleSelection.variant !== DatabaseProductImageVariant.ORIGINAL) {
        await tx.productMainImageSelection.delete({ where: { productId: input.productId } });
      }
      const asset = await tx.productImageVariantAsset.create({
        data: {
          id: assetId,
          productId: input.productId,
          sourceImageId: input.sourceImageId,
          variant: DatabaseProductImageVariant.CUTOUT_TRANSPARENT,
          storageUrl: `gs://${this.storage.bucket}/${objectName}`,
          publicUrl: `/products/${input.productId}/image-assets/${assetId}/content`,
          widthPx: input.analyzed.widthPx,
          heightPx: input.analyzed.heightPx,
          mimeType: "image/png"
        }
      });
      const job = await tx.productImageProcessingJob.create({
        data: {
          productId: input.productId,
          sourceImageId: input.sourceImageId,
          operation: DatabaseImageProcessingOperation.REMOVE_BACKGROUND,
          targetVariant: DatabaseProductImageVariant.CUTOUT_TRANSPARENT,
          status: DatabaseImageProcessingStatus.SUCCEEDED,
          provider: input.provider,
          processorVersion: input.processorVersion,
          qualityScore: input.analyzed.qualityScore,
          qualityIssues: input.analyzed.qualityIssues,
          fallbackFrom: previousJob?.provider ?? null,
          fallbackReason: input.fallbackReason,
          outputImageId: asset.id,
          startedAt: new Date(),
          completedAt: new Date()
        }
      });
      return { job, selectionCleared: Boolean(staleSelection && staleSelection.variant !== DatabaseProductImageVariant.ORIGINAL) };
    });

    if (result.selectionCleared) {
      await this.details.recordSourceChange(input.productId, "MAIN_IMAGE_CHANGED");
    }
    return this.toJobRecord(result.job);
  }

  async selectMainImage(input: {
    productId: string;
    imageId: string;
  }, options: { recordDetailSourceChange?: boolean; humanConfirmed?: boolean } = {}): Promise<ProductImageComparisonResponse> {
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
      await this.requireFrontImageAncestry(input.productId, input.imageId);
      await this.requireStorefrontQuality(input.productId, derivedSourceImageId);
    }

    const confirmedAt = options.humanConfirmed === false ? null : new Date();
    await prisma.productMainImageSelection.upsert({
      where: { productId: input.productId },
      create: {
        productId: input.productId,
        selectedImageId: input.imageId,
        variant: variant as DatabaseProductImageVariant,
        confirmedAt
      },
      update: {
        selectedImageId: input.imageId,
        variant: variant as DatabaseProductImageVariant,
        selectedAt: new Date(),
        confirmedAt
      }
    });
    if (currentSelection?.selectedImageId !== input.imageId && options.recordDetailSourceChange !== false) {
      await this.details.recordSourceChange(input.productId, "MAIN_IMAGE_CHANGED");
    }

    return this.getComparison(input.productId);
  }

  private async requireFrontImageAncestry(productId: string, imageId: string): Promise<void> {
    let currentImageId = imageId;

    for (let depth = 0; depth < 8; depth += 1) {
      const asset = await prisma.productImageVariantAsset.findFirst({
        where: { id: currentImageId, productId },
        select: { sourceImageId: true }
      });
      if (asset) {
        currentImageId = asset.sourceImageId;
        continue;
      }

      const original = await prisma.productImage.findFirst({
        where: { id: currentImageId, productId, type: ProductImageType.FRONT },
        select: { id: true }
      });
      if (original) return;
      break;
    }

    throw new BadRequestException("Only a FRONT image or its processed variants can be selected as the storefront main image");
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
        if (job.provider === "manual-cutout-editor") return;
        const decision = evaluateCutoutImageQuality({
          qualityScore: job.qualityScore,
          qualityIssues: this.toQualityIssues(job.qualityIssues)
        });
        if (!decision.pass) {
          throw new BadRequestException(
            `Cutout quality is insufficient for storefront use (${decision.reason}). Correct the cutout or retake the photo.`
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

    const [originals, assets, jobs, selection] = await Promise.all([
      prisma.productImage.findMany({
        where: {
          productId,
          type: { in: [ProductImageType.FRONT, ProductImageType.BACK] }
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

    const frontOriginal = originals.find((image) => image.type === ProductImageType.FRONT) ?? null;
    const backOriginal = originals.find((image) => image.type === ProductImageType.BACK) ?? null;
    const mapAsset = (
      variant: Exclude<ProductImageVariant, "ORIGINAL">,
      sourceImageId: string | null
    ) => {
      if (!sourceImageId) return null;
      const asset = findDerivedImageForSource(
        assets,
        variant,
        sourceImageId,
        selection?.selectedImageId ?? null
      );
      return asset ? this.toAssetRecord(asset, selection?.selectedImageId ?? null) : null;
    };
    const frontTransparent = mapAsset("CUTOUT_TRANSPARENT", frontOriginal?.id ?? null);
    const frontWhite = mapAsset("CUTOUT_WHITE", frontTransparent?.imageId ?? null);
    const backTransparent = mapAsset("CUTOUT_TRANSPARENT", backOriginal?.id ?? null);

    return {
      productId,
      original: frontOriginal ? this.toOriginalRecord(frontOriginal, selection?.selectedImageId ?? null) : null,
      cutoutTransparent: frontTransparent,
      cutoutWhite: frontWhite,
      optimizedMain: mapAsset("OPTIMIZED_MAIN", frontWhite?.imageId ?? null),
      optimizedBalancedMain: mapAsset("OPTIMIZED_BALANCED_MAIN", frontTransparent?.imageId ?? null),
      aiDisplayMain: mapAsset("AI_DISPLAY_MAIN", frontWhite?.imageId ?? null),
      backOriginal: backOriginal ? this.toOriginalRecord(backOriginal, selection?.selectedImageId ?? null) : null,
      backCutoutTransparent: backTransparent,
      backCutoutWhite: mapAsset("CUTOUT_WHITE", backTransparent?.imageId ?? null),
      selectedMainImageId: selection?.selectedImageId ?? null,
      selectedMainImageConfirmedAt: selection?.confirmedAt?.toISOString() ?? null,
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
          type: { in: [ProductImageType.FRONT, ProductImageType.BACK] }
        },
        select: { id: true }
      });
      if (!original) {
        throw new BadRequestException("A FRONT or BACK original image is required for background removal");
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

  private toOriginalRecord(
    original: {
      id: string;
      productId: string;
      originalUrl: string;
      publicUrl: string | null;
      createdAt: Date;
    },
    selectedMainImageId: string | null
  ): ProductImageVariantRecord {
    return {
      imageId: original.id,
      productId: original.productId,
      sourceImageId: null,
      variant: "ORIGINAL",
      originalUrl: original.originalUrl,
      publicUrl: original.publicUrl,
      widthPx: null,
      heightPx: null,
      mimeType: null,
      selectedAsMain: original.id === selectedMainImageId,
      createdAt: original.createdAt.toISOString()
    };
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

export async function analyzeManualCutout(body: Buffer): Promise<{
  widthPx: number;
  heightPx: number;
  qualityScore: number;
  qualityIssues: string[];
}> {
  let decoded;
  try {
    decoded = await sharp(body, { limitInputPixels: 40_000_000 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new BadRequestException("Manual cutout is not a valid PNG image");
  }
  const { width, height, channels } = decoded.info;
  if (!width || !height || channels < 4) {
    throw new BadRequestException("Manual cutout must contain an alpha channel");
  }

  let foreground = 0;
  let edgeForeground = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = decoded.data[(y * width + x) * channels + 3] ?? 0;
      if (alpha <= 16) continue;
      foreground += 1;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edgeForeground += 1;
    }
  }
  const areaRatio = foreground / Math.max(1, width * height);
  const edgeRatio = edgeForeground / Math.max(1, width * 2 + height * 2 - 4);
  const qualityIssues: string[] = [];
  if (areaRatio < 0.06) qualityIssues.push("SUBJECT_TOO_SMALL");
  if (areaRatio > 0.82) qualityIssues.push("SUBJECT_TOO_LARGE");
  if (edgeRatio > 0.04) qualityIssues.push("SUBJECT_TOUCHES_EDGE");
  const qualityScore = Math.max(
    0,
    Math.min(1, 1 - Math.min(Math.abs(areaRatio - 0.34), 0.34) * 0.45 - Math.min(edgeRatio, 0.2) * 1.5 - qualityIssues.length * 0.08)
  );
  return {
    widthPx: width,
    heightPx: height,
    qualityScore: Math.round(qualityScore * 1000) / 1000,
    qualityIssues
  };
}

export function validateGuidedCutoutPoints(value: unknown): GuidedCutoutPoint[] {
  if (!Array.isArray(value) || value.length < 6 || value.length > 60) {
    throw new BadRequestException("Guided cutout requires between 6 and 60 outline points");
  }
  const points = value.map((point) => {
    if (!point || typeof point !== "object" || Array.isArray(point)) {
      throw new BadRequestException("Each guided cutout point must contain normalized x and y values");
    }
    const x = Number((point as { x?: unknown }).x);
    const y = Number((point as { y?: unknown }).y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
      throw new BadRequestException("Guided cutout point coordinates must be between 0 and 1");
    }
    return { x, y };
  });
  const area = Math.abs(points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return total + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
  if (area < 0.01) {
    throw new BadRequestException("Guided cutout outline is too small or crosses itself");
  }
  if (area > 0.9) {
    throw new BadRequestException("Guided cutout outline must stay close to the garment");
  }
  return points;
}
