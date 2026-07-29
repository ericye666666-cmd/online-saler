import { Module } from "@nestjs/common";
import { OperationsWorkspaceController } from "./operations-workspace.controller";
import { OperationsWorkspaceService } from "./operations-workspace.service";

@Module({
  controllers: [OperationsWorkspaceController],
  providers: [OperationsWorkspaceService]
})
export class OperationsModule {}
