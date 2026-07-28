import { Module } from "@nestjs/common";
import { ProductApplicationService } from "./product-application.service";
import { PRODUCT_REPOSITORY } from "./product.repository";
import { PrismaProductRepository } from "./prisma-product.repository";
import { ProductStateMachine } from "./product-state-machine";

@Module({
  providers: [
    ProductApplicationService,
    ProductStateMachine,
    {
      provide: PRODUCT_REPOSITORY,
      useClass: PrismaProductRepository
    }
  ],
  exports: [ProductApplicationService]
})
export class ProductModule {}
