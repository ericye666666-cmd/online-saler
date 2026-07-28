import { Module } from "@nestjs/common";
import { FoundationModule } from "./foundation/foundation.module";
import { HealthController } from "./health/health.controller";
import { HealthService } from "./health/health.service";

@Module({
  imports: [FoundationModule],
  controllers: [HealthController],
  providers: [HealthService]
})
export class AppModule {}
