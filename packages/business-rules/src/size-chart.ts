/**
 * Direct Loop size chart v1 — the single source of truth for garment sizing.
 *
 * Staff confirm two facts: the Fit (MEN / WOMEN / UNISEX / KIDS) and the Standard Size.
 * Everything else on this page — UK size, recommended height, recommended weight and,
 * for kids, the recommended age — is looked up here, never typed and never measured.
 *
 * Second-hand stock comes from different countries, brands and cuts, so the recommended
 * ranges are a fit hint, not a guarantee that the garment fits that body.
 */

export const SIZE_FITS = ["MEN", "WOMEN", "UNISEX", "KIDS"] as const;
export type SizeFit = (typeof SIZE_FITS)[number];

export const ADULT_STANDARD_SIZES = ["S", "M", "L", "XL", "XXL", "XXXL"] as const;
export type AdultStandardSize = (typeof ADULT_STANDARD_SIZES)[number];

export const KIDS_STANDARD_SIZES = ["BABY", "XS", "S", "M", "L", "XL"] as const;
export type KidsStandardSize = (typeof KIDS_STANDARD_SIZES)[number];

export type StandardSize = AdultStandardSize | KidsStandardSize;

export type SizeChartEntry = {
  fit: SizeFit;
  standardSize: StandardSize;
  /** UK size for women, UK equivalent for men and unisex, null for kids. */
  ukSize: string | null;
  heightMinCm: number;
  heightMaxCm: number;
  weightMinKg: number;
  weightMaxKg: number;
  /** Kids only. Age is a helper: read height first, then weight, then age. */
  ageMinYears?: number;
  ageMaxYears?: number;
  /** Kids only. Stable code stored on the product. */
  ageRangeCode?: KidsAgeRangeCode;
};

export const KIDS_AGE_RANGE_CODES = [
  "BABY_0_1Y",
  "TODDLER_1_3Y",
  "PRESCHOOL_3_5Y",
  "KIDS_5_8Y",
  "KIDS_8_11Y",
  "KIDS_11_14Y"
] as const;
export type KidsAgeRangeCode = (typeof KIDS_AGE_RANGE_CODES)[number];

const MEN: SizeChartEntry[] = [
  entry("MEN", "S", "UK 34-36", 160, 170, 50, 65),
  entry("MEN", "M", "UK 38-40", 165, 175, 60, 75),
  entry("MEN", "L", "UK 42-44", 170, 180, 70, 85),
  entry("MEN", "XL", "UK 46-48", 175, 185, 80, 95),
  entry("MEN", "XXL", "UK 50-52", 175, 190, 90, 110),
  entry("MEN", "XXXL", "UK 54-56", 180, 195, 105, 125)
];

const WOMEN: SizeChartEntry[] = [
  entry("WOMEN", "S", "UK 6-8", 150, 160, 40, 50),
  entry("WOMEN", "M", "UK 10-12", 155, 165, 48, 60),
  entry("WOMEN", "L", "UK 14", 160, 170, 58, 70),
  entry("WOMEN", "XL", "UK 16", 160, 175, 68, 82),
  entry("WOMEN", "XXL", "UK 18-20", 165, 180, 80, 98),
  entry("WOMEN", "XXXL", "UK 22-24", 165, 185, 95, 115)
];

const UNISEX: SizeChartEntry[] = [
  entry("UNISEX", "S", "UK 34-36", 150, 165, 45, 60),
  entry("UNISEX", "M", "UK 38-40", 155, 175, 55, 70),
  entry("UNISEX", "L", "UK 42-44", 160, 180, 65, 80),
  entry("UNISEX", "XL", "UK 46-48", 165, 185, 75, 95),
  entry("UNISEX", "XXL", "UK 50-52", 170, 190, 90, 110),
  entry("UNISEX", "XXXL", "UK 54-56", 175, 195, 105, 125)
];

const KIDS: SizeChartEntry[] = [
  kids("BABY", "BABY_0_1Y", 0, 1, 50, 75, 3, 10),
  kids("XS", "TODDLER_1_3Y", 1, 3, 75, 100, 9, 16),
  kids("S", "PRESCHOOL_3_5Y", 3, 5, 95, 115, 14, 22),
  kids("M", "KIDS_5_8Y", 5, 8, 110, 130, 18, 30),
  kids("L", "KIDS_8_11Y", 8, 11, 125, 145, 25, 42),
  kids("XL", "KIDS_11_14Y", 11, 14, 140, 165, 35, 60)
];

export const SIZE_CHART: Record<SizeFit, SizeChartEntry[]> = { MEN, WOMEN, UNISEX, KIDS };

