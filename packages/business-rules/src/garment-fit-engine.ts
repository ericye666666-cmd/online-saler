export const GARMENT_FIT_ENGINE_VERSION = "garment-fit-v1";

export const GARMENT_FIT_DISCLAIMER_EN =
  "Height and weight are reference only. Body shapes vary, so compare the garment measurements with clothing that already fits you well.";

export const GARMENT_FIT_DISCLAIMER_ZH =
  "身高和体重仅供参考。不同体型差异较大，请优先对比商品实测尺寸与自己穿着合适的衣物。";

export type GarmentFitInput = {
  category?: string | null;
  subcategory?: string | null;
  gender?: string | null;
  platformSize?: string | null;
  fitType?: string | null;
  stretchLevel?: string | null;
  fabricWeight?: string | null;
  measurements: Record<string, number | null | undefined>;
};

export type GarmentFitRecommendation = {
  bodyChestMinCm: number | null;
  bodyChestMaxCm: number | null;
  bodyWaistMinCm: number | null;
  bodyWaistMaxCm: number | null;
  bodyHipMinCm: number | null;
  bodyHipMaxCm: number | null;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  weightMinKg: number | null;
  weightMaxKg: number | null;
  expectedFit: string;
  confidence: number;
  basis: string[];
  warnings: string[];
  disclaimer: string;
  disclaimerZh: string;
};

const TOP_CATEGORIES = new Set(["TSHIRTS", "SHIRTS", "LADY_TOPS", "JACKETS"]);
const PANTS_CATEGORIES = new Set(["PANTS", "SHORT"]);
const DRESS_CATEGORIES = new Set(["DRESSES"]);

export function calculateGarmentFitRecommendation(input: GarmentFitInput): GarmentFitRecommendation {
  const category = code(input.category);
  const fitType = code(input.fitType) || "UNKNOWN";
  const stretch = code(input.stretchLevel) || "UNKNOWN";
  const fabricWeight = code(input.fabricWeight) || "UNKNOWN";
  const result = emptyRecommendation(fitType);
  result.basis.push(GARMENT_FIT_ENGINE_VERSION);

  const chestWidth = measurement(input, "CHEST_WIDTH");
  const waistWidth = measurement(input, "WAIST");
  const hipWidth = measurement(input, "HIP");
  const length = measurement(input, "LENGTH");
  const outseam = measurement(input, "OUTSEAM");
  const sleeve = measurement(input, "SLEEVE_LENGTH");

  if (TOP_CATEGORIES.has(category) || DRESS_CATEGORIES.has(category)) {
    const chest = bodyRange(chestWidth, upperBodyEase(fitType, stretch, fabricWeight), fitSpan(fitType));
    assignRange(result, "Chest", chest);
  }
  if (PANTS_CATEGORIES.has(category) || DRESS_CATEGORIES.has(category)) {
    const waist = bodyRange(waistWidth, waistEase(stretch), 6);
    const hip = bodyRange(hipWidth, hipEase(fitType, stretch), 8);
    assignRange(result, "Waist", waist);
    assignRange(result, "Hip", hip);
  }

  const height = referenceHeight(category, { length, outseam, sleeve });
  if (height) {
    result.heightMinCm = height[0];
    result.heightMaxCm = height[1];
    result.basis.push(height[2]);
  }

  const bodyRangeCount = [result.bodyChestMaxCm, result.bodyWaistMaxCm, result.bodyHipMaxCm]
    .filter((value) => value !== null).length;
  let confidence = 0.25 + bodyRangeCount * 0.16;
  if (height) confidence += 0.1;
  if (fitType !== "UNKNOWN") confidence += 0.08;
  if (stretch !== "UNKNOWN") confidence += 0.08;
  if (TOP_CATEGORIES.has(category) || PANTS_CATEGORIES.has(category) || DRESS_CATEGORIES.has(category)) confidence += 0.05;
  result.confidence = round(Math.min(0.92, confidence), 2);

  const weight = referenceWeight(input, result);
  if (weight) {
    result.weightMinKg = weight[0];
    result.weightMaxKg = weight[1];
    result.basis.push("WEIGHT_FROM_BROAD_PLATFORM_SIZE_REFERENCE");
    result.warnings.push("WEIGHT_IS_WEAK_REFERENCE");
  } else {
    result.warnings.push("WEIGHT_RANGE_NOT_SHOWN_WITHOUT_HIGH_CONFIDENCE");
  }

  if (bodyRangeCount === 0) result.warnings.push("MISSING_REQUIRED_BODY_MEASUREMENTS");
  if (!height) result.warnings.push("HEIGHT_RANGE_NOT_RELIABLE_FOR_THIS_ITEM");
  return result;
}

function emptyRecommendation(fitType: string): GarmentFitRecommendation {
  return {
    bodyChestMinCm: null,
    bodyChestMaxCm: null,
    bodyWaistMinCm: null,
    bodyWaistMaxCm: null,
    bodyHipMinCm: null,
    bodyHipMaxCm: null,
    heightMinCm: null,
    heightMaxCm: null,
    weightMinKg: null,
    weightMaxKg: null,
    expectedFit: expectedFit(fitType),
    confidence: 0,
    basis: [],
    warnings: [],
    disclaimer: GARMENT_FIT_DISCLAIMER_EN,
    disclaimerZh: GARMENT_FIT_DISCLAIMER_ZH
  };
}

