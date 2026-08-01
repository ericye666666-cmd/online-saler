import {
  AI_AUDIENCES,
  AI_COLORS,
  AI_KIDS_AGE_RANGES,
  AI_PATTERNS,
  AI_PRODUCT_CATEGORIES,
  AI_SLEEVE_TYPES,
  PRODUCT_SUBCATEGORY_OPTIONS,
  type AIAudience,
  type AIColor,
  type AIExtractionNormalizedOutput,
  type AIFieldValue,
  type AIKidsAgeRange,
  type AIPattern,
  type AIProductCategory,
  type AISleeveType,
  type ProductSubcategoryOption
} from "@online-saler/shared-types";

type FieldLike = {
  value?: unknown;
  confidence?: unknown;
};

type RawExtraction = Record<string, unknown>;

export type RuntimeProductTaxonomy = {
  categories?: string[];
  subcategories?: string[];
  colors?: string[];
};

const CATEGORY_SET = new Set<string>(AI_PRODUCT_CATEGORIES);
const SUBCATEGORY_SET = new Set<string>(PRODUCT_SUBCATEGORY_OPTIONS);
const COLOR_SET = new Set<string>(AI_COLORS);
const AUDIENCE_SET = new Set<string>(AI_AUDIENCES);
const KIDS_AGE_SET = new Set<string>(AI_KIDS_AGE_RANGES);
const PATTERN_SET = new Set<string>(AI_PATTERNS);
const SLEEVE_SET = new Set<string>(AI_SLEEVE_TYPES);

const CATEGORY_ALIASES: Record<string, AIProductCategory> = {
  TOP: "LADY_TOPS",
  SHIRT: "SHIRTS",
  TROUSER: "PANTS",
  TROUSERS: "PANTS",
  SKIRT: "DRESSES",
  DRESS: "DRESSES",
  JACKET: "JACKETS",
  SWEATER: "JACKETS",
  SHORTS: "SHORT",
  KIDS_WEAR: "KIDS",
  T_SHIRT: "TSHIRTS",
  TSHIRT: "TSHIRTS"
};

const SUBCATEGORY_ALIASES: Record<string, ProductSubcategoryOption> = {
  KIDS_DRESSES: "KIDS_DRESS",
  KIDS_TOP: "KIDS_JACKET_TOP",
  KIDS_JACKET: "KIDS_JACKET_TOP",
  KIDS_TSHIRT: "KIDS_JACKET_TOP",
  KIDS_T_SHIRT: "KIDS_JACKET_TOP",
  BABY: "NEWBORN",
  MEN_JEAN: "MEN_JEANS",
  LADIES_PANTS: "LADIES_PANTS_MIX",
  WOMEN_PANTS: "LADIES_PANTS_MIX",
  SWEATPANTS: "SWEAT_PANTS",
  OFFICIAL_PANT: "OFFICIAL_PANTS",
  MEN_JACKET: "MEN_JACKETS",
  LADIES_JACKET: "LADIES_JACKETS",
  WOMEN_JACKETS: "LADIES_JACKETS",
  WOMEN_JACKET: "LADIES_JACKETS",
  DENIM_JACKET: "DENIM_JACKETS",
  SHORT_DRESS: "SHORT_DRESSES_SKIRTS",
  SKIRT: "SHORT_DRESSES_SKIRTS",
  SHORT_SHIRT: "SHORT_SHIRTS",
  LONG_SHIRT: "LONG_SHIRTS",
  T_SHIRT: "TSHIRT",
  TSHIRTS: "TSHIRT",
  SHORTS: "SHORT_PANTS",
  TWO_PIECE: "LONG_TWO_PIECE",
  MEN_SNEAKERS: "MEN_SPORT_SHOES",
  WOMEN_SHOES: "LADIES_SHOES",
  WOMEN_BAGS: "LADIES_BAGS",
  CAP: "HATS_CAPS",
  HAT: "HATS_CAPS",
  SCARF: "SCARFS",
  BODY_SHAPER: "BODY_SHAPERS",
  INNER_WEAR: "INNER_WARES",
  BLANKET: "LIGHT_BLANKETS"
};

const AUDIENCE_ALIASES: Record<string, AIAudience> = {
  WOMAN: "WOMEN",
  FEMALE: "WOMEN",
  LADY: "WOMEN",
  LADIES: "WOMEN",
  MAN: "MEN",
  MALE: "MEN",
  MENS: "MEN",
  MEN_S: "MEN",
  CHILD: "KIDS",
  CHILDREN: "KIDS",
  TODDLER: "KIDS",
  BABY: "KIDS",
  BOY: "KIDS",
  GIRL: "KIDS",
  NEUTRAL: "UNISEX"
};

