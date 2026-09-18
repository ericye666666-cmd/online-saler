import { t } from "@/i18n/runtime";
export const PRODUCT_DETAIL_ASSET_PLAN = [
  { type: "FRONT_MAIN", title: "正面主图", shortTitle: "主图", optional: false },
  { type: "BACK_MAIN", title: "背面实物", shortTitle: "背面", optional: true },
  { type: "MEASUREMENT_GUIDE", title: "尺码指南", shortTitle: "尺码", optional: false },
  { type: "DETAIL_GALLERY", title: "细节与瑕疵", shortTitle: "细节", optional: true }
] as const;

export function productDetailAssetProxyUrl(
  apiProxyUrl: string,
  asset: { id: string; updatedAt?: string | null }
) {
  const cacheToken = asset.updatedAt ? `?v=${encodeURIComponent(asset.updatedAt)}` : "";
  return `${apiProxyUrl}/product-detail-assets/${asset.id}/content${cacheToken}`;
}

export function detailGenerationButtonLabel(batch: {
  generationReady: boolean;
  calibrated: number;
  targetCount: number;
  pending: number;
}) {
  if (!batch.generationReady) return t("等待校准（{calibrated}/{targetCount}）", { calibrated: batch.calibrated, targetCount: batch.targetCount });
  if (batch.pending === 0) return t("没有待生成详情");
  return t("生成 {pending} 件详情草稿", { pending: batch.pending });
}

export function detailProductStage(product: {
  productStatus: string;
  detailStatus?: string | null;
}, generationReady: boolean) {
  if (product.detailStatus) return product.detailStatus;
  if (product.productStatus === "CALIBRATION_PENDING") return "AWAITING_CALIBRATION";
  if (!generationReady) return "AWAITING_BATCH";
  return "PENDING";
}

export type DetailBatchSelectionSummary = {
  id: string;
  batchCode: string;
  createdAt: string;
  targetCount: number;
  calibrated: number;
  generationReady: boolean;
  pending: number;
  generating: number;
  succeeded: number;
  failed: number;
  outdated: number;
  approved: number;
};

export function detailBatchStageLabel(batch: DetailBatchSelectionSummary) {
  if (!batch.generationReady) return t("等待校准 {calibrated}/{targetCount}", { calibrated: batch.calibrated, targetCount: batch.targetCount });
  if (batch.generating > 0) return t("生成中 {generating}/{targetCount}", { generating: batch.generating, targetCount: batch.targetCount });
  if (batch.pending > 0) return t("待生成 {pending} 件", { pending: batch.pending });
  if (batch.failed > 0) return t("失败 {failed} 件", { failed: batch.failed });
  if (batch.outdated > 0) return t("待重生成 {outdated} 件", { outdated: batch.outdated });
  if (batch.approved >= batch.targetCount) return t("详情已批准");
  if (batch.succeeded > 0) return t("待检查 {succeeded} 件", { succeeded: batch.succeeded });
  return t("等待生成");
}

export function sortDetailBatches<T extends DetailBatchSelectionSummary>(batches: T[]) {
  return [...batches].sort((left, right) => {
    const priorityDifference = detailBatchPriority(left) - detailBatchPriority(right);
    if (priorityDifference !== 0) return priorityDifference;
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
}

export function detailCopyWithoutPrice(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\bKSh\s*[\d,]+(?:\.\d{1,2})?\b\.?/gi, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\.{2,}/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function detailSellingPointsWithoutPrice(values: readonly string[]) {
  return values
    .filter((value) => !/\bKSh\s*[\d,]+(?:\.\d{1,2})?\b/i.test(value))
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function detailConditionSummary(value: string | null | undefined, confirmedDefectCount: number) {
  return confirmedDefectCount > 0 ? (value ?? "").trim() : "";
}

function detailBatchPriority(batch: DetailBatchSelectionSummary) {
  if (batch.generating > 0) return 0;
  if (batch.generationReady && batch.pending > 0) return 1;
  if (batch.failed > 0 || batch.outdated > 0) return 2;
  if (batch.succeeded > 0) return 3;
  if (!batch.generationReady) return 4;
  return 5;
}
