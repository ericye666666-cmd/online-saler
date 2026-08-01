import type {
  ImageProcessingOperation,
  ImageProcessingStatus,
  ProductImageVariant
} from "@online-saler/shared-types";

const SOURCE_VARIANT_BY_OPERATION: Record<ImageProcessingOperation, ProductImageVariant> = {
  REMOVE_BACKGROUND: "ORIGINAL",
  COMPOSE_WHITE_BACKGROUND: "CUTOUT_TRANSPARENT",
  OPTIMIZE_MAIN_IMAGE: "CUTOUT_WHITE",
  OPTIMIZE_BALANCED_MAIN_IMAGE: "CUTOUT_TRANSPARENT"
};

const TARGET_VARIANT_BY_OPERATION: Record<ImageProcessingOperation, ProductImageVariant> = {
  REMOVE_BACKGROUND: "CUTOUT_TRANSPARENT",
  COMPOSE_WHITE_BACKGROUND: "CUTOUT_WHITE",
  OPTIMIZE_MAIN_IMAGE: "OPTIMIZED_MAIN",
  OPTIMIZE_BALANCED_MAIN_IMAGE: "OPTIMIZED_BALANCED_MAIN"
};

const SELECTABLE_MAIN_VARIANTS = new Set<ProductImageVariant>([
  "ORIGINAL",
  "CUTOUT_WHITE",
  "OPTIMIZED_MAIN",
  "OPTIMIZED_BALANCED_MAIN"
]);

export const MAX_IMAGE_PROCESSING_RETRIES = 3;

export function sourceVariantForOperation(operation: ImageProcessingOperation): ProductImageVariant {
  return SOURCE_VARIANT_BY_OPERATION[operation];
}

export function targetVariantForOperation(operation: ImageProcessingOperation): ProductImageVariant {
  return TARGET_VARIANT_BY_OPERATION[operation];
}

export function isSelectableMainVariant(variant: ProductImageVariant): boolean {
  return SELECTABLE_MAIN_VARIANTS.has(variant);
}

export function canRetryImageProcessing(status: ImageProcessingStatus, retryCount: number): boolean {
  return status === "FAILED" && retryCount < MAX_IMAGE_PROCESSING_RETRIES;
}
