import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AIExtractionStatus, ProductStatus, Prisma, prisma } from "@online-saler/database";
import {
  AI_EXTRACTED_FIELDS,
  AI_MEASUREMENT_FIELDS,
  requiresHumanConfirmation,
  isShoeCategory,
  isShoeProduct,
  SHOE_REQUIRED_IMAGE_TYPES,
  type AIExtractionRequest,
  type AIExtractionResult,
  type AIExtractedField
} from "@online-saler/shared-types";
import { normalizeShoeExtraction } from "./openai-vision-normalizer";
import { AI_PROVIDER, type AIProvider } from "./ai-provider";

@Injectable()
export class AIJobService {
  constructor(@Inject(AI_PROVIDER) private readonly provider: AIProvider) {}

  async submit(request: AIExtractionRequest): Promise<AIExtractionResult> {
    if (!request.productId || request.imageIds.length === 0 || !request.promptVersion) {
      throw new BadRequestException("productId, imageIds and promptVersion are required");
    }

    const product = await prisma.product.findUnique({ where: { id: request.productId } });
    if (!product) throw new NotFoundException("Product not found");

    const providerRequest = { ...request, categoryHint: isShoeProduct(product.category, product.subcategory) ? "SHOES" : product.category };
    if (isShoeCategory(providerRequest.categoryHint)) {
      providerRequest.imageIds = await this.requireShoeOriginals(providerRequest);
    }
    const extraction = await prisma.aIExtraction.create({
      data: {
        productId: request.productId,
        promptVersion: request.promptVersion,
        requestJson: providerRequest as unknown as Prisma.InputJsonValue,
        inputImageIds: providerRequest.imageIds,
        status: AIExtractionStatus.RUNNING,
        startedAt: new Date()
      }
    });

    await prisma.product.update({
      where: { id: request.productId },
      data: { status: ProductStatus.AI_PROCESSING }
    });

    try {
      const output = await this.provider.extract(providerRequest);
      if (isShoeCategory(providerRequest.categoryHint) || isShoeProduct(output.normalizedOutput.category.value, output.normalizedOutput.subcategory.value)) {
        if (!isShoeCategory(providerRequest.categoryHint)) await this.requireShoeOriginals(providerRequest);
        output.normalizedOutput = normalizeShoeExtraction(output.normalizedOutput);
      }
      const completedAt = new Date();
      await prisma.$transaction([
        prisma.aIExtraction.update({
          where: { id: extraction.id },
          data: {
            provider: output.provider,
            model: output.model,
            rawOutputJson: output.rawOutput as Prisma.InputJsonValue,
            normalizedOutputJson: output.normalizedOutput as unknown as Prisma.InputJsonValue,
            status: AIExtractionStatus.SUCCEEDED,
            latencyMs: output.latencyMs,
            inputTokens: output.inputTokens,
            outputTokens: output.outputTokens,
            completedAt
          }
        }),
        ...AI_EXTRACTED_FIELDS.flatMap((field) => {
          const value = output.normalizedOutput[field];
          if (!value) return [];
          return prisma.aIFieldDecision.create({
            data: {
              extractionId: extraction.id,
              fieldName: field,
              aiValueJson: value.value === null
                ? Prisma.JsonNull
                : value.value as unknown as Prisma.InputJsonValue,
              confidence: value.confidence,
              evidenceImageIds: value.evidenceImageIds ?? [],
              requiresHumanConfirmation: requiresHumanConfirmation(field as AIExtractedField, value.confidence)
            }
          });
        }),
        ...AI_MEASUREMENT_FIELDS.flatMap(({ field, measurementType }) => {
          const measurement = output.normalizedOutput[field];
          if (measurement.value === null) return [];
          return [
            prisma.productMeasurement.upsert({
              where: {
                productId_measurementType: {
                  productId: request.productId,
                  measurementType
                }
              },
              create: {
                productId: request.productId,
                measurementType,
                aiValueCm: measurement.value,
                aiConfidence: measurement.confidence
              },
              update: {
                aiValueCm: measurement.value,
                aiConfidence: measurement.confidence
              }
            })
          ];
        }),
        prisma.product.update({
          where: { id: request.productId },
          data: { status: ProductStatus.CALIBRATION_PENDING }
        })
      ]);

      return this.get(extraction.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown AI provider error";
      await prisma.$transaction([
        prisma.aIExtraction.update({
          where: { id: extraction.id },
          data: {
            status: AIExtractionStatus.FAILED,
            errorMessage: message,
            failureCode: "PROVIDER_ERROR",
            completedAt: new Date()
          }
        }),
        prisma.product.updateMany({
          where: { id: request.productId, status: ProductStatus.AI_PROCESSING },
          data: { status: product.status }
        })
      ]);
      throw new BadRequestException(message);
    }
  }

  private async requireShoeOriginals(request: AIExtractionRequest) {
    const originals = await prisma.productImage.findMany({
      where: { productId: request.productId },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true }
    });
    const requestedIds = new Set(request.imageIds);
    if (request.imageIds.some((id) => !originals.some((image) => image.id === id))) {
      throw new BadRequestException("Shoe recognition accepts only this product's original images");
    }
    const missing = SHOE_REQUIRED_IMAGE_TYPES.filter((type) => {
      const latest = originals.find((image) => image.type === type);
      return !latest || !requestedIds.has(latest.id);
    });
    if (missing.length) {
      throw new BadRequestException(`Shoe recognition requires the latest original pair, side, soles and size-label photos; missing: ${missing.join(", ")}`);
    }
    // Retakes are retained for the audit trail but must not compete with the
    // current label or inflate every recognition request. Include the latest
    // defect photo when present, even when a caller omits that optional slot.
    return [...SHOE_REQUIRED_IMAGE_TYPES, "DEFECT" as const].flatMap((type) => {
      const latest = originals.find((image) => image.type === type);
      return latest ? [latest.id] : [];
    });
  }

  async get(id: string): Promise<AIExtractionResult> {
    const extraction = await prisma.aIExtraction.findUnique({ where: { id } });
    if (!extraction) throw new NotFoundException("AI extraction not found");

    return {
      extractionId: extraction.id,
      productId: extraction.productId,
      status: extraction.status,
      provider: extraction.provider ?? "unknown",
      model: extraction.model ?? "unknown",
      promptVersion: extraction.promptVersion ?? "unknown",
      normalizedOutput:
        extraction.normalizedOutputJson as unknown as AIExtractionResult["normalizedOutput"],
      rawOutput: extraction.rawOutputJson,
      latencyMs: extraction.latencyMs ?? undefined,
      inputTokens: extraction.inputTokens ?? undefined,
      outputTokens: extraction.outputTokens ?? undefined,
      failureCode: extraction.failureCode ?? undefined,
      failureReason: extraction.errorMessage ?? undefined,
      createdAt: extraction.createdAt.toISOString(),
      completedAt: extraction.completedAt?.toISOString()
    };
  }
}