function assignRange(
  result: GarmentFitRecommendation,
  name: "Chest" | "Waist" | "Hip",
  range: [number, number] | null
) {
  if (!range) return;
  const lower = `body${name}MinCm` as const;
  const upper = `body${name}MaxCm` as const;
  result[lower] = range[0];
  result[upper] = range[1];
  result.basis.push(`${name.toUpperCase()}_FROM_FINAL_FLAT_MEASUREMENT`);
}

function bodyRange(flatWidth: number | null, targetEase: number, span: number): [number, number] | null {
  if (flatWidth === null || flatWidth <= 0) return null;
  const garmentCircumference = flatWidth * 2;
  const maximum = round(Math.max(1, garmentCircumference - Math.max(0, targetEase)), 1);
  return [round(Math.max(1, maximum - span), 1), maximum];
}

function upperBodyEase(fit: string, stretch: string, fabric: string): number {
  const base = ({ SLIM: 4, REGULAR: 8, RELAXED: 14, OVERSIZED: 20, UNKNOWN: 10 } as Record<string, number>)[fit] ?? 10;
  const stretchAdjustment = ({ NONE: 0, LOW: -1, MEDIUM: -3, HIGH: -6, UNKNOWN: 0 } as Record<string, number>)[stretch] ?? 0;
  const fabricAdjustment = fabric === "HEAVY" ? 2 : 0;
  return Math.max(0, base + stretchAdjustment + fabricAdjustment);
}

function waistEase(stretch: string): number {
  return ({ NONE: 2, LOW: 1, MEDIUM: 0, HIGH: -3, UNKNOWN: 2 } as Record<string, number>)[stretch] ?? 2;
}

function hipEase(fit: string, stretch: string): number {
  const base = ({ SLIM: 4, REGULAR: 7, RELAXED: 11, OVERSIZED: 15, UNKNOWN: 8 } as Record<string, number>)[fit] ?? 8;
  const adjustment = ({ NONE: 0, LOW: -1, MEDIUM: -3, HIGH: -5, UNKNOWN: 0 } as Record<string, number>)[stretch] ?? 0;
  return Math.max(0, base + adjustment);
}

function fitSpan(fit: string): number {
  return ({ SLIM: 4, REGULAR: 6, RELAXED: 8, OVERSIZED: 10, UNKNOWN: 6 } as Record<string, number>)[fit] ?? 6;
}

function referenceHeight(
  category: string,
  values: { length: number | null; outseam: number | null; sleeve: number | null }
): [number, number, string] | null {
  if (category === "PANTS" && values.outseam && values.outseam >= 80) {
    const center = clamp(values.outseam * 1.7, 150, 192);
    return [round(center - 7, 0), round(center + 7, 0), "HEIGHT_FROM_OUTSEAM_WEAK_REFERENCE"];
  }
  if (TOP_CATEGORIES.has(category) && values.sleeve && values.sleeve >= 45 && values.length) {
    const center = clamp(values.sleeve * 2.7, 150, 192);
    return [round(center - 7, 0), round(center + 7, 0), "HEIGHT_FROM_SLEEVE_AND_LENGTH_WEAK_REFERENCE"];
  }
  return null;
}

function referenceWeight(
  input: GarmentFitInput,
  recommendation: GarmentFitRecommendation
): [number, number] | null {
  if (recommendation.confidence < 0.7 || recommendation.heightMinCm === null) return null;
  const gender = code(input.gender);
  if (!new Set(["MEN", "WOMEN", "UNISEX"]).has(gender)) return null;
  const size = normalizeSize(input.platformSize);
  const range = ({
    XS: [42, 54],
    S: [48, 62],
    M: [55, 72],
    L: [63, 82],
    XL: [72, 94],
    XXL: [82, 106]
  } as Record<string, [number, number]>)[size];
  return range ?? null;
}

function measurement(input: GarmentFitInput, name: string): number | null {
  const value = Number(input.measurements[name]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function expectedFit(fitType: string): string {
  return ({
    SLIM: "CLOSE_TO_BODY",
    REGULAR: "REGULAR_EASE",
    RELAXED: "RELAXED_EASE",
    OVERSIZED: "INTENTIONALLY_OVERSIZED",
    UNKNOWN: "COMPARE_MEASUREMENTS"
  } as Record<string, string>)[fitType] ?? "COMPARE_MEASUREMENTS";
}

function normalizeSize(value?: string | null): string {
  const normalized = code(value).replace(/^.*?\b(XS|S|M|L|XL|XXL)\b.*$/, "$1");
  return new Set(["XS", "S", "M", "L", "XL", "XXL"]).has(normalized) ? normalized : "";
}

function code(value?: string | null): string {
  return String(value ?? "").trim().toUpperCase();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
