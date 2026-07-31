import type {
  ImageProcessingOperation,
  ImageProcessingStatus,
  ProductImageVariant
} from "@online-saler/shared-types";

const TARGET_VARIANT_BY_OPERATION: Record<ImageProcessingOperation, ProductImageVariant> = {
  REMOVE_BACKGROUND: "CUTOUT_TRANSPARENT",
  COMPOSE_WHITE_BACKGROUND: "CUTOUT_WHITE",
  OPTIMIZE_MAIN_IMAGE: "OPTIMIZED_MAIN"
};

const SELECTABLE_MAIN_VARIANTS = new Set<ProductImageVariant>([
  "ORIGINAL",
  "CUTOUT_WHITE",
  "OPTIMIZED_MAIN"
]);

export const MAX_IMAGE_PROCESSING_RETRIES = 3;

export function targetVariantForOperation(operation: ImageProcessingOperation): ProductImageVariant {
  return TARGET_VARIANT_BY_OPERATION[operation];
}

export function isSelectableMainVariant(variant: ProductImageVariant): boolean {
  return SELECTABLE_MAIN_VARIANTS.has(variant);
}

export function canRetryImageProcessing(status: ImageProcessingStatus, retryCount: number): boolean {
  return status === "FAILED" && retryCount < MAX_IMAGE_PROCESSING_RETRIES;
}
