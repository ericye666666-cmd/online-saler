import { Injectable } from "@nestjs/common";
import type { AIExtractionRequest } from "@online-saler/shared-types";
import type { AIProvider, AIProviderResult } from "./ai-provider";

@Injectable()
export class MockAIProvider implements AIProvider {
  async extract(request: AIExtractionRequest): Promise<AIProviderResult> {
    const startedAt = Date.now();
    const firstImageId = request.imageIds[0];
    const evidenceImageIds = firstImageId ? [firstImageId] : [];
    const normalizedOutput = {
      category: { value: "TSHIRTS" as const, confidence: 0.93, evidenceImageIds },
      subcategory: { value: "TSHIRT" as const, confidence: 0.9, evidenceImageIds },
      primaryColor: { value: "ORANGE" as const, confidence: 0.9, evidenceImageIds },
      audience: { value: "UNISEX" as const, confidence: 0.72, evidenceImageIds },
      kidsAgeRange: { value: "NOT_APPLICABLE" as const, confidence: 0.9, evidenceImageIds },
      pattern: { value: "GRAPHIC" as const, confidence: 0.86, evidenceImageIds },
      sleeveType: { value: "SHORT" as const, confidence: 0.82, evidenceImageIds },
      brandLabel: { value: "Mock Brand", confidence: 0.61, evidenceImageIds },
      sizeLabel: { value: "M", confidence: 0.74, evidenceImageIds },
      ukSizeLabel: { value: "UK M", confidence: 0.68, evidenceImageIds },
      title: { value: "Coral Orange Graphic T-Shirt", confidence: 0.9, evidenceImageIds },
      lengthCm: { value: 68, confidence: 0.82, evidenceImageIds },
      chestWidthCm: { value: 51, confidence: 0.8, evidenceImageIds },
      shoulderWidthCm: { value: 43, confidence: 0.78, evidenceImageIds },
      sleeveLengthCm: { value: 21, confidence: 0.77, evidenceImageIds },
      waistCm: { value: null, confidence: 0.4, evidenceImageIds },
      hipCm: { value: null, confidence: 0.4, evidenceImageIds },
      thighWidthCm: { value: null, confidence: 0.4, evidenceImageIds },
      legOpeningCm: { value: null, confidence: 0.4, evidenceImageIds },
      inseamCm: { value: null, confidence: 0.4, evidenceImageIds }
    };

    return {
      provider: "mock",
      model: "deterministic-v1",
      rawOutput: normalizedOutput,
      normalizedOutput,
      latencyMs: Date.now() - startedAt
    };
  }
}
