import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ProductDetailStatus,
  ProductImageType,
  Prisma,
  prisma
} from "@online-saler/database";
import { ProductDetailOpenAIProvider } from "./product-detail-openai.provider";
import type { ProductDetailFacts } from "./product-detail-copy";

const DETAIL_IMAGE_TYPES = new Set<ProductImageType>([
  ProductImageType.FRONT,
  ProductImageType.BACK,
  ProductImageType.LABEL,
  ProductImageType.DETAIL,
  ProductImageType.DEFECT
]);

@Injectable()
export class ProductDetailGenerationRunnerService {
  constructor(private readonly provider: ProductDetailOpenAIProvider) {}

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

      return prisma.$transaction(async (transaction) => {
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
            status: ProductDetailStatus.READY,
            sellingPointsJson: copy.sellingPoints,
            customerDescription: copy.shortDescription,
            fitSummary: copy.fitSummary,
            measurementSummary: copy.measurementSummary,
            conditionSummary: copy.conditionSummary,
            styleTagsJson: copy.styleTags,
            missingInformationJson: copy.missingInformation,
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
        const completedJob = await transaction.productDetailGenerationJob.update({
          where: { id: job.id },
          data: {
            status: ProductDetailStatus.READY,
            provider: result.provider,
            model: result.model,
            promptVersion: result.promptVersion,
            requestJson: result.requestRecord as Prisma.InputJsonValue,
            rawOutputJson: result.rawOutput as Prisma.InputJsonValue,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            estimatedCostUsd: result.estimatedCostUsd,
            completedAt: new Date()
          }
        });
        return { job: completedJob, profile, copy, latencyMs: result.latencyMs };
      });
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
    for (const job of jobs) {
      try {
        const result = await this.run(job.id);
        results.push({ jobId: job.id, status: ProductDetailStatus.READY, result });
      } catch (error) {
        results.push({
          jobId: job.id,
          status: ProductDetailStatus.FAILED,
          error: error instanceof Error ? error.message : String(error)
        });
      }
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
  priceKsh: number | null;
  measurements: Array<{ measurementType: string; finalValueCm: unknown }>;
  defects: Array<{
    defectType: string;
    severity: unknown;
    description: string;
    customerSafeDescription: string | null;
  }>;
};

type SourceProfile = {
  bodyChestMinCm: unknown;
  bodyChestMaxCm: unknown;
  bodyWaistMinCm: unknown;
  bodyWaistMaxCm: unknown;
  bodyHipMinCm: unknown;
  bodyHipMaxCm: unknown;
  heightMinCm: unknown;
  heightMaxCm: unknown;
  weightMinKg: unknown;
  weightMaxKg: unknown;
  expectedFit: string | null;
  recommendationConfidence: unknown;
  recommendationBasis: unknown;
  recommendationWarnings: unknown;
  sizeDisclaimer: string | null;
};

export function buildProductDetailFacts(
  product: SourceProduct,
  profile: SourceProfile,
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
    })),
    fitRecommendation: {
      bodyChestMinCm: numberOrNull(profile.bodyChestMinCm),
      bodyChestMaxCm: numberOrNull(profile.bodyChestMaxCm),
      bodyWaistMinCm: numberOrNull(profile.bodyWaistMinCm),
      bodyWaistMaxCm: numberOrNull(profile.bodyWaistMaxCm),
      bodyHipMinCm: numberOrNull(profile.bodyHipMinCm),
      bodyHipMaxCm: numberOrNull(profile.bodyHipMaxCm),
      heightMinCm: numberOrNull(profile.heightMinCm),
      heightMaxCm: numberOrNull(profile.heightMaxCm),
      weightMinKg: numberOrNull(profile.weightMinKg),
      weightMaxKg: numberOrNull(profile.weightMaxKg),
      expectedFit: profile.expectedFit,
      confidence: numberOrNull(profile.recommendationConfidence),
      basis: profile.recommendationBasis,
      warnings: profile.recommendationWarnings,
      disclaimer: profile.sizeDisclaimer
    }
  };
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
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
