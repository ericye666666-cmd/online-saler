export const PRODUCT_FACTORY_IMAGE_TYPES = ["FRONT", "BACK", "LABEL", "DEFECT", "DETAIL"] as const;
export type ProductFactoryImageType = (typeof PRODUCT_FACTORY_IMAGE_TYPES)[number];

export const PRODUCT_FACTORY_IMAGE_LABELS: Record<ProductFactoryImageType, string> = {
  FRONT: "正面图",
  BACK: "背面图",
  LABEL: "标签图",
  DEFECT: "瑕疵图",
  DETAIL: "细节图"
};

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function imageUploadIssue(file: Pick<File, "type" | "size">): string | null {
  if (["image/heic", "image/heif"].includes(file.type.toLowerCase())) {
    return "暂不支持 HEIC。请在 iPhone 设置中选择“相机 > 格式 > 兼容性最佳”，或先转换为 JPEG。";
  }
  if (!SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase())) {
    return "只支持 JPEG、PNG 或 WEBP 图片。";
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return "单张图片必须小于 10 MB。";
  }
  return null;
}

export function firstProductMissingFront(products: Array<{ images?: Array<{ type?: unknown }> }>): number {
  const index = products.findIndex((product) => !product.images?.some((image) => image.type === "FRONT"));
  return index === -1 ? Math.max(0, products.length - 1) : index;
}

export function uploadedFrontCount(products: Array<{ images?: Array<{ type?: unknown }> }>): number {
  return products.filter((product) => product.images?.some((image) => image.type === "FRONT")).length;
}
