import { Module } from "@nestjs/common";
import { ProductModule } from "../product/product.module";
import { OperationsAccessController } from "./operations-access.controller";
import { OperationsAccessService } from "./operations-access.service";
import { OperationsProductControlController } from "./operations-product-control.controller";
import { OperationsProductControlService } from "./operations-product-control.service";
import { OperationsWorkspaceController } from "./operations-workspace.controller";
import { OperationsWorkspaceService } from "./operations-workspace.service";

@Module({
  imports: [ProductModule],
  controllers: [OperationsAccessController, OperationsWorkspaceController, OperationsProductControlController],
  providers: [OperationsAccessService, OperationsWorkspaceService, OperationsProductControlService]
})
export class OperationsModule {}
