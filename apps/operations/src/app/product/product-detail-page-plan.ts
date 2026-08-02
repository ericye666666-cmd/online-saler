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
  if (!generationReady || product.productStatus === "CALIBRATION_PENDING") return "AWAITING_CALIBRATION";
  return "PENDING";
}
