import { Module } from "@nestjs/common";
import { LightweightBackgroundRemovalProvider } from "./lightweight-background-removal.provider";
import { ProductApplicationService } from "./product-application.service";
import { ProductBarcodeController } from "./product-barcode.controller";
import { ProductBarcodeService } from "./product-barcode.service";
import { ProductCalibrationController } from "./product-calibration.controller";
import { ProductCalibrationService } from "./product-calibration.service";
import { ProductDetailGenerationController } from "./product-detail-generation.controller";
import { ProductDetailGenerationService } from "./product-detail-generation.service";
import { ProductDetailGenerationRunnerService } from "./product-detail-generation-runner.service";
import { ProductDetailOpenAIProvider } from "./product-detail-openai.provider";
import { ProductDetailAssetService } from "./product-detail-asset.service";
import { ProductDetailCardRendererService } from "./product-detail-card-renderer.service";
import { ProductImageJobRunnerService } from "./product-image-job-runner.service";
import { ProductImageProcessingController } from "./product-image-processing.controller";
import { ProductImageProcessingService } from "./product-image-processing.service";
import { ProductImageStorageService } from "./product-image-storage.service";
import { ProductImageTransformerService } from "./product-image-transformer.service";
import { PRODUCT_REPOSITORY } from "./product.repository";
import { ProductSetupController } from "./product-setup.controller";
import { PrismaProductRepository } from "./prisma-product.repository";
import { RembgBirefnetBackgroundRemovalProvider } from "./rembg-birefnet-background-removal.provider";
import { RemoveBgProvider } from "./remove-bg.provider";
import { SelectedBackgroundRemovalProvider } from "./selected-background-removal.provider";
import { ProductStateMachine } from "./product-state-machine";

@Module({
  controllers: [
    ProductSetupController,
    ProductCalibrationController,
    ProductBarcodeController,
    ProductImageProcessingController,
    ProductDetailGenerationController
  ],
  providers: [
    ProductApplicationService,
    ProductCalibrationService,
    ProductDetailGenerationService,
    ProductDetailGenerationRunnerService,
    ProductDetailOpenAIProvider,
    ProductDetailAssetService,
    ProductDetailCardRendererService,
    ProductBarcodeService,
    ProductImageStorageService,
    ProductImageTransformerService,
    ProductImageProcessingService,
    ProductImageJobRunnerService,
    LightweightBackgroundRemovalProvider,
    RembgBirefnetBackgroundRemovalProvider,
    RemoveBgProvider,
    SelectedBackgroundRemovalProvider,
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
    ProductImageProcessingService,
    ProductImageJobRunnerService,
    ProductDetailGenerationService
  ]
})
export class ProductModule {}
