import { Module } from "@nestjs/common";
import { ProductApplicationService } from "./product-application.service";
import { ProductBarcodeController } from "./product-barcode.controller";
import { ProductBarcodeService } from "./product-barcode.service";
import { ProductCalibrationController } from "./product-calibration.controller";
import { ProductCalibrationService } from "./product-calibration.service";
import { ProductImageProcessingController } from "./product-image-processing.controller";
import { ProductImageProcessingService } from "./product-image-processing.service";
import { ProductImageStorageService } from "./product-image-storage.service";
import { PRODUCT_REPOSITORY } from "./product.repository";
import { ProductSetupController } from "./product-setup.controller";
import { PrismaProductRepository } from "./prisma-product.repository";
import { ProductStateMachine } from "./product-state-machine";

@Module({
  controllers: [
    ProductSetupController,
    ProductCalibrationController,
    ProductBarcodeController,
    ProductImageProcessingController
  ],
  providers: [
    ProductApplicationService,
    ProductCalibrationService,
    ProductBarcodeService,
    ProductImageStorageService,
    ProductImageProcessingService,
    ProductStateMachine,
    {
      provide: PRODUCT_REPOSITORY,
      useClass: PrismaProductRepository
    }
  ],
  exports: [
    ProductApplicationService,
    ProductBarcodeService,
    ProductImageStorageService,
    ProductImageProcessingService
  ]
})
export class ProductModule {}
