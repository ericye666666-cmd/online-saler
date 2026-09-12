import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import type { AIExtractionRequest } from "@online-saler/shared-types";
import { OperationsRequestIdentity } from "../operations/operations-request-identity";
import { AIJobService } from "./ai-job.service";

@Controller("ai-jobs")
export class AIJobController {
  constructor(private readonly service: AIJobService, private readonly identity: OperationsRequestIdentity) {}

  @Post()
  async submit(@Headers("authorization") authorization: string | undefined, @Body() body: AIExtractionRequest & { adminUserId?: string }) {
    const session = await this.identity.permission(authorization, "action.product.edit");
    const input = { ...body, adminUserId: session.adminUser!.id };
    return this.service.submit(input);
  }

  @Get(":id")
  async get(@Param("id") id: string, @Headers("authorization") authorization?: string) {
    await this.identity.permission(authorization, "page.product.digitalization");
    return this.service.get(id);
  }
}
