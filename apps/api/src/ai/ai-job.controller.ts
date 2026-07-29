import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import type { AIExtractionRequest } from "@online-saler/shared-types";
import { AIJobService } from "./ai-job.service";

@Controller("ai-jobs")
export class AIJobController {
  constructor(private readonly service: AIJobService) {}

  @Post()
  submit(@Body() body: AIExtractionRequest) {
    return this.service.submit(body);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.service.get(id);
  }
}
