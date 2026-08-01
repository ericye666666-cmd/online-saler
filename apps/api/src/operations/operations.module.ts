import { Module } from "@nestjs/common";
import { AIModule } from "../ai/ai.module";
import { ProductModule } from "../product/product.module";
import { OperationsAccessController } from "./operations-access.controller";
import { OperationsAccessService } from "./operations-access.service";
import { OperationsAffiliateController } from "./operations-affiliate.controller";
import { OperationsAffiliateService } from "./operations-affiliate.service";
import { OperationsAnalyticsController } from "./operations-analytics.controller";
import { OperationsAnalyticsService } from "./operations-analytics.service";
import { OperationsCustomerServiceController } from "./operations-customer-service.controller";
import { OperationsCustomerServiceService } from "./operations-customer-service.service";
import { OperationsFulfillmentController } from "./operations-fulfillment.controller";
import { OperationsFulfillmentService } from "./operations-fulfillment.service";
import { OperationsProductBatchController } from "./operations-product-batch.controller";
import { OperationsProductBatchService } from "./operations-product-batch.service";
import { OperationsProductControlController } from "./operations-product-control.controller";
import { OperationsProductControlService } from "./operations-product-control.service";
import { OperationsProductFactoryAdminController } from "./operations-product-factory-admin.controller";
import { OperationsProductFactoryAdminService } from "./operations-product-factory-admin.service";
import { OperationsWorkspaceController } from "./operations-workspace.controller";
import { OperationsWorkspaceService } from "./operations-workspace.service";

@Module({
  imports: [ProductModule, AIModule],
  controllers: [
    OperationsAccessController,
    OperationsWorkspaceController,
    OperationsProductBatchController,
    OperationsProductControlController,
    OperationsProductFactoryAdminController,
    OperationsFulfillmentController,
    OperationsAffiliateController,
    OperationsAnalyticsController,
    OperationsCustomerServiceController
  ],
  providers: [
    OperationsAccessService,
    OperationsWorkspaceService,
    OperationsProductBatchService,
    OperationsProductControlService,
    OperationsProductFactoryAdminService,
    OperationsFulfillmentService,
    OperationsAffiliateService,
    OperationsAnalyticsService,
    OperationsCustomerServiceService
  ]
})
export class OperationsModule {}
