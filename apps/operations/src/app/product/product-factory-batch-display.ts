export const PRODUCT_FACTORY_STAGE_ORDER = [
  "UPLOAD",
  "AI_IMAGE",
  "CALIBRATION",
  "BARCODE",
  "LABEL_APPLY",
  "REVIEW",
  "STORAGE",
  "PUBLISH"
] as const;

export const PRODUCT_FACTORY_STAGE_LABELS: Record<string, string> = {
  UPLOAD: "上传图片",
  AI_IMAGE: "AI 与图片处理",
  CALIBRATION: "人工校准",
  BARCODE: "生成 Barcode",
  LABEL_APPLY: "打印并贴码",
  REVIEW: "商品审核",
  STORAGE: "扫码入仓",
  PUBLISH: "发布商品",
  EXCEPTION: "处理异常",
  COMPLETE: "批次已完成"
};

export function batchNextActionHref(batchId: string, nextAction: string): string {
  const encodedBatchId = encodeURIComponent(batchId);
  const routes: Record<string, string> = {
    CONTINUE_UPLOAD: `/product/batches/${encodedBatchId}/upload`,
    START_AI_IMAGE: `/product/batches/${encodedBatchId}/processing`,
    CONTINUE_CALIBRATION: `/product/calibration?batchId=${encodedBatchId}`,
    PRINT_AND_APPLY_LABELS: `/product/barcode?batchId=${encodedBatchId}`,
    CONTINUE_REVIEW: `/product/review?batchId=${encodedBatchId}`,
    SCAN_INTO_STORAGE: `/product/review?batchId=${encodedBatchId}`,
    PUBLISH_PRODUCTS: `/product/review?batchId=${encodedBatchId}`,
    RESOLVE_EXCEPTION: `/product/exceptions?batchId=${encodedBatchId}`,
    VIEW_COMPLETED: `/product/completed`
  };
  return routes[nextAction] ?? `/product/batches/${encodedBatchId}`;
}
