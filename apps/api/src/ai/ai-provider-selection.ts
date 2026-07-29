import { Injectable } from "@nestjs/common";
import type { AIExtractionRequest } from "@online-saler/shared-types";
import type { AIProvider, AIProviderResult } from "./ai-provider";
import { MockAIProvider } from "./mock-ai.provider";
import { OpenAIVisionProvider } from "./openai-vision.provider";

@Injectable()
export class SelectedAIProvider implements AIProvider {
  constructor(
    private readonly mock: MockAIProvider,
    private readonly openai: OpenAIVisionProvider
  ) {}

  async extract(request: AIExtractionRequest): Promise<AIProviderResult> {
    const mode = (process.env.AI_PROVIDER_MODE ?? "auto").trim().toLowerCase();
    if (mode === "mock") return this.mock.extract(request);
    if (mode === "openai") return this.openai.extract(request);
    return this.openai.isConfigured() ? this.openai.extract(request) : this.mock.extract(request);
  }
}
