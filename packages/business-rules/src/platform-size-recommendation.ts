export type PlatformSizeRecommendationInput = {
  category?: string | null;
  subcategory?: string | null;
  audience?: string | null;
  kidsAgeRange?: string | null;
  fitType?: string | null;
  sleeveType?: string | null;
  tags?: readonly string[] | null;
  measurements: {
    lengthCm?: number | string | null;
    chestWidthCm?: number | string | null;
    shoulderWidthCm?: number | string | null;
    sleeveLengthCm?: number | string | null;
    waistCm?: number | string | null;
    hipCm?: number | string | null;
  };
};

export type PlatformSizeMeasurement = {
  type: "LENGTH" | "CHEST_WIDTH" | "SHOULDER_WIDTH" | "SLEEVE_LENGTH" | "WAIST" | "HIP" | "KIDS_AGE_RANGE";
  value: number | string;
};

export type PlatformSizeRecommendation = {
  size: string;
  confidence: number;
  measurementsUsed: PlatformSizeMeasurement[];
  basis: string[];
  warnings: string[];
  requiresHumanReview: boolean;
};

const SIZE_LABELS = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"] as const;
const TOP_CATEGORIES = new Set(["TSHIRTS", "SHIRTS", "LADY_TOPS", "JACKETS", "TWO_PIECE"]);
const PANTS_CATEGORIES = new Set(["PANTS", "SHORT"]);
const DRESS_CATEGORIES = new Set(["DRESSES"]);

const TOP_MAXIMA = {
  WOMEN: [43, 46, 50, 54, 58, 62, 66, 70, Number.POSITIVE_INFINITY],
  GENERAL: [47, 50, 54, 58, 62, 66, 70, 74, Number.POSITIVE_INFINITY]
} as const;

const TOP_LENGTH_MAXIMA = {
  WOMEN: [56, 59, 62, 65, 68, 71, 74, 77, Number.POSITIVE_INFINITY],
  GENERAL: [64, 67, 70, 73, 76, 79, 82, 85, Number.POSITIVE_INFINITY]
} as const;

const TOP_SHOULDER_MAXIMA = {
  WOMEN: [35, 37, 39, 41, 43, 45, 47, 49, Number.POSITIVE_INFINITY],
  GENERAL: [42, 44, 46, 48, 50, 52, 54, 56, Number.POSITIVE_INFINITY]
} as const;

const TOP_LONG_SLEEVE_MAXIMA = {
  WOMEN: [54, 56, 58, 60, 62, 64, 66, 68, Number.POSITIVE_INFINITY],
  GENERAL: [57, 59, 61, 63, 65, 67, 69, 71, Number.POSITIVE_INFINITY]
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
          warnings: ["KIDS_SIZE_USES_AGE_RANGE"],
          requiresHumanReview: false
        }
      : null;
  }

  const profile = audience === "WOMEN" ? "WOMEN" : "GENERAL";
  const length = positiveNumber(input.measurements.lengthCm);
  const chestWidth = positiveNumber(input.measurements.chestWidthCm);
  const shoulderWidth = positiveNumber(input.measurements.shoulderWidthCm);
  const sleeveLength = positiveNumber(input.measurements.sleeveLengthCm);
  const waistWidth = positiveNumber(input.measurements.waistCm);
  const hipWidth = positiveNumber(input.measurements.hipCm);

  if (TOP_CATEGORIES.has(category) || (category === "KIDS" && !subCategoryIsPants(subcategory))) {
    const tags = new Set((input.tags ?? []).map(code));
    const nonStandardShoulder = hasNonStandardShoulder(tags, chestWidth, shoulderWidth);
    const cropped = tags.has("CROPPED");
    const supportCandidates = compactCandidates([
      length === null || cropped ? null : topCandidate("LENGTH", length, TOP_LENGTH_MAXIMA[profile]),
      shoulderWidth === null || nonStandardShoulder
        ? null
        : topCandidate("SHOULDER_WIDTH", shoulderWidth, TOP_SHOULDER_MAXIMA[profile]),
      sleeveLength === null || nonStandardShoulder || code(input.sleeveType) !== "LONG"
        ? null
        : topCandidate("SLEEVE_LENGTH", sleeveLength, TOP_LONG_SLEEVE_MAXIMA[profile])
    ]);
    const warnings = [
      ...(nonStandardShoulder ? ["DROPPED_OR_RAGLAN_SHOULDER_EXCLUDED"] : []),
      ...(cropped ? ["CROPPED_LENGTH_EXCLUDED"] : []),
      ...(input.fitType ? [`FIT_PROFILE_${code(input.fitType) || "UNKNOWN"}`] : [])
    ];

    if (chestWidth !== null) {
      const size = sizeFromWidth(chestWidth, TOP_MAXIMA[profile]);
      const sizeIndex = sizeIndexOf(size);
      const conflicting = supportCandidates.filter((candidate) => Math.abs(sizeIndexOf(candidate.size) - sizeIndex) > 1);
      warnings.push(...conflicting.map((candidate) => `${candidate.measurement.type}_PROPORTION_DIFFERS_FROM_CHEST`));
      return recommendation(
        size,
        [{ type: "CHEST_WIDTH", value: chestWidth }, ...supportCandidates.map((candidate) => candidate.measurement)],
        ["PLATFORM_SIZE_V2", "TOP_PRIMARY_CHEST_WITH_PROPORTION_CHECKS"],
        warnings,
        conflicting.length >= 2 || conflicting.some((candidate) => Math.abs(sizeIndexOf(candidate.size) - sizeIndex) > 2),
        Math.max(0.55, Math.min(0.92, 0.82 + supportCandidates.length * 0.03 - conflicting.length * 0.08))
      );
    }

    if (!supportCandidates.length) return null;
    warnings.push("MISSING_CHEST_PRIMARY_MEASUREMENT");
    return recommendation(
      medianSize(supportCandidates.map((candidate) => candidate.size)),
      supportCandidates.map((candidate) => candidate.measurement),
      ["PLATFORM_SIZE_V2", "TOP_SUPPORTING_MEASUREMENTS_ONLY"],
      warnings,
      true,
      0.58
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
  warnings: string[],
  requiresHumanReview = false,
  confidence = measurementsUsed.length > 1 ? 0.86 : 0.8
): PlatformSizeRecommendation {
  return {
    size,
    confidence,
    measurementsUsed,
    basis,
    warnings,
    requiresHumanReview
  };
}

function topCandidate(
  type: Extract<PlatformSizeMeasurement["type"], "LENGTH" | "SHOULDER_WIDTH" | "SLEEVE_LENGTH">,
  value: number,
  maxima: readonly number[]
) {
  return {
    size: sizeFromWidth(value, maxima),
    measurement: { type, value } satisfies PlatformSizeMeasurement
  };
}

function hasNonStandardShoulder(
  tags: Set<string>,
  chestWidth: number | null,
  shoulderWidth: number | null
): boolean {
  if (tags.has("DROP_SHOULDER") || tags.has("RAGLAN_SLEEVE")) return true;
  return chestWidth !== null && shoulderWidth !== null && shoulderWidth >= chestWidth * 0.98;
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

function medianSize(sizes: string[]): string {
  const indexes = sizes.map(sizeIndexOf).sort((left, right) => left - right);
  return SIZE_LABELS[indexes[Math.floor(indexes.length / 2)]];
}

function sizeIndexOf(size: string): number {
  const index = SIZE_LABELS.indexOf(size as never);
  return index < 0 ? 0 : index;
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
