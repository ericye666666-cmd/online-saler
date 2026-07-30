import { Module } from "@nestjs/common";
import { ProductModule } from "../product/product.module";
import { AIJobController } from "./ai-job.controller";
import { AIJobService } from "./ai-job.service";
import { AI_PROVIDER } from "./ai-provider";
import { SelectedAIProvider } from "./ai-provider-selection";
import { MockAIProvider } from "./mock-ai.provider";
import { OpenAIVisionProvider } from "./openai-vision.provider";

@Module({
  imports: [ProductModule],
  controllers: [AIJobController],
  providers: [
    AIJobService,
    MockAIProvider,
    OpenAIVisionProvider,
    SelectedAIProvider,
    { provide: AI_PROVIDER, useExisting: SelectedAIProvider }
  ],
  exports: [AIJobService]
})
export class AIModule {}