export function isSizeFit(value: unknown): value is SizeFit {
  return (SIZE_FITS as readonly unknown[]).includes(value);
}

export function standardSizesForFit(fit: string | null | undefined): readonly StandardSize[] {
  return normalizeFit(fit) === "KIDS" ? KIDS_STANDARD_SIZES : ADULT_STANDARD_SIZES;
}

/** The chart row behind a confirmed Fit + Standard Size, or null when either is missing. */
export function sizeChartEntry(
  fit: string | null | undefined,
  standardSize: string | null | undefined
): SizeChartEntry | null {
  const resolvedFit = normalizeFit(fit);
  if (!resolvedFit) return null;
  const size = normalizeStandardSize(standardSize);
  return SIZE_CHART[resolvedFit].find((row) => row.standardSize === size) ?? null;
}

/**
 * UK 6/8 -> S, 10/12 -> M, 14 -> L, 16 -> XL, 18/20 -> XXL, 22/24 -> XXXL.
 * Women's labels are the only numeric system this chart converts from.
 */
export function womenStandardSizeFromUk(value: number | string | null | undefined): AdultStandardSize | null {
  const number = Number(String(value ?? "").trim().replace(/^UK\s*/i, ""));
  if (!Number.isFinite(number)) return null;
  const row = WOMEN.find((candidate) => ukRangeContains(candidate.ukSize, number));
  return (row?.standardSize as AdultStandardSize | undefined) ?? null;
}

export function kidsAgeRangeCodeFor(standardSize: string | null | undefined): KidsAgeRangeCode | null {
  return sizeChartEntry("KIDS", standardSize)?.ageRangeCode ?? null;
}

export function kidsStandardSizeFromAgeRange(code: string | null | undefined): KidsStandardSize | null {
  const resolved = normalizeKidsAgeRangeCode(code);
  const row = KIDS.find((candidate) => candidate.ageRangeCode === resolved);
  return (row?.standardSize as KidsStandardSize | undefined) ?? null;
}

/** Map age-range codes stored before this chart onto the six current buckets. */
export function normalizeKidsAgeRangeCode(code: string | null | undefined): KidsAgeRangeCode | null {
  const value = String(code ?? "").trim().toUpperCase();
  if ((KIDS_AGE_RANGE_CODES as readonly string[]).includes(value)) return value as KidsAgeRangeCode;
  const legacy: Record<string, KidsAgeRangeCode> = {
    NEWBORN: "BABY_0_1Y",
    BABY_0_12M: "BABY_0_1Y",
    KIDS_6_8Y: "KIDS_5_8Y",
    KIDS_9_12Y: "KIDS_8_11Y",
    TEEN_13_16Y: "KIDS_11_14Y"
  };
  return legacy[value] ?? null;
}

/**
 * Men's and unisex trousers carry a waist in inches (30 / 32 / 34 …), which is not a UK
 * size and never converts to a letter size. Stored and shown on its own.
 */
export function isWaistSizeLabel(value: string | null | undefined): boolean {
  return /^W\d{2}$/i.test(String(value ?? "").trim());
}

export function waistInchesFrom(value: string | null | undefined): number | null {
  const match = /^W(\d{2})$/i.exec(String(value ?? "").trim());
  const inches = match ? Number(match[1]) : NaN;
  return Number.isFinite(inches) && inches >= 20 && inches <= 60 ? inches : null;
}

export function formatWaistSizeLabel(inches: number | string | null | undefined): string | null {
  const number = Math.round(Number(String(inches ?? "").trim().replace(/^W/i, "")));
  return Number.isFinite(number) && number >= 20 && number <= 60 ? `W${number}` : null;
}

export function formatHeightRange(entry: SizeChartEntry): string {
  return `${entry.heightMinCm}-${entry.heightMaxCm} cm`;
}

export function formatWeightRange(entry: SizeChartEntry): string {
  return `${entry.weightMinKg}-${entry.weightMaxKg} kg`;
}

export function formatAgeRange(entry: SizeChartEntry): string | null {
  return entry.ageMinYears === undefined || entry.ageMaxYears === undefined
    ? null
    : `${entry.ageMinYears}-${entry.ageMaxYears} Years`;
}

/** "L · UK 14" for women, "M · Unisex" for unisex, "M · Kids" for kids. */
export function formatSizeHeadline(entry: SizeChartEntry): string {
  if (entry.fit === "WOMEN") return `${entry.standardSize} · ${entry.ukSize}`;
  if (entry.fit === "MEN") return `${entry.standardSize} · ${entry.ukSize}`;
  return `${entry.standardSize} · ${entry.fit === "KIDS" ? "Kids" : "Unisex"}`;
}