export function normalizeOpenAIVisionOutput(
  raw: unknown,
  evidenceImageIds: string[],
  runtimeTaxonomy: RuntimeProductTaxonomy = {}
): AIExtractionNormalizedOutput {
  const record = asRecord(raw);
  const categorySet = runtimeSet(runtimeTaxonomy.categories, CATEGORY_SET);
  const subcategorySet = runtimeSet(runtimeTaxonomy.subcategories, SUBCATEGORY_SET);
  const colorSet = runtimeSet(runtimeTaxonomy.colors, COLOR_SET);

  return {
    category: enumField<AIProductCategory>(record, ["category"], categorySet, "OTHER", evidenceImageIds, CATEGORY_ALIASES),
    subcategory: enumField<ProductSubcategoryOption>(
      record,
      ["subcategory", "subCategory", "itemType", "item_type"],
      subcategorySet,
      "OTHER",
      evidenceImageIds,
      SUBCATEGORY_ALIASES
    ),
    primaryColor: enumField<AIColor>(record, ["primaryColor", "color"], colorSet, "OTHER", evidenceImageIds),
    audience: enumField<AIAudience>(
      record,
      ["audience", "gender", "customerGender", "customer_gender"],
      AUDIENCE_SET,
      "UNISEX",
      evidenceImageIds,
      AUDIENCE_ALIASES
    ),
    kidsAgeRange: enumField<AIKidsAgeRange>(
      record,
      ["kidsAgeRange", "kids_age_range", "childAgeRange", "child_age_range", "kidsAge"],
      KIDS_AGE_SET,
      "NOT_APPLICABLE",
      evidenceImageIds
    ),
    pattern: enumField<AIPattern>(record, ["pattern"], PATTERN_SET, "OTHER", evidenceImageIds),
    sleeveType: enumField<AISleeveType>(record, ["sleeveType", "sleeve"], SLEEVE_SET, "OTHER", evidenceImageIds),
    brandLabel: stringField(record, ["brandLabel", "brand"], evidenceImageIds),
    sizeLabel: stringField(record, ["sizeLabel", "size"], evidenceImageIds),
    title: stringField(record, ["title"], evidenceImageIds),
    lengthCm: numberField(record, ["lengthCm", "length_cm", "bodyLengthCm"], evidenceImageIds),
    chestWidthCm: numberField(record, ["chestWidthCm", "chest_width_cm", "pitToPitCm"], evidenceImageIds),
    shoulderWidthCm: numberField(record, ["shoulderWidthCm", "shoulder_width_cm"], evidenceImageIds),
    sleeveLengthCm: numberField(record, ["sleeveLengthCm", "sleeve_length_cm"], evidenceImageIds),
    waistCm: numberField(record, ["waistCm", "waist_cm", "waistWidthCm"], evidenceImageIds),
    hipCm: numberField(record, ["hipCm", "hip_cm", "hipWidthCm"], evidenceImageIds),
    thighWidthCm: numberField(record, ["thighWidthCm", "thigh_width_cm"], evidenceImageIds),
    legOpeningCm: numberField(record, ["legOpeningCm", "leg_opening_cm"], evidenceImageIds),
    inseamCm: numberField(record, ["inseamCm", "inseam_cm"], evidenceImageIds)
  };
}

function runtimeSet(values: string[] | undefined, fallback: Set<string>): Set<string> {
  return values?.length ? new Set(values) : fallback;
}

function enumField<T extends string>(
  record: RawExtraction,
  keys: string[],
  allowed: Set<string>,
  fallback: T,
  evidenceImageIds: string[],
  aliases: Partial<Record<string, T>> = {}
): AIFieldValue<T> {
  const field = firstField(record, keys);
  const rawValue = String(field.value ?? "").trim().toUpperCase().replaceAll(" ", "_").replaceAll("-", "_");
  const normalizedValue = aliases[rawValue] ?? rawValue;
  const value = allowed.has(normalizedValue) ? (normalizedValue as T) : fallback;
  return { value, confidence: confidence(field.confidence), evidenceImageIds };
}

function stringField(record: RawExtraction, keys: string[], evidenceImageIds: string[]): AIFieldValue<string> {
  const field = firstField(record, keys);
  const value = typeof field.value === "string" ? field.value.trim() : "";
  return { value: value || null, confidence: confidence(field.confidence), evidenceImageIds };
}

function numberField(record: RawExtraction, keys: string[], evidenceImageIds: string[]): AIFieldValue<number> {
  const field = firstField(record, keys);
  const numeric = typeof field.value === "number" ? field.value : Number(field.value);
  const value = Number.isFinite(numeric) && numeric > 0 && numeric <= 250
    ? Math.round(numeric * 10) / 10
    : null;
  return { value, confidence: confidence(field.confidence), evidenceImageIds };
}

function firstField(record: RawExtraction, keys: string[]): FieldLike {
  for (const key of keys) {
    const value = record[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as FieldLike;
    }
    if (value !== undefined) {
      return { value, confidence: 0.5 };
    }
  }
  return { value: null, confidence: 0.4 };
}

function asRecord(value: unknown): RawExtraction {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawExtraction) : {};
}

function confidence(value: unknown): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return 0.5;
  return Math.max(0, Math.min(1, numberValue));
}
