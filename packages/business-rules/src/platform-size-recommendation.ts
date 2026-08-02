export type PlatformSizeRecommendationInput = {
  category?: string | null;
  subcategory?: string | null;
  audience?: string | null;
  kidsAgeRange?: string | null;
  fitType?: string | null;
  measurements: {
    chestWidthCm?: number | string | null;
    waistCm?: number | string | null;
    hipCm?: number | string | null;
  };
};

export type PlatformSizeMeasurement = {
  type: "CHEST_WIDTH" | "WAIST" | "HIP" | "KIDS_AGE_RANGE";
  value: number | string;
};

export type PlatformSizeRecommendation = {
  size: string;
  confidence: number;
  measurementsUsed: PlatformSizeMeasurement[];
  basis: string[];
  warnings: string[];
};

const SIZE_LABELS = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"] as const;
const TOP_CATEGORIES = new Set(["TSHIRTS", "SHIRTS", "LADY_TOPS", "JACKETS", "TWO_PIECE"]);
const PANTS_CATEGORIES = new Set(["PANTS", "SHORT"]);
const DRESS_CATEGORIES = new Set(["DRESSES"]);

const TOP_MAXIMA = {
  WOMEN: [43, 46, 50, 54, 58, 62, 66, 70, Number.POSITIVE_INFINITY],
  GENERAL: [47, 50, 54, 58, 62, 66, 70, 74, Number.POSITIVE_INFINITY]
} as const;

const WAIST_MAXIMA = {
  WOMEN: [33, 36, 39, 42, 46, 50, 54, 58, Number.POSITIVE_INFINITY],
  GENERAL: [36, 39, 42, 45, 49, 53, 57, 61, Number.POSITIVE_INFINITY]
} as const;

const HIP_MAXIMA = {
  WOMEN: [45, 48, 51, 54, 58, 62, 66, 70, Number.POSITIVE_INFINITY],
  GENERAL: [48, 51, 54, 57, 60, 64, 68, 72, Number.POSITIVE_INFINITY]
} as const;

const KIDS_SIZE_BY_AGE_RANGE: Record<string, string> = {
  NEWBORN: "XS",
  BABY_0_12M: "XS",
  TODDLER_1_3Y: "S",
  PRESCHOOL_3_5Y: "M",
  KIDS_6_8Y: "L",
  KIDS_9_12Y: "XL",
  TEEN_13_16Y: "XXL"
};

