import { Module } from "@nestjs/common";
import { OperationsAccessService } from "./operations-access.service";
import { OperationsRequestIdentity } from "./operations-request-identity";

// Authentication has no product or AI dependencies, so all employee-facing
// modules can share the same verifier without circular module imports.
@Module({
  providers: [OperationsAccessService, OperationsRequestIdentity],
  exports: [OperationsAccessService, OperationsRequestIdentity]
})
export class OperationsAccessModule {}
