import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ProductDetailStatus,
  ProductImageType,
  Prisma,
  prisma
} from "@online-saler/database";
import { ProductDetailOpenAIProvider } from "./product-detail-openai.provider";
import { ProductDetailAssetService } from "./product-detail-asset.service";
import type { ProductDetailFacts } from "./product-detail-copy";

const DETAIL_IMAGE_TYPES = new Set<ProductImageType>([
  ProductImageType.FRONT,
  ProductImageType.BACK,
  ProductImageType.LABEL,
  ProductImageType.DETAIL,
  ProductImageType.DEFECT
]);

export const DETAIL_GENERATION_BATCH_CONCURRENCY = 3;

@Injectable()
export class ProductDetailGenerationRunnerService {
  constructor(
    private readonly provider: ProductDetailOpenAIProvider,
    private readonly assets: ProductDetailAssetService
  ) {}

  async run(jobId: string) {
    const claimed = await prisma.productDetailGenerationJob.updateMany({
      where: { id: jobId, status: ProductDetailStatus.PENDING },
      data: {
        status: ProductDetailStatus.GENERATING,
        startedAt: new Date(),
        completedAt: null,
        failureCode: null,
        errorMessage: null
      }
    });
    if (claimed.count !== 1) {
      const existing = await prisma.productDetailGenerationJob.findUnique({ where: { id: jobId } });
      if (!existing) throw new NotFoundException("Product detail generation job not found");
      throw new BadRequestException("Only pending product detail jobs can run");
    }

    await prisma.productDetailGenerationJob
      .findUnique({ where: { id: jobId }, select: { detailProfileId: true } })
      .then((job) =>
        job
          ? prisma.productDetailProfile.update({
              where: { id: job.detailProfileId },
              data: { status: ProductDetailStatus.GENERATING }
            })
          : undefined
      );

    try {
      const job = await prisma.productDetailGenerationJob.findUnique({
        where: { id: jobId },
        include: {
          detailProfile: true,
          product: {
            include: {
              measurements: true,
              defects: true,
              images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }
            }
          }
        }
      });
      if (!job) throw new NotFoundException("Product detail generation job not found");
      if (job.product.detailSourceVersion !== job.sourceDataVersion) {
        await this.markOutdated(job.id, job.detailProfileId, "SOURCE_VERSION_CHANGED_BEFORE_GENERATION");
        throw new BadRequestException("Product facts changed before detail generation started");
      }

      const facts = buildProductDetailFacts(job.product, job.detailProfile, job.sourceDataVersion);
      const originalImages = job.product.images.filter((image) => DETAIL_IMAGE_TYPES.has(image.type));
      const result = await this.provider.generate(facts, originalImages);

      const generated = await prisma.$transaction(async (transaction) => {
        const current = await transaction.product.findUnique({
          where: { id: job.productId },
          select: { detailSourceVersion: true }
        });
        if (!current || current.detailSourceVersion !== job.sourceDataVersion) {
          const outdatedAt = new Date();
          await transaction.productDetailGenerationJob.update({
            where: { id: job.id },
            data: {
              status: ProductDetailStatus.OUTDATED,
              outdatedReason: "SOURCE_VERSION_CHANGED_DURING_GENERATION",
              outdatedAt,
              completedAt: outdatedAt
            }
          });
          await transaction.productDetailProfile.update({
            where: { id: job.detailProfileId },
            data: {
              status: ProductDetailStatus.OUTDATED,
              outdatedReason: "SOURCE_VERSION_CHANGED_DURING_GENERATION",
              outdatedAt
            }
          });
          throw new BadRequestException("Product facts changed while detail generation was running");
        }

        const copy = result.finalOutput;
        const profile = await transaction.productDetailProfile.update({
          where: { id: job.detailProfileId },
          data: {
            status: ProductDetailStatus.GENERATING,
            sellingPointsJson: copy.sellingPoints,
            customerDescription: copy.shortDescription,
            fitSummary: copy.fitSummary,
            measurementSummary: null,
            conditionSummary: copy.conditionSummary,
            styleTagsJson: [],
            missingInformationJson: [],
            warningsJson: copy.warnings,
            generatedByModel: result.model,
            promptVersion: result.promptVersion,
            rawOutputJson: result.rawOutput as Prisma.InputJsonValue,
            finalOutputJson: copy as unknown as Prisma.InputJsonValue,
            contentVersion: { increment: 1 },
            outdatedReason: null,
            outdatedAt: null
          }
        });
        const generatingJob = await transaction.productDetailGenerationJob.update({
          where: { id: job.id },
          data: {
            status: ProductDetailStatus.GENERATING,
            provider: result.provider,
            model: result.model,
            promptVersion: result.promptVersion,
            requestJson: result.requestRecord as Prisma.InputJsonValue,
            rawOutputJson: result.rawOutput as Prisma.InputJsonValue,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            estimatedCostUsd: result.estimatedCostUsd
          }
        });
        return { job: generatingJob, profile, copy, latencyMs: result.latencyMs };
      });
      const detailAssets = await this.assets.generateForProfile(job.detailProfileId);
      const completed = await prisma.$transaction(async (transaction) => {
        const profile = await transaction.productDetailProfile.update({
          where: { id: job.detailProfileId },
          data: { status: ProductDetailStatus.READY }
        });
        const completedJob = await transaction.productDetailGenerationJob.update({
          where: { id: job.id },
          data: { status: ProductDetailStatus.READY, completedAt: new Date() }
        });
        return { profile, job: completedJob };
      });
      return { ...generated, ...completed, assets: detailAssets };
    } catch (error) {
      const existing = await prisma.productDetailGenerationJob.findUnique({
        where: { id: jobId },
        select: { status: true, detailProfileId: true }
      });
      if (existing?.status === ProductDetailStatus.GENERATING) {
        const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown detail generation error";
        await prisma.$transaction([
          prisma.productDetailGenerationJob.update({
            where: { id: jobId },
            data: {
              status: ProductDetailStatus.FAILED,
              failureCode: classifyFailure(error),
              errorMessage: message,
              completedAt: new Date()
            }
          }),
          prisma.productDetailProfile.update({
            where: { id: existing.detailProfileId },
            data: { status: ProductDetailStatus.FAILED }
          })
        ]);
      }
      throw error;
    }
  }

  async runBatch(batchId: string) {
    const jobs = await prisma.productDetailGenerationJob.findMany({
      where: { batchId, status: ProductDetailStatus.PENDING },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
    const results = [];
    for (let index = 0; index < jobs.length; index += DETAIL_GENERATION_BATCH_CONCURRENCY) {
      const group = jobs.slice(index, index + DETAIL_GENERATION_BATCH_CONCURRENCY);
      const groupResults = await Promise.all(group.map(async (job) => {
        try {
          const result = await this.run(job.id);
          return { jobId: job.id, status: ProductDetailStatus.READY, result };
        } catch (error) {
          return {
            jobId: job.id,
            status: ProductDetailStatus.FAILED,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }));
      results.push(...groupResults);
    }
    return { batchId, processed: results.length, results };
  }

  private async markOutdated(jobId: string, profileId: string, reason: string) {
    const outdatedAt = new Date();
    await prisma.$transaction([
      prisma.productDetailGenerationJob.update({
        where: { id: jobId },
        data: { status: ProductDetailStatus.OUTDATED, outdatedReason: reason, outdatedAt, completedAt: outdatedAt }
      }),
      prisma.productDetailProfile.update({
        where: { id: profileId },
        data: { status: ProductDetailStatus.OUTDATED, outdatedReason: reason, outdatedAt }
      })
    ]);
  }
}

type SourceProduct = {
  id: string;
  title: string | null;
  category: string | null;
  subcategory: string | null;
  gender: unknown;
  color: string | null;
  pattern: string | null;
  sleeveType: string | null;
  brand: string | null;
  tagSize: string | null;
  finalSizeLabel: string | null;
  conditionGrade: unknown;
  fitType: unknown;
  stretchLevel: unknown;
  fabricWeight: unknown;
  material: string | null;
  tags: string[];
  priceKsh: number | null;
  measurements: Array<{ measurementType: string; finalValueCm: unknown }>;
  defects: Array<{
    defectType: string;
    severity: unknown;
    description: string;
    customerSafeDescription: string | null;
  }>;
};

type SourceProfile = Record<string, unknown>;

export function buildProductDetailFacts(
  product: SourceProduct,
  _profile: SourceProfile,
  sourceDataVersion: number
): ProductDetailFacts {
  return {
    productId: product.id,
    sourceDataVersion,
    title: product.title,
    category: product.category,
    subcategory: product.subcategory,
    gender: stringOrNull(product.gender),
    color: product.color,
    pattern: product.pattern,
    sleeveType: product.sleeveType,
    brand: product.brand,
    tagSize: product.tagSize,
    platformSize: product.finalSizeLabel,
    conditionGrade: stringOrNull(product.conditionGrade),
    fitType: stringOrNull(product.fitType),
    stretchLevel: stringOrNull(product.stretchLevel),
    fabricWeight: stringOrNull(product.fabricWeight),
    material: product.material,
    tags: product.tags,
    priceKsh: product.priceKsh,
    measurementsCm: Object.fromEntries(
      product.measurements
        .filter((measurement) => measurement.finalValueCm !== null)
        .map((measurement) => [measurement.measurementType, Number(measurement.finalValueCm)])
    ),
    defects: product.defects.map((defect) => ({
      type: defect.defectType,
      severity: String(defect.severity),
      description: defect.description,
      customerSafeDescription: defect.customerSafeDescription
    }))
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function classifyFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/OpenAI API key/i.test(message)) return "PROCESSOR_NOT_CONFIGURED";
  if (/facts changed/i.test(message)) return "SOURCE_DATA_CHANGED";
  if (/valid JSON|output/i.test(message)) return "INVALID_MODEL_OUTPUT";
  return "DETAIL_GENERATION_FAILED";
}
