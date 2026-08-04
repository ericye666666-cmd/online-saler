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
  STORAGE: "货架入库",
  PUBLISH: "发布商品",
  EXCEPTION: "处理异常",
  COMPLETE: "批次已完成"
};

export const PRODUCT_FACTORY_WORKFLOW_STAGE_ORDER = [
  "CAPTURE",
  "AUTOMATION",
  "CONFIRM_AND_PUBLISH"
] as const;

export const PRODUCT_FACTORY_WORKFLOW_STAGE_LABELS: Record<string, string> = {
  CAPTURE: "批量采集",
  AUTOMATION: "AI 自动处理",
  CONFIRM_AND_PUBLISH: "异常确认并发布",
  COMPLETE: "批次已完成"
};

export type ProductFactoryWorkflowStage =
  | (typeof PRODUCT_FACTORY_WORKFLOW_STAGE_ORDER)[number]
  | "COMPLETE";

export function productFactoryWorkflowStage(stage: string): ProductFactoryWorkflowStage {
  if (stage === "COMPLETE") return "COMPLETE";
  if (stage === "UPLOAD") return "CAPTURE";
  if (stage === "AI_IMAGE") return "AUTOMATION";
  return "CONFIRM_AND_PUBLISH";
}

export function productFactoryWorkflowStageIndex(stage: string): number {
  const workflowStage = productFactoryWorkflowStage(stage);
  return workflowStage === "COMPLETE"
    ? PRODUCT_FACTORY_WORKFLOW_STAGE_ORDER.length
    : PRODUCT_FACTORY_WORKFLOW_STAGE_ORDER.indexOf(workflowStage);
}

export function batchNextActionHref(batchId: string, nextAction: string): string {
  const encodedBatchId = encodeURIComponent(batchId);
  const routes: Record<string, string> = {
    CONTINUE_UPLOAD: `/product/batches/${encodedBatchId}/upload`,
    START_AI_IMAGE: `/product/batches/${encodedBatchId}/processing`,
    CONTINUE_CALIBRATION: `/product/calibration?batchId=${encodedBatchId}`,
    GENERATE_BARCODES: `/product/barcode?batchId=${encodedBatchId}`,
    PRINT_AND_APPLY_LABELS: `/product/barcode?batchId=${encodedBatchId}`,
    CONTINUE_REVIEW: `/product/review?batchId=${encodedBatchId}`,
    COMPLETE_STORAGE: `/product/review?batchId=${encodedBatchId}`,
    PUBLISH_PRODUCTS: `/product/review?batchId=${encodedBatchId}`,
    RESOLVE_EXCEPTION: `/product/exceptions?batchId=${encodedBatchId}`,
    VIEW_COMPLETED: `/product/completed`
  };
  return routes[nextAction] ?? `/product/batches/${encodedBatchId}`;
}

export function batchProductCalibrationHref(batchId: string, productId: string): string {
  const query = new URLSearchParams({ batchId, productId });
  return `/product/calibration?${query.toString()}`;
}

export function resolveCalibrationProductIndex<T extends { id: string }>(
  products: T[],
  requestedProductId: string,
  isCalibratable: (product: T) => boolean
): number {
  const requestedIndex = products.findIndex((product) => product.id === requestedProductId);
  if (requestedIndex >= 0) return requestedIndex;
  const pendingIndex = products.findIndex(isCalibratable);
  return pendingIndex >= 0 ? pendingIndex : 0;
}

export type ManualMeasurementAction = "EDIT" | "REOPEN";

export function manualMeasurementAction(
  productStatus: string,
  hasOriginalImage: boolean
): ManualMeasurementAction | null {
  if (!hasOriginalImage) return null;
  if (productStatus === "CALIBRATED") return "REOPEN";
  if (["AI_PROCESSED", "CALIBRATION_PENDING"].includes(productStatus)) return "EDIT";
  return null;
}

export function batchFollowingStageLabel(stage: string): string {
  const index = PRODUCT_FACTORY_STAGE_ORDER.indexOf(stage as (typeof PRODUCT_FACTORY_STAGE_ORDER)[number]);
  if (index < 0) return stage === "COMPLETE" ? "已完成" : "处理异常";
  const followingStage = PRODUCT_FACTORY_STAGE_ORDER[index + 1];
  return followingStage ? PRODUCT_FACTORY_STAGE_LABELS[followingStage] : "完成批次";
}
