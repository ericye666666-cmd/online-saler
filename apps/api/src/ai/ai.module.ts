import { Module } from "@nestjs/common";
import { AIJobController } from "./ai-job.controller";
import { AIJobService } from "./ai-job.service";
import { AI_PROVIDER } from "./ai-provider";
import { MockAIProvider } from "./mock-ai.provider";

@Module({
  controllers: [AIJobController],
  providers: [AIJobService, MockAIProvider, { provide: AI_PROVIDER, useExisting: MockAIProvider }]
})
export class AIModule {}
