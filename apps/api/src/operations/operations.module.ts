import { Module } from "@nestjs/common";
import { AIModule } from "../ai/ai.module";
import { ProductModule } from "../product/product.module";
import { OperationsAccessController } from "./operations-access.controller";
import { OperationsAccessService } from "./operations-access.service";
import { OperationsFulfillmentController } from "./operations-fulfillment.controller";
import { OperationsFulfillmentService } from "./operations-fulfillment.service";
import { OperationsProductBatchController } from "./operations-product-batch.controller";
import { OperationsProductBatchService } from "./operations-product-batch.service";
import { OperationsProductControlController } from "./operations-product-control.controller";
import { OperationsProductControlService } from "./operations-product-control.service";
import { OperationsWorkspaceController } from "./operations-workspace.controller";
import { OperationsWorkspaceService } from "./operations-workspace.service";

@Module({
  imports: [ProductModule, AIModule],
  controllers: [
    OperationsAccessController,
    OperationsWorkspaceController,
    OperationsProductBatchController,
    OperationsProductControlController,
    OperationsFulfillmentController
  ],
  providers: [
    OperationsAccessService,
    OperationsWorkspaceService,
    OperationsProductBatchService,
    OperationsProductControlService,
    OperationsFulfillmentService
  ]
})
export class OperationsModule {}
