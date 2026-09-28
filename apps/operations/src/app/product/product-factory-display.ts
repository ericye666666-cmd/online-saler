import { t } from "@/i18n/runtime";
export const PRODUCT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "待上传",
  PHOTOGRAPHED: "待 AI 识别",
  AI_PROCESSING: "AI 识别中",
  // AI has finished reading the photo but nobody has opened calibration yet. The AI job normally
  // moves a garment straight on to CALIBRATION_PENDING, so this shows up mostly on restored items.
  AI_PROCESSED: "AI 识别完成",
  // Calibration is open (fresh from AI, or sent back to be recalibrated): a person must confirm.
  CALIBRATION_PENDING: "待人工校准",
  CALIBRATED: "校准完成",
  BARCODE_ASSIGNED: "待打印贴码",
  REVIEW_PENDING: "待审核",
  REWORK_REQUIRED: "待返工",
  APPROVED: "审核通过",
  READY_FOR_STORAGE: "待扫码入库",
  PUBLISHED: "已发布",
  UNPUBLISHED: "已下架",
  ARCHIVED: "已拒绝"
};

/**
 * 商品管理 only shows garments that made it onto the shop, so its status filter has just these two
 * choices, live first (the default). The API refuses any other status for that page.
 */
export const MANAGED_PRODUCT_STATUS_OPTIONS = [
  ["PUBLISHED", "上架中"],
  ["UNPUBLISHED", "已下架"]
] as const;

export type ManagedProductStatus = (typeof MANAGED_PRODUCT_STATUS_OPTIONS)[number][0];

export const DEFAULT_MANAGED_PRODUCT_STATUS: ManagedProductStatus = "PUBLISHED";

export const IMAGE_ISSUE_LABELS: Record<string, string> = {
  SUBJECT_OFF_CENTER: "主体丢失或严重偏离",
  SUBJECT_TOO_SMALL: "主体过小",
  SUBJECT_TOO_LARGE: "主体过大",
  SUBJECT_TOUCHES_EDGE: "主体触碰边缘",
  SUBJECT_TOUCHES_FRAME: "主体触碰边缘",
  EDGE_FRAGMENTED: "边缘破碎",
  MULTIPLE_FOREGROUND_COMPONENTS: "保留了多个非商品区域",
  BOARD_RESIDUE_SUSPECTED: "疑似保留测量板",
  MASK_HAS_LARGE_HOLES: "主体存在异常缺口"
};

export function productStatusLabel(status: string): string {
  const label = PRODUCT_STATUS_LABELS[status];
  if (label) return t(label);
  return status || t("未知状态");
}

export function imageIssueLabel(issue: string): string {
  const label = IMAGE_ISSUE_LABELS[issue];
  return label ? t(label) : issue;
}
