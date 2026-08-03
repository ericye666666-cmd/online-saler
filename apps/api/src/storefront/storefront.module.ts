import { Module } from "@nestjs/common";
import { StorefrontProductsController } from "./storefront-products.controller";
import { StorefrontSearchAnalyticsController } from "./storefront-search-analytics.controller";

@Module({
  controllers: [StorefrontProductsController, StorefrontSearchAnalyticsController]
})
export class StorefrontModule {}
