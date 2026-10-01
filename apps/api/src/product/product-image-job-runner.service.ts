import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  ActorType,
  ImageProcessingOperation,
  ImageProcessingStatus,
  Prisma,
  SourceApp,
  ProductImageType,
  ProductImageVariant,
  prisma
} from "@online-saler/database";
import { isShoeProduct, type BackgroundRemovalMode, type ImageProcessingJobRecord } from "@online-saler/shared-types";
import {
  BackgroundRemovalProviderError,
  type BackgroundRemovalResult
} from "./background-removal.provider";
import { ProductImageStorageService } from "./product-image-storage.service";
import {
  ProductImageTransformerService,
  type ProductImageTransformResult
} from "./product-image-transformer.service";
import { LightweightGarmentBalanceProvider } from "./lightweight-garment-balance.provider";
import {
  OpenAIDisplayImageError,
  OpenAIProductDisplayImageProvider,
  shadowSideFor
} from "./openai-product-display-image.provider";
import { SelectedBackgroundRemovalProvider } from "./selected-background-removal.provider";
import { AI_DISPLAY_PROVIDER, CUTOUT_DISPLAY_PROVIDER } from "./product-image-transformer.service";

type FallbackDisplayResult = ProductImageTransformResult & {
  qualityScore?: number | null;
  qualityIssues?: string[];
  fallbackFrom?: string | null;
  fallbackReason?: string | null;
};
type ProcessingResult = BackgroundRemovalResult | FallbackDisplayResult;

/** Which product a log line is about. Never holds image bytes or credentials. */
type DisplayLogContext = {
  jobId?: string;
  productId?: string;
  productCode?: string | null;
  batchCode?: string | null;
};

export const OPENAI_SAFETY_REJECTED = "OPENAI_SAFETY_REJECTED";
export const STAFF_USE_ORIGINAL = "STAFF_USE_ORIGINAL";

// The same steps on which a display image can be reviewed and confirmed.
const USE_ORIGINAL_DISPLAY_STATUSES = new Set<string>([
  "CALIBRATED", "BARCODE_ASSIGNED", "REVIEW_PENDING", "APPROVED", "READY_FOR_STORAGE", "UNPUBLISHED"
]);

/**
 * Whether an OpenAI refusal is answered with the local cutout. A safety
 * refusal and any other permanent 4xx are; rate limits, 5xx and timeouts are
 * not, because a plain retry of the AI usually succeeds and gives the better
 * image.
 */
export function displayFallbackReason(error: unknown): string | null {
  if (!(error instanceof OpenAIDisplayImageError)) return null;
  if (error.details.safetyRejected) return OPENAI_SAFETY_REJECTED;
  if (error.details.permanent) return `OPENAI_REJECTED_${error.details.httpStatus ?? "NO_IMAGE"}`;
  return null;
}

@Injectable()
export class ProductImageJobRunnerService {
  private readonly logger = new Logger(ProductImageJobRunnerService.name);

  constructor(
    private readonly storage: ProductImageStorageService,
    private readonly backgroundRemoval: SelectedBackgroundRemovalProvider,
    private readonly transformer: ProductImageTransformerService,
    private readonly garmentBalance: LightweightGarmentBalanceProvider,
    private readonly displayImage: OpenAIProductDisplayImageProvider
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
      // A concurrent request may already be executing this persisted job.
      return this.toRecord(existing, existing.outputImageId);
    }

    const job = await prisma.productImageProcessingJob.findUnique({ where: { id: jobId } });
    if (!job) throw new BadRequestException("Image processing job not found after claim");

