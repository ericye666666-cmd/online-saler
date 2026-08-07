export type UkSizeRecommendationInput = {
  platformSize?: string | null;
  category?: string | null;
  subcategory?: string | null;
  audience?: string | null;
  kidsAgeRange?: string | null;
  measurements: {
    waistCm?: number | string | null;
  };
};

export type UkSizeRecommendation = {
  size: string;
  confidence: number;
  basis: string[];
  warnings: string[];
};

const CLOTHING_CATEGORIES = new Set([
  "KIDS",
  "PANTS",
  "JACKETS",
  "DRESSES",
  "LADY_TOPS",
  "SHIRTS",
  "TSHIRTS",
  "SHORT",
  "TWO_PIECE"
]);
const PANTS_CATEGORIES = new Set(["PANTS", "SHORT"]);

const WOMEN_UK_SIZE_BY_PLATFORM: Record<string, string> = {
  XS: "UK 6-8",
  S: "UK 8-10",
  M: "UK 12-14",
  L: "UK 16-18",
  XL: "UK 20-22",
  XXL: "UK 24-26",
  "3XL": "UK 28",
  "4XL": "UK 30",
  "5XL": "UK 32"
};

const KIDS_UK_SIZE_BY_AGE_RANGE: Record<string, string> = {
  NEWBORN: "UK Newborn",
  BABY_0_12M: "UK 0-12M",
  TODDLER_1_3Y: "UK 1-3Y",
  PRESCHOOL_3_5Y: "UK 3-5Y",
  KIDS_6_8Y: "UK 6-8Y",
  KIDS_9_12Y: "UK 9-12Y",
  TEEN_13_16Y: "UK 13-16Y"
};

export function recommendUkSize(input: UkSizeRecommendationInput): UkSizeRecommendation | null {
  const category = code(input.category);
  const subcategory = code(input.subcategory);
  const audience = code(input.audience);

  if (!CLOTHING_CATEGORIES.has(category)) return null;

  if (audience === "KIDS" || category === "KIDS") {
    const kidsSize = KIDS_UK_SIZE_BY_AGE_RANGE[code(input.kidsAgeRange)];
    return kidsSize
      ? recommendation(kidsSize, 0.84, ["UK_SIZE_V1", "KIDS_AGE_RANGE"])
      : null;
  }

  const platformSize = code(input.platformSize);
  if (!platformSize) return null;

  const isPants = PANTS_CATEGORIES.has(category) || subcategory === "KIDS_PANTS";
  const waistWidthCm = positiveNumber(input.measurements.waistCm);
  if (isPants && audience !== "WOMEN" && waistWidthCm !== null) {
    const waistInches = Math.round((waistWidthCm * 2) / 2.54);
    if (waistInches >= 20 && waistInches <= 60) {
      return recommendation(`UK W${waistInches}`, 0.88, [
        "UK_SIZE_V1",
        "PANTS_FROM_FINAL_FLAT_WAIST_WIDTH"
      ]);
    }
  }

  if (audience === "WOMEN") {
    const womenSize = WOMEN_UK_SIZE_BY_PLATFORM[platformSize];
    return womenSize
      ? recommendation(womenSize, 0.84, ["UK_SIZE_V1", "WOMEN_FROM_PLATFORM_SIZE"])
      : null;
  }

  if (audience === "MEN" || audience === "UNISEX") {
    return recommendation(`UK ${platformSize}`, 0.82, ["UK_SIZE_V1", "LETTER_SIZE_FROM_PLATFORM_SIZE"]);
  }

  return null;
}

function recommendation(size: string, confidence: number, basis: string[]): UkSizeRecommendation {
  return { size, confidence, basis, warnings: [] };
}

function positiveNumber(value: number | string | null | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function code(value?: string | null): string {
  return String(value ?? "").trim().toUpperCase();
}
