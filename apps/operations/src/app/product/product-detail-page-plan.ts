export const PRODUCT_DETAIL_PAGE_PLAN = [
  { type: "FRONT_MAIN", number: 1, title: "主图与购买信息", shortTitle: "主图" },
  { type: "BACK_MAIN", number: 2, title: "背面实物", shortTitle: "背面" },
  { type: "MEASUREMENT_GUIDE", number: 3, title: "实测尺寸", shortTitle: "尺寸" },
  { type: "FIT_GUIDE", number: 4, title: "版型与尺码建议", shortTitle: "版型" },
  { type: "CONDITION_GUIDE", number: 5, title: "成色与瑕疵", shortTitle: "成色" },
  { type: "SHARE_CARD", number: 6, title: "分享图", shortTitle: "分享" }
] as const;

export function detailGenerationButtonLabel(batch: {
  generationReady: boolean;
  calibrated: number;
  targetCount: number;
  pending: number;
}) {
  if (!batch.generationReady) return `等待校准（${batch.calibrated}/${batch.targetCount}）`;
  if (batch.pending === 0) return "没有待生成详情";
  return `生成 ${batch.pending} 件详情草稿`;
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
  if (!batch.generationReady) return `等待校准 ${batch.calibrated}/${batch.targetCount}`;
  if (batch.generating > 0) return `生成中 ${batch.generating}/${batch.targetCount}`;
  if (batch.pending > 0) return `待生成 ${batch.pending} 件`;
  if (batch.failed > 0) return `失败 ${batch.failed} 件`;
  if (batch.outdated > 0) return `待重生成 ${batch.outdated} 件`;
  if (batch.approved >= batch.targetCount) return "详情已批准";
  if (batch.succeeded > 0) return `待检查 ${batch.succeeded} 件`;
  return "等待生成";
}

export function sortDetailBatches<T extends DetailBatchSelectionSummary>(batches: T[]) {
  return [...batches].sort((left, right) => {
    const priorityDifference = detailBatchPriority(left) - detailBatchPriority(right);
    if (priorityDifference !== 0) return priorityDifference;
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
}

function detailBatchPriority(batch: DetailBatchSelectionSummary) {
  if (batch.generating > 0) return 0;
  if (batch.generationReady && batch.pending > 0) return 1;
  if (batch.failed > 0 || batch.outdated > 0) return 2;
  if (batch.succeeded > 0) return 3;
  if (!batch.generationReady) return 4;
  return 5;
}
