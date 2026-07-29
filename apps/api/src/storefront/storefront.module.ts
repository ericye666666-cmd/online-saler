import { Module } from "@nestjs/common";
import { StorefrontProductsController } from "./storefront-products.controller";

@Module({
  controllers: [StorefrontProductsController]
})
export class StorefrontModule {}