/** "160-170 cm · 58-70 kg" — the one line a shopper reads under the size. */
export function formatSizeRecommendation(entry: SizeChartEntry): string {
  return `${formatHeightRange(entry)} · ${formatWeightRange(entry)}`;
}

export const SIZE_CHART_DISCLAIMER_EN =
  "All size recommendations are for reference only. Actual fit may vary depending on the brand, style and individual body shape.";

export const SIZE_CHART_DISCLAIMER_ZH =
  "尺码建议仅供参考。二手服装来自不同品牌与版型，实际大小可能不同。";

function normalizeFit(value: string | null | undefined): SizeFit | null {
  const fit = String(value ?? "").trim().toUpperCase();
  return isSizeFit(fit) ? fit : null;
}

function normalizeStandardSize(value: string | null | undefined): string {
  const size = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return ({ "2XL": "XXL", "3XL": "XXXL" } as Record<string, string>)[size] ?? size;
}

function ukRangeContains(ukSize: string | null, number: number): boolean {
  const match = /^UK\s*(\d+)(?:-(\d+))?$/i.exec(ukSize ?? "");
  if (!match) return false;
  const min = Number(match[1]);
  const max = match[2] === undefined ? min : Number(match[2]);
  // Women's UK labels move in even steps, so UK 10-12 covers 10 and 12, not 11.
  return number >= min && number <= max && (number - min) % 2 === 0;
}

function entry(
  fit: SizeFit,
  standardSize: AdultStandardSize,
  ukSize: string,
  heightMinCm: number,
  heightMaxCm: number,
  weightMinKg: number,
  weightMaxKg: number
): SizeChartEntry {
  return { fit, standardSize, ukSize, heightMinCm, heightMaxCm, weightMinKg, weightMaxKg };
}

function kids(
  standardSize: KidsStandardSize,
  ageRangeCode: KidsAgeRangeCode,
  ageMinYears: number,
  ageMaxYears: number,
  heightMinCm: number,
  heightMaxCm: number,
  weightMinKg: number,
  weightMaxKg: number
): SizeChartEntry {
  return {
    fit: "KIDS",
    standardSize,
    ukSize: null,
    heightMinCm,
    heightMaxCm,
    weightMinKg,
    weightMaxKg,
    ageMinYears,
    ageMaxYears,
    ageRangeCode
  };
}

/** Categories sized by the chart. Shoes, bags, textiles and accessories are sized elsewhere. */
export const SIZE_CHART_CATEGORIES = [
  "KIDS", "PANTS", "JACKETS", "DRESSES", "LADY_TOPS", "SHIRTS", "TSHIRTS", "SHORT", "TWO_PIECE"
] as const;

const PANTS_CATEGORIES = ["PANTS", "SHORT"];

export function usesSizeChart(category: string | null | undefined): boolean {
  return (SIZE_CHART_CATEGORIES as readonly string[]).includes(String(category ?? "").trim().toUpperCase());
}

/**
 * Men's and unisex trousers carry a waist in inches, which the chart never converts to a
 * letter size. Women's trousers stay on the UK ladder.
 */
export function usesWaistSizing(category: string | null | undefined, fit: string | null | undefined): boolean {
  const audience = String(fit ?? "").trim().toUpperCase();
  return PANTS_CATEGORIES.includes(String(category ?? "").trim().toUpperCase()) &&
    (audience === "MEN" || audience === "UNISEX");
}

export type ResolvedGarmentSize = {
  /** Stored as Product.finalSizeLabel: a chart size, or "W32" for waist-sized trousers. */
  sizeLabel: string;
  ukSize: string | null;
  kidsAgeRange: KidsAgeRangeCode | null;
  waistInches: number | null;
  entry: SizeChartEntry | null;
};

/**
 * Turn a confirmed Fit + size label into every fact the storefront shows. Returns null when
 * the label does not belong to that Fit, so an unresolved size is never silently published.
 */
export function resolveGarmentSize(
  fit: string | null | undefined,
  category: string | null | undefined,
  sizeLabel: string | null | undefined
): ResolvedGarmentSize | null {
  if (usesWaistSizing(category, fit)) {
    const waist = formatWaistSizeLabel(sizeLabel);
    const waistInches = waistInchesFrom(waist);
    return waistInches === null
      ? null
      : { sizeLabel: waist!, ukSize: null, kidsAgeRange: null, waistInches, entry: null };
  }
  const entry = sizeChartEntry(fit, sizeLabel);
  return entry
    ? {
        sizeLabel: entry.standardSize,
        ukSize: entry.ukSize,
        kidsAgeRange: entry.ageRangeCode ?? null,
        waistInches: null,
        entry
      }
    : null;
}
