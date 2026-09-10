import { Body, Controller, Get, Headers, Post, Query } from "@nestjs/common";
import { OperationsWorkspaceService } from "./operations-workspace.service";
import { OperationsRequestIdentity } from "./operations-request-identity";

interface WorkspaceBody {
  employeeId?: string;
  adminUserId?: string;
}

@Controller("operations/workspace")
export class OperationsWorkspaceController {
  constructor(private readonly workspace: OperationsWorkspaceService, private readonly identity: OperationsRequestIdentity) {}

  @Get("summary")
  async summary(@Headers("authorization") authorization?: string, @Query("employeeId") employeeId?: string) {
    return this.workspace.summary(employeeId, await this.identity.adminId(authorization));
  }

  @Get("active")
  async active(
    @Query("employeeId") employeeId: string | undefined,
    @Headers("authorization") authorization: string | undefined,
    @Query("productId") productId?: string
  ) {
    return this.workspace.active(employeeId, await this.identity.adminId(authorization), productId);
  }

  @Post("start")
  async start(@Headers("authorization") authorization: string | undefined, @Body() body: WorkspaceBody) {
    const actor = await this.identity.employeeInput(authorization, body);
    return this.workspace.start(actor.employeeId, actor.adminUserId);
  }
}
