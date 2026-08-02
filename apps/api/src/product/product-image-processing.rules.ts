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

const DEFAULT_LIGHTWEIGHT_MINIMUM_QUALITY_SCORE = 0.75;
const DEFAULT_LIGHTWEIGHT_BLOCKING_ISSUES = ["SUBJECT_TOUCHES_EDGE", "EDGE_FRAGMENTED"];

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

export function evaluateCutoutImageQuality(input: {
  qualityScore?: number | null;
  qualityIssues?: readonly string[] | null;
}): { pass: boolean; reason: string | null } {
  const minimumScore = configuredMinimumQualityScore();
  if (typeof input.qualityScore === "number" && input.qualityScore < minimumScore) {
    return {
      pass: false,
      reason: `QUALITY_SCORE_BELOW_THRESHOLD:${input.qualityScore}<${minimumScore}`
    };
  }

  const blockingIssues = configuredBlockingIssues();
  const matchingIssue = (input.qualityIssues ?? []).find((issue) => blockingIssues.has(issue));
  if (matchingIssue) {
    return {
      pass: false,
      reason: `QUALITY_ISSUE:${matchingIssue}`
    };
  }

  return { pass: true, reason: null };
}

export const evaluateLightweightImageQuality = evaluateCutoutImageQuality;

function configuredMinimumQualityScore(): number {
  const value = Number.parseFloat(
    process.env.BACKGROUND_REMOVAL_MIN_QUALITY_SCORE ?? String(DEFAULT_LIGHTWEIGHT_MINIMUM_QUALITY_SCORE)
  );
  if (!Number.isFinite(value)) return DEFAULT_LIGHTWEIGHT_MINIMUM_QUALITY_SCORE;
  return Math.max(0, Math.min(1, value));
}

function configuredBlockingIssues(): Set<string> {
  const configured = process.env.BACKGROUND_REMOVAL_BLOCKING_QUALITY_ISSUES;
  const issues = configured?.trim()
    ? configured.split(",").map((issue) => issue.trim()).filter(Boolean)
    : DEFAULT_LIGHTWEIGHT_BLOCKING_ISSUES;
  return new Set(issues);
}
