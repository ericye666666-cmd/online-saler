import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import type { AIExtractionRequest } from "@online-saler/shared-types";
import { ADMIN_USER_HEADER, requireAdminPermission } from "../operations/operations-access-check";
import { AIJobService } from "./ai-job.service";

@Controller("ai-jobs")
export class AIJobController {
  constructor(private readonly service: AIJobService) {}

  @Post()
  async submit(@Body() body: AIExtractionRequest & { adminUserId?: string }) {
    await requireAdminPermission(body.adminUserId, "action.product.edit");
    return this.service.submit(body);
  }

  @Get(":id")
  async get(@Param("id") id: string, @Headers(ADMIN_USER_HEADER) adminUserId?: string) {
    await requireAdminPermission(adminUserId, "page.product.digitalization");
    return this.service.get(id);
  }
}
