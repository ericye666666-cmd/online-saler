import type { ImageProcessingJobRecord } from "@online-saler/shared-types";

const MINIMUM_LIGHTWEIGHT_QUALITY_SCORE = 0.75;
const BLOCKING_LIGHTWEIGHT_ISSUES = new Set(["SUBJECT_TOUCHES_EDGE", "EDGE_FRAGMENTED"]);

export function lightweightCutoutWarning(job: ImageProcessingJobRecord): string | null {
  if (job.provider !== "lightweight-opencv") return null;

  if (typeof job.qualityScore === "number" && job.qualityScore < MINIMUM_LIGHTWEIGHT_QUALITY_SCORE) {
    return `lightweight 抠图质量不足（${Math.round(job.qualityScore * 100)} 分），未生成或替换商城主图。请使用“强制 BiRefNet”。`;
  }

  const blockingIssue = job.qualityIssues.find((issue) => BLOCKING_LIGHTWEIGHT_ISSUES.has(issue));
  if (blockingIssue) {
    return `lightweight 抠图存在边缘问题（${blockingIssue}），未生成或替换商城主图。请使用“强制 BiRefNet”。`;
  }

  return null;
}
