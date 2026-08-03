import type { Product } from "./data/products";

export type ProductGalleryItem = {
  id: string;
  image: string;
  label: string;
};

export type VisibleMeasurement = {
  type: string;
  label: string;
  valueCm: number;
};

const EMPTY_VALUES = new Set(["", "not confirmed", "not specified", "unknown", "n/a", "none recorded"]);

const MEASUREMENT_LABELS: Record<string, string> = {
  LENGTH: "Garment length",
  GARMENT_LENGTH: "Garment length",
  CHEST_WIDTH: "Chest width",
  BUST_WIDTH: "Bust width",
  SHOULDER_WIDTH: "Shoulder width",
  SLEEVE_LENGTH: "Sleeve length",
  WAIST: "Waist width",
  WAIST_WIDTH: "Waist width",
  HIP: "Hip width",
  HIP_WIDTH: "Hip width",
  INSEAM: "Inseam",
  OUTSEAM: "Outseam",
  LEG_OPENING: "Leg opening",
  THIGH_WIDTH: "Thigh width",
  HEM_WIDTH: "Hem width",
  RISE: "Rise",
};

const MEASUREMENT_PRIORITIES: Record<string, string[]> = {
  Trousers: ["WAIST", "WAIST_WIDTH", "HIP", "HIP_WIDTH", "OUTSEAM", "INSEAM"],
  Pants: ["WAIST", "WAIST_WIDTH", "HIP", "HIP_WIDTH", "OUTSEAM", "INSEAM"],
  Skirts: ["WAIST", "WAIST_WIDTH", "HIP", "HIP_WIDTH", "GARMENT_LENGTH", "LENGTH"],
  Dresses: ["BUST_WIDTH", "CHEST_WIDTH", "WAIST", "WAIST_WIDTH", "HIP", "HIP_WIDTH", "GARMENT_LENGTH", "LENGTH"],
  Tops: ["CHEST_WIDTH", "BUST_WIDTH", "SHOULDER_WIDTH", "SLEEVE_LENGTH", "GARMENT_LENGTH", "LENGTH"],
  Jackets: ["CHEST_WIDTH", "SHOULDER_WIDTH", "SLEEVE_LENGTH", "GARMENT_LENGTH", "LENGTH"],
  Knitwear: ["CHEST_WIDTH", "SHOULDER_WIDTH", "SLEEVE_LENGTH", "GARMENT_LENGTH", "LENGTH"],
};

export function normalizeProductTitle(brand: string, title: string): string {
  const cleanBrand = normalizeSpace(brand);
  const cleanTitle = normalizeSpace(title) || "Second-hand item";
  if (!cleanBrand || cleanBrand.toLowerCase() === "unbranded") return cleanTitle;

  const brandPattern = new RegExp(`^(?:${escapeRegExp(cleanBrand)}\\s*)+`, "i");
  if (brandPattern.test(cleanTitle)) {
    const remainder = cleanTitle.replace(brandPattern, "").trim();
    return remainder ? `${cleanBrand} ${remainder}` : cleanBrand;
  }

  if (cleanTitle.toLowerCase().includes(cleanBrand.toLowerCase())) return cleanTitle;
  return `${cleanBrand} ${cleanTitle}`;
}

export function publicProductCode(product: Pick<ProductPublicIdentity, "id" | "productCode" | "barcode">): string {
  return cleanValue(product.barcode) ?? cleanValue(product.productCode) ?? product.id;
}

export function optionalDisplayValue(value: string | null | undefined): string | null {
  const clean = normalizeSpace(value ?? "");
  if (EMPTY_VALUES.has(clean.toLowerCase())) return null;
  return clean;
}

export function productCopyWithoutPrice(value: string | null | undefined): string | null {
  const visible = optionalDisplayValue(value);
  if (!visible) return null;
  const cleaned = visible
    .replace(/\bKSh\s*[\d,]+(?:\.\d{1,2})?\b\.?/gi, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\.{2,}/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
  return optionalDisplayValue(cleaned);
}

export function sellingPointsWithoutPrice(values: readonly string[]): string[] {
  return values
    .filter((value) => !/\bKSh\s*[\d,]+(?:\.\d{1,2})?\b/i.test(value))
    .map((value) => optionalDisplayValue(value))
    .filter((value): value is string => Boolean(value))
    .slice(0, 3);
}

export function buildProductGallery(product: Product): ProductGalleryItem[] {
  const detailAssets = product.detail?.assets ?? [];
  const sourceImages = product.detail?.sourceImages ?? [];
  const candidates: ProductGalleryItem[] = [
    { id: "optimized-main", image: product.image, label: "Front main" },
    ...detailAssets
      .filter((asset) => asset.type === "BACK_MAIN")
      .map((asset) => ({ id: asset.id, image: asset.image, label: "Back main" })),
    ...sourceImages
      .filter((image) => image.type === "DETAIL")
      .map((image, index) => ({ id: image.id, image: image.image, label: `Detail ${index + 1}` })),
    ...sourceImages
      .filter((image) => image.type === "DEFECT")
      .map((image, index) => ({ id: image.id, image: image.image, label: `Defect ${index + 1}` })),
    ...sourceImages
      .filter((image) => image.type === "LABEL")
      .map((image) => ({ id: image.id, image: image.image, label: "Label" })),
  ];

  const seen = new Set<string>();
  return candidates.filter((item) => {
    const image = item.image.trim();
    if (!image || seen.has(image)) return false;
    seen.add(image);
    return true;
  });
}

export function visibleMeasurements(
  measurements: Array<{ type: string; valueCm: string | null }>,
  category: string,
): VisibleMeasurement[] {
  const visible = (measurements ?? []).flatMap((measurement) => {
    const valueCm = Number(measurement.valueCm);
    if (!Number.isFinite(valueCm) || valueCm <= 0) return [];
    return [{
      type: measurement.type,
      label: MEASUREMENT_LABELS[measurement.type] ?? displayEnum(measurement.type),
      valueCm,
    }];
  });
  const priorities = MEASUREMENT_PRIORITIES[category] ?? [];
  const priority = new Map(priorities.map((type, index) => [type, index]));
  return visible.sort((left, right) =>
    (priority.get(left.type) ?? 999) - (priority.get(right.type) ?? 999)
      || left.label.localeCompare(right.label)
  );
}

export function formatMeasurement(valueCm: number): string {
  return `${Number.isInteger(valueCm) ? valueCm.toFixed(0) : valueCm.toFixed(1)} cm`;
}

type ProductPublicIdentity = {
  id: string;
  productCode: string;
  barcode: string | null;
};

function cleanValue(value: string | null | undefined): string | null {
  const clean = value?.trim();
  return clean || null;
}

function normalizeSpace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function displayEnum(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
