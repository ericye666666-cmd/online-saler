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