export function recommendPlatformSize(
  input: PlatformSizeRecommendationInput
): PlatformSizeRecommendation | null {
  const category = code(input.category);
  const subcategory = code(input.subcategory);
  const audience = code(input.audience);

  if (audience === "KIDS" || category === "KIDS") {
    const ageRange = code(input.kidsAgeRange);
    const size = KIDS_SIZE_BY_AGE_RANGE[ageRange];
    return size
      ? {
          size,
          confidence: 0.82,
          measurementsUsed: [{ type: "KIDS_AGE_RANGE", value: ageRange }],
          basis: ["PLATFORM_SIZE_V1", "KIDS_AGE_RANGE"],
          warnings: ["KIDS_SIZE_USES_AGE_RANGE"]
        }
      : null;
  }

  const profile = audience === "WOMEN" ? "WOMEN" : "GENERAL";
  const chestWidth = positiveNumber(input.measurements.chestWidthCm);
  const waistWidth = positiveNumber(input.measurements.waistCm);
  const hipWidth = positiveNumber(input.measurements.hipCm);

  if (TOP_CATEGORIES.has(category) || (category === "KIDS" && !subCategoryIsPants(subcategory))) {
    if (chestWidth === null) return null;
    const adjustedChestWidth = chestWidth + fitAdjustment(input.fitType);
    return recommendation(
      sizeFromWidth(adjustedChestWidth, TOP_MAXIMA[profile]),
      [{ type: "CHEST_WIDTH", value: chestWidth }],
      ["PLATFORM_SIZE_V1", "TOP_FROM_FINAL_FLAT_CHEST_WIDTH"],
      input.fitType ? [`FIT_PROFILE_${code(input.fitType) || "UNKNOWN"}`] : []
    );
  }

  if (PANTS_CATEGORIES.has(category) || subCategoryIsPants(subcategory)) {
    const candidates = compactCandidates([
      waistWidth === null ? null : {
        size: sizeFromWidth(waistWidth, WAIST_MAXIMA[profile]),
        measurement: { type: "WAIST" as const, value: waistWidth }
      },
      hipWidth === null ? null : {
        size: sizeFromWidth(hipWidth, HIP_MAXIMA[profile]),
        measurement: { type: "HIP" as const, value: hipWidth }
      }
    ]);
    if (!candidates.length) return null;
    const size = largestSize(candidates.map((candidate) => candidate.size));
    return recommendation(
      size,
      candidates.map((candidate) => candidate.measurement),
      ["PLATFORM_SIZE_V1", "PANTS_FROM_FINAL_FLAT_WAIST_AND_HIP"],
      candidates.length === 1 ? ["ONLY_ONE_PANTS_MEASUREMENT_AVAILABLE"] : []
    );
  }

  if (DRESS_CATEGORIES.has(category)) {
    const candidates = compactCandidates([
      chestWidth === null ? null : {
        size: sizeFromWidth(chestWidth + fitAdjustment(input.fitType), TOP_MAXIMA[profile]),
        measurement: { type: "CHEST_WIDTH" as const, value: chestWidth }
      },
      waistWidth === null ? null : {
        size: sizeFromWidth(waistWidth, WAIST_MAXIMA[profile]),
        measurement: { type: "WAIST" as const, value: waistWidth }
      },
      hipWidth === null ? null : {
        size: sizeFromWidth(hipWidth, HIP_MAXIMA[profile]),
        measurement: { type: "HIP" as const, value: hipWidth }
      }
    ]);
    if (!candidates.length) return null;
    return recommendation(
      largestSize(candidates.map((candidate) => candidate.size)),
      candidates.map((candidate) => candidate.measurement),
      ["PLATFORM_SIZE_V1", "DRESS_FROM_LARGEST_FINAL_FLAT_MEASUREMENT"],
      candidates.length < 3 ? ["INCOMPLETE_DRESS_MEASUREMENTS"] : []
    );
  }

  return null;
}

function recommendation(
  size: string,
  measurementsUsed: PlatformSizeMeasurement[],
  basis: string[],
  warnings: string[]
): PlatformSizeRecommendation {
  return {
    size,
    confidence: measurementsUsed.length > 1 ? 0.86 : 0.8,
    measurementsUsed,
    basis,
    warnings
  };
}

function sizeFromWidth(value: number, maxima: readonly number[]): string {
  const index = maxima.findIndex((maximum) => value <= maximum);
  return SIZE_LABELS[index < 0 ? SIZE_LABELS.length - 1 : index];
}

function largestSize(sizes: string[]): string {
  let largestIndex = 0;
  for (const size of sizes) largestIndex = Math.max(largestIndex, SIZE_LABELS.indexOf(size as never));
  return SIZE_LABELS[largestIndex];
}

function compactCandidates<T>(values: Array<T | null>): T[] {
  return values.filter((value): value is T => value !== null);
}

function subCategoryIsPants(subcategory: string): boolean {
  return subcategory === "KIDS_PANTS";
}

function fitAdjustment(value?: string | null): number {
  return ({ SLIM: 1, REGULAR: 0, RELAXED: -2, OVERSIZED: -4, UNKNOWN: 0 } as Record<string, number>)[code(value)] ?? 0;
}

function positiveNumber(value: number | string | null | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function code(value?: string | null): string {
  return String(value ?? "").trim().toUpperCase();
}
