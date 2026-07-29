import type { AIExtractionNormalizedOutput, AIExtractionRequest } from "@online-saler/shared-types";

export interface AIProviderResult {
  provider: string;
  model: string;
  rawOutput: unknown;
  normalizedOutput: AIExtractionNormalizedOutput;
  latencyMs: number;
}

export interface AIProvider {
  extract(request: AIExtractionRequest): Promise<AIProviderResult>;
}

export const AI_PROVIDER = Symbol("AI_PROVIDER");
