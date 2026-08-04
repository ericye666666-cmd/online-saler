import type { ImageProcessingJobRecord, ProductImageComparisonResponse } from "@online-saler/shared-types";

const MINIMUM_LIGHTWEIGHT_QUALITY_SCORE = 0.75;
const BLOCKING_LIGHTWEIGHT_ISSUES = new Set([
  "SUBJECT_TOUCHES_EDGE",
  "EDGE_FRAGMENTED",
  "MULTIPLE_FOREGROUND_COMPONENTS",
  "BOARD_RESIDUE_SUSPECTED"
]);

export function cutoutQualityWarning(job: ImageProcessingJobRecord): string | null {
  if (job.provider === "manual-cutout-editor") return null;

  if (typeof job.qualityScore === "number" && job.qualityScore < MINIMUM_LIGHTWEIGHT_QUALITY_SCORE) {
    return automaticFailureMessage(job, `${Math.round(job.qualityScore * 100)} 分，低于 75 分`);
  }

  const blockingIssue = job.qualityIssues.find((issue) => BLOCKING_LIGHTWEIGHT_ISSUES.has(issue));
  if (blockingIssue) {
    return automaticFailureMessage(job, blockingIssue);
  }

  return null;
}

export const lightweightCutoutWarning = cutoutQualityWarning;

export function persistedFrontCutoutWarning(comparison: ProductImageComparisonResponse): string | null {
  const originalId = comparison.original?.imageId;
  if (!originalId) return null;
  const job = comparison.jobs.find((candidate) =>
    candidate.operation === "REMOVE_BACKGROUND" &&
    candidate.status === "SUCCEEDED" &&
    candidate.sourceImageId === originalId
  );
  return job ? cutoutQualityWarning(job) : null;
}

function automaticFailureMessage(job: ImageProcessingJobRecord, reason: string): string {
  if (job.provider === "lightweight-opencv") {
    return `lightweight 抠图未通过（${reason}），不能作为商城主图。请先使用 BiRefNet；仍不正确时手工修边或重拍。`;
  }
  return `自动抠图未通过（${reason}），不能作为商城主图。请手工修边；无法修复时标记重拍。`;
}
