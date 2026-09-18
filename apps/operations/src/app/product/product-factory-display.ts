import { t } from "@/i18n/runtime";
export const PRODUCT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "待上传",
  PHOTOGRAPHED: "待 AI 识别",
  AI_PROCESSING: "AI 识别中",
  AI_PROCESSED: "待人工校准",
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
