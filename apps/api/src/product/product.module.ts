import { Module } from "@nestjs/common";
import { ProductApplicationService } from "./product-application.service";
import { ProductBarcodeController } from "./product-barcode.controller";
import { ProductBarcodeService } from "./product-barcode.service";
import { ProductCalibrationController } from "./product-calibration.controller";
import { ProductCalibrationService } from "./product-calibration.service";
import { PRODUCT_REPOSITORY } from "./product.repository";
import { PrismaProductRepository } from "./prisma-product.repository";
import { ProductStateMachine } from "./product-state-machine";

@Module({
  controllers: [ProductCalibrationController, ProductBarcodeController],
  providers: [
    ProductApplicationService,
    ProductCalibrationService,
    ProductBarcodeService,
    ProductStateMachine,
    {
      provide: PRODUCT_REPOSITORY,
      useClass: PrismaProductRepository
    }
  ],
  exports: [ProductApplicationService]
})
export class ProductModule {}
