import { Module } from "@nestjs/common";
import { FoundationModule } from "./foundation/foundation.module";
import { HealthController } from "./health/health.controller";
import { HealthService } from "./health/health.service";
import { ProductModule } from "./product/product.module";

@Module({
  imports: [FoundationModule, ProductModule],
  controllers: [HealthController],
  providers: [HealthService]
})
export class AppModule {}
