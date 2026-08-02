export const PRODUCT_IMAGE_UPLOAD_ROTATIONS = [0, 90, 180, 270] as const;
export type ProductImageUploadRotation = (typeof PRODUCT_IMAGE_UPLOAD_ROTATIONS)[number];

export function parseProductImageUploadRotation(value: string | undefined): ProductImageUploadRotation {
  if (!value?.trim()) return 0;
  const rotation = Number(value);
  if (!PRODUCT_IMAGE_UPLOAD_ROTATIONS.includes(rotation as ProductImageUploadRotation)) {
    throw new Error("x-image-rotation must be 0, 90, 180 or 270");
  }
  return rotation as ProductImageUploadRotation;
}
