import { Module } from "@nestjs/common";
import { AIModule } from "./ai/ai.module";
import { FoundationModule } from "./foundation/foundation.module";
import { HealthController } from "./health/health.controller";
import { HealthService } from "./health/health.service";
import { OperationsModule } from "./operations/operations.module";
import { ProductModule } from "./product/product.module";

@Module({
  imports: [FoundationModule, ProductModule, AIModule, OperationsModule],
  controllers: [HealthController],
  providers: [HealthService]
})
export class AppModule {}
