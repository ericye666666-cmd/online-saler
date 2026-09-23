import { Module } from "@nestjs/common";
import { OperationsModule } from "../operations/operations.module";
import { StoreIntegrationController } from "./store-integration.controller";
import { StoreIntegrationService } from "./store-integration.service";

/**
 * Where other systems come in. Today that is the store ERP (FW-ERP), whose
 * clerks work online orders from the workbench they already have open.
 *
 * It is a module of its own rather than more routes on Operations because the
 * two have different callers and different credentials: Operations answers to a
 * signed-in person, this answers to another server holding a shared key.
 */
@Module({
  imports: [OperationsModule],
  controllers: [StoreIntegrationController],
  providers: [StoreIntegrationService]
})
export class IntegrationModule {}