    const logContext: DisplayLogContext = { jobId: job.id, productId: job.productId };
    try {
      const product = await prisma.product.findUnique({
        where: { id: job.productId },
        select: { category: true, subcategory: true, status: true, productCode: true, batch: { select: { batchCode: true } } }
      });
      if (!product) throw new BadRequestException("Product not found");
      logContext.productCode = product.productCode ?? null;
      logContext.batchCode = product.batch?.batchCode ?? null;
      const category = isShoeProduct(product.category, product.subcategory) ? "SHOES" : product.category;
      if (job.operation !== ImageProcessingOperation.GENERATE_AI_DISPLAY_MAIN_IMAGE) {
        throw new BadRequestException("Cutout processing is retired. Generate a white display image directly from the original photo.");
      }
      if (!["PHOTOGRAPHED", "AI_PROCESSING", "AI_PROCESSED", "CALIBRATION_PENDING", "CALIBRATED", "BARCODE_ASSIGNED", "REVIEW_PENDING", "APPROVED", "READY_FOR_STORAGE", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"].includes(product.status)) {
        throw new BadRequestException("An uploaded product is required before display generation");
      }
      const source = await this.loadSource(job, category);
      const result = await this.process(job.operation, source, backgroundRemovalMode, category, logContext);
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
      this.logDisplayFailure("display_image_generation_failed", logContext, failure);
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

  /**
   * Staff escape on the white-background review page: the original front
   * photo, centred on the white square, becomes this item's display image with
   * no AI involved. It is stored as an ordinary display image with its own
   * succeeded job, so review, labels and publishing treat it like any other;
   * the job's provider says it is the original photo.
   */
  async useOriginalAsDisplay(input: {
    productId: string;
    sourceImageId: string;
    adminUserId?: string | null;
    employeeId?: string | null;
  }): Promise<ImageProcessingJobRecord> {
    const product = await prisma.product.findUnique({
      where: { id: input.productId },
      select: { status: true, productCode: true }
    });
    if (!product) throw new BadRequestException("Product not found");
    if (!USE_ORIGINAL_DISPLAY_STATUSES.has(product.status)) {
      throw new BadRequestException(product.status === "PUBLISHED"
        ? "Unpublish the product before changing its display image."
        : "Confirm product information before choosing the display image.");
    }
    const latestFront = await prisma.productImage.findFirst({
      where: { productId: input.productId, type: ProductImageType.FRONT },
      orderBy: { createdAt: "desc" },
      select: { id: true }
    });
    if (!latestFront || latestFront.id !== input.sourceImageId) {
      throw new BadRequestException("Use the latest original FRONT photo of this product.");
    }
    const source = await this.loadSource({
      id: "use-original",
      productId: input.productId,
      sourceImageId: input.sourceImageId,
      operation: ImageProcessingOperation.GENERATE_AI_DISPLAY_MAIN_IMAGE
    });
    const framed = await this.transformer.frameOriginalAsDisplay(source.body);
    const previous = await prisma.productImageProcessingJob.findFirst({
      where: {
        productId: input.productId,
        sourceImageId: input.sourceImageId,
        operation: ImageProcessingOperation.GENERATE_AI_DISPLAY_MAIN_IMAGE
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, provider: true, failureCode: true }
    });
    const job = await prisma.productImageProcessingJob.create({
      data: {
        productId: input.productId,
        sourceImageId: input.sourceImageId,
        operation: ImageProcessingOperation.GENERATE_AI_DISPLAY_MAIN_IMAGE,
        targetVariant: ProductImageVariant.AI_DISPLAY_MAIN,
        status: ImageProcessingStatus.RUNNING,
        startedAt: new Date()
      }
    });
    const asset = await this.saveResult(job, {
      ...framed,
      fallbackFrom: previous?.provider ?? AI_DISPLAY_PROVIDER,
      fallbackReason: STAFF_USE_ORIGINAL
    });
    await prisma.auditLog.create({
      data: {
        actorType: ActorType.EMPLOYEE,
        actorId: input.employeeId?.trim() || null,
        actorAdminUserId: input.adminUserId?.trim() || null,
        sourceApp: SourceApp.OPERATIONS,
        module: "Product",
        entityType: "Product",
        entityId: input.productId,
        action: "PRODUCT_DISPLAY_IMAGE_USE_ORIGINAL",
        beforeJson: previous
          ? { jobId: previous.id, status: previous.status, provider: previous.provider, failureCode: previous.failureCode }
          : Prisma.JsonNull,
        afterJson: { jobId: job.id, imageId: asset.id, sourceImageId: input.sourceImageId, provider: framed.provider },
        reason: "Staff chose the original photo as the white-background display image."
      }
    });
    const completed = await prisma.productImageProcessingJob.findUnique({ where: { id: job.id } });
    if (!completed) throw new BadRequestException("Display image job not found after saving");
    return this.toRecord(completed, asset.id);
  }

  async waitForCompletion(jobId: string): Promise<ImageProcessingJobRecord> {
    const deadline = Date.now() + 210_000;
    while (Date.now() < deadline) {
      const job = await prisma.productImageProcessingJob.findUnique({ where: { id: jobId } });
      if (!job) throw new BadRequestException("Image processing job not found");
      if (job.status !== ImageProcessingStatus.RUNNING && job.status !== ImageProcessingStatus.PENDING) return this.toRecord(job, job.outputImageId);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new BadRequestException("White display image is still processing. Refresh its progress before retrying.");
  }

  private async loadSource(job: {
    id: string;
    productId: string;
    sourceImageId: string;
    operation: ImageProcessingOperation;
  }, category?: string | null): Promise<{ id: string; body: Buffer; contentType: string }> {
    const originalDisplay = job.operation === ImageProcessingOperation.GENERATE_AI_DISPLAY_MAIN_IMAGE;
    if (job.operation === ImageProcessingOperation.REMOVE_BACKGROUND || originalDisplay) {
      const source = await prisma.productImage.findFirst({
        where: {
          id: job.sourceImageId,
          productId: job.productId,
          type: originalDisplay ? ProductImageType.FRONT : { in: [ProductImageType.FRONT, ProductImageType.BACK] }
        }
      });
      if (!source) {
        throw new BackgroundRemovalProviderError(
          "PROCESSOR_REJECTED_IMAGE",
          "FRONT or BACK source image no longer exists"
        );
      }
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
    backgroundRemovalMode?: BackgroundRemovalMode,
    category?: string | null,
    logContext: DisplayLogContext = {}
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
      return this.garmentBalance.balance({
        body: source.body,
        contentType: source.contentType,
        filename: `${source.id}.png`
      });
    }
    if (operation === ImageProcessingOperation.GENERATE_AI_DISPLAY_MAIN_IMAGE) {
      const filename = `${source.id}.png`;
      let generated: ProductImageTransformResult;
      try {
        generated = await this.displayImage.generate({
          category,
          body: source.body,
          contentType: source.contentType,
          filename
        });
      } catch (error) {
        const fallbackReason = displayFallbackReason(error);
        if (!fallbackReason) throw error;
        return this.cutoutDisplay(source, filename, fallbackReason, error as OpenAIDisplayImageError, logContext);
      }
      // The model frames each item its own way; normalising afterwards gives
      // every storefront card the same subject size and margin.
      return this.transformer.normalizeDisplayFraming(generated);
    }
    throw new BadRequestException(`Unsupported image processing operation: ${operation}`);
  }

  /**
   * OpenAI refused the photo — usually its safety system objecting to a
   * printed character or brand, which on second-hand stock is normal. Make the
   * white display image with our own background removal instead, so the print
   * stays exactly as photographed and the item is not stuck waiting on OpenAI.
   */
  private async cutoutDisplay(
    source: { id: string; body: Buffer; contentType: string },
    filename: string,
    fallbackReason: string,
    openaiError: OpenAIDisplayImageError,
    logContext: DisplayLogContext
  ): Promise<FallbackDisplayResult> {
    let cutout: BackgroundRemovalResult;
    try {
      cutout = await this.backgroundRemoval.removeBackground({
        body: source.body,
        contentType: source.contentType,
        filename: `${source.id}.image`
      });
    } catch (cutoutError) {
      // Logged once, by run(), with OpenAI's details still attached.
      const reason = cutoutError instanceof Error ? cutoutError.message : "unknown";
      throw new OpenAIDisplayImageError(
        openaiError.code,
        `${openaiError.message} — local cutout fallback also failed: ${reason}`.slice(0, 1000),
        openaiError.details
      );
    }
    const composed = await this.transformer.composeCutoutDisplay(cutout.body, shadowSideFor(filename), {
      provider: CUTOUT_DISPLAY_PROVIDER,
      processorVersion: `${cutout.provider}:${cutout.processorVersion}`
    });
    this.logDisplayFailure("display_image_openai_rejected_used_cutout", logContext, openaiError, {
      fallbackReason,
      cutoutProvider: cutout.provider
    });
    return {
      ...composed,
      qualityScore: cutout.qualityScore ?? null,
      qualityIssues: cutout.qualityIssues ?? [],
      fallbackFrom: AI_DISPLAY_PROVIDER,
      fallbackReason
    };
  }

  /**
   * One JSON line per failure so Cloud Logging can filter on any field.
   * Only identifiers and OpenAI's own error text are written — never the API
   * key, the request body or image bytes.
   */
  private logDisplayFailure(
    event: string,
    context: DisplayLogContext,
    error: BackgroundRemovalProviderError,
    extra: Record<string, unknown> = {}
  ) {
    const openai = error instanceof OpenAIDisplayImageError ? error.details : null;
    const line = JSON.stringify({
      event,
      jobId: context.jobId ?? null,
      productId: context.productId ?? null,
      productCode: context.productCode ?? null,
      batchCode: context.batchCode ?? null,
      provider: openai ? AI_DISPLAY_PROVIDER : null,
      failureCode: error.code,
      httpStatus: openai?.httpStatus ?? null,
      openaiCode: openai?.openaiCode ?? null,
      openaiType: openai?.openaiType ?? null,
      openaiRequestId: openai?.requestId ?? null,
      safetyRejected: openai?.safetyRejected ?? false,
      openaiMessage: openai?.openaiMessage.slice(0, 600) ?? null,
      message: error.message.slice(0, 1000),
      ...extra
    });
    if (event === "display_image_openai_rejected_used_cutout") this.logger.warn(line);
    else this.logger.error(line);
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
