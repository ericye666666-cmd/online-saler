import { Module } from "@nestjs/common";
import { ProductApplicationService } from "./product-application.service";
import { ProductBarcodeController } from "./product-barcode.controller";
import { ProductBarcodeService } from "./product-barcode.service";
import { ProductCalibrationController } from "./product-calibration.controller";
import { ProductCalibrationService } from "./product-calibration.service";
import { ProductImageStorageService } from "./product-image-storage.service";
import { PRODUCT_REPOSITORY } from "./product.repository";
import { ProductSetupController } from "./product-setup.controller";
import { PrismaProductRepository } from "./prisma-product.repository";
import { ProductStateMachine } from "./product-state-machine";

@Module({
  controllers: [ProductSetupController, ProductCalibrationController, ProductBarcodeController],
  providers: [
    ProductApplicationService,
    ProductCalibrationService,
    ProductBarcodeService,
    ProductImageStorageService,
    ProductStateMachine,
    {
      provide: PRODUCT_REPOSITORY,
      useClass: PrismaProductRepository
    }
  ],
  exports: [ProductApplicationService]
})
export class ProductModule {}
