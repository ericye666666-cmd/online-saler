export function findDerivedImageForSource<
  T extends { id: string; sourceImageId: string; variant: string }
>(
  assets: readonly T[],
  variant: string,
  sourceImageId: string | null,
  selectedImageId: string | null
): T | null {
  if (!sourceImageId) return null;
  const matching = assets.filter((asset) =>
    asset.variant === variant && asset.sourceImageId === sourceImageId
  );
  return matching.find((asset) => asset.id === selectedImageId) ?? matching[0] ?? null;
}

// Keep a confirmed live display visible while all new generation uses originals.
export function findDisplayImageForSource<T extends { id: string; sourceImageId: string; variant: string }>(
  assets: readonly T[], originalImageId: string | null, selectedImageId: string | null, preserveConfirmedPublishedImage: boolean
): T | null {
  return findDerivedImageForSource(assets, "AI_DISPLAY_MAIN", originalImageId, selectedImageId)
    ?? (preserveConfirmedPublishedImage
      ? assets.find((asset) => asset.variant === "AI_DISPLAY_MAIN" && asset.id === selectedImageId) ?? null
      : null);
}
