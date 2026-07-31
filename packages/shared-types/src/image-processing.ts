export const PRODUCT_IMAGE_VARIANTS = [
  "ORIGINAL",
  "CUTOUT_TRANSPARENT",
  "CUTOUT_WHITE",
  "OPTIMIZED_MAIN"
] as const;

export type ProductImageVariant = (typeof PRODUCT_IMAGE_VARIANTS)[number];

export const IMAGE_PROCESSING_OPERATIONS = [
  "REMOVE_BACKGROUND",
  "COMPOSE_WHITE_BACKGROUND",
  "OPTIMIZE_MAIN_IMAGE"
] as const;

export type ImageProcessingOperation = (typeof IMAGE_PROCESSING_OPERATIONS)[number];

export const IMAGE_PROCESSING_STATUSES = [
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED"
] as const;

export type ImageProcessingStatus = (typeof IMAGE_PROCESSING_STATUSES)[number];

export type ImageProcessingFailureCode =
  | "SOURCE_IMAGE_NOT_FOUND"
  | "UNSUPPORTED_IMAGE_FORMAT"
  | "PROCESSOR_NOT_CONFIGURED"
  | "PROCESSOR_TIMEOUT"
  | "PROCESSOR_REJECTED_IMAGE"
  | "OUTPUT_UPLOAD_FAILED"
  | "UNKNOWN";

export interface ProductImageVariantRecord {
  imageId: string;
  productId: string;
  sourceImageId: string | null;
  variant: ProductImageVariant;
  originalUrl: string;
  publicUrl: string | null;
  widthPx: number | null;
  heightPx: number | null;
  mimeType: string | null;
  selectedAsMain: boolean;
  createdAt: string;
}

export interface ImageProcessingJobRecord {
  id: string;
  productId: string;
  sourceImageId: string;
  operation: ImageProcessingOperation;
  targetVariant: ProductImageVariant;
  status: ImageProcessingStatus;
  provider: string | null;
  processorVersion: string | null;
  qualityScore: number | null;
  qualityIssues: string[];
  fallbackFrom: string | null;
  fallbackReason: string | null;
  outputImageId: string | null;
  retryCount: number;
  failureCode: ImageProcessingFailureCode | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StartImageProcessingRequest {
  operation: ImageProcessingOperation;
}

export interface RetryImageProcessingRequest {
  reason?: string;
}

export interface ProductImageComparisonResponse {
  productId: string;
  original: ProductImageVariantRecord | null;
  cutoutTransparent: ProductImageVariantRecord | null;
  cutoutWhite: ProductImageVariantRecord | null;
  optimizedMain: ProductImageVariantRecord | null;
  selectedMainImageId: string | null;
  jobs: ImageProcessingJobRecord[];
}

export interface SelectProductMainImageRequest {
  imageId: string;
}

export function isProductImageVariant(value: string): value is ProductImageVariant {
  return PRODUCT_IMAGE_VARIANTS.includes(value as ProductImageVariant);
}

export function isImageProcessingOperation(value: string): value is ImageProcessingOperation {
  return IMAGE_PROCESSING_OPERATIONS.includes(value as ImageProcessingOperation);
}

export function isImageProcessingStatus(value: string): value is ImageProcessingStatus {
  return IMAGE_PROCESSING_STATUSES.includes(value as ImageProcessingStatus);
}
