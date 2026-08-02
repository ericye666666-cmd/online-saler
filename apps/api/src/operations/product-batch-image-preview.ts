export type ProductBatchImagePreview = {
  imageId: string;
  variant: string;
  publicUrl: string;
  selectedAsMain: boolean;
};

type OriginalImage = {
  id: string;
  type: string;
  publicUrl: string | null;
};

type VariantAsset = {
  id: string;
  variant: string;
  publicUrl: string | null;
};

type MainImageSelection = {
  selectedImageId: string;
} | null;

const PREVIEW_VARIANT_ORDER = [
  "OPTIMIZED_BALANCED_MAIN",
  "OPTIMIZED_MAIN",
  "CUTOUT_WHITE",
  "CUTOUT_TRANSPARENT"
] as const;

export function buildProductBatchImagePreviews(
  originalImages: OriginalImage[],
  variantAssets: VariantAsset[],
  selection: MainImageSelection
): ProductBatchImagePreview[] {
  const frontOriginal = originalImages.find((image) => image.type === "FRONT" && image.publicUrl);
  const selectedVariant = variantAssets.find(
    (asset) => asset.id === selection?.selectedImageId && asset.publicUrl
  );
  const selectedOriginal = frontOriginal?.id === selection?.selectedImageId ? frontOriginal : null;
  const latestByVariant = new Map<string, VariantAsset>();
  for (const asset of variantAssets) {
    if (asset.publicUrl && !latestByVariant.has(asset.variant)) {
      latestByVariant.set(asset.variant, asset);
    }
  }

  const candidates: ProductBatchImagePreview[] = selectedVariant?.publicUrl
    ? [{
        imageId: selectedVariant.id,
        variant: selectedVariant.variant,
        publicUrl: selectedVariant.publicUrl,
        selectedAsMain: true
      }]
    : selectedOriginal?.publicUrl
      ? [{
          imageId: selectedOriginal.id,
          variant: "ORIGINAL",
          publicUrl: selectedOriginal.publicUrl,
          selectedAsMain: true
        }]
      : [];
  for (const variant of PREVIEW_VARIANT_ORDER) {
    if (variant === selectedVariant?.variant) continue;
    const asset = latestByVariant.get(variant);
    if (asset?.publicUrl && asset.id !== selection?.selectedImageId) {
      candidates.push({
        imageId: asset.id,
        variant,
        publicUrl: asset.publicUrl,
        selectedAsMain: asset.id === selection?.selectedImageId
      });
    }
  }
  if (frontOriginal?.publicUrl && frontOriginal.id !== selection?.selectedImageId) {
    candidates.push({
      imageId: frontOriginal.id,
      variant: "ORIGINAL",
      publicUrl: frontOriginal.publicUrl,
      selectedAsMain: frontOriginal.id === selection?.selectedImageId
    });
  }

  return candidates;
}
