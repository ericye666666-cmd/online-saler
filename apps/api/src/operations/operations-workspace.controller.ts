import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import {
  OperationsWorkspaceService,
  STAGING_TEST_EMPLOYEE_ID
} from "./operations-workspace.service";

interface WorkspaceBody {
  employeeId?: string;
  adminUserId?: string;
}

@Controller("operations/workspace")
export class OperationsWorkspaceController {
  constructor(private readonly workspace: OperationsWorkspaceService) {}

  @Get("summary")
  summary(@Query("employeeId") employeeId?: string, @Query("adminUserId") adminUserId?: string) {
    return this.workspace.summary(employeeId, adminUserId);
  }

  @Get("active")
  active(
    @Query("employeeId") employeeId: string | undefined,
    @Query("adminUserId") adminUserId: string | undefined,
    @Query("productId") productId?: string
  ) {
    return this.workspace.active(employeeId, adminUserId, productId);
  }

  @Post("start")
  start(@Body() body: WorkspaceBody) {
    return this.workspace.start(body.employeeId ?? STAGING_TEST_EMPLOYEE_ID, body.adminUserId);
  }
}
