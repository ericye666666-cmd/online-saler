export const AI_JOB_STATUSES = [
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED"
] as const;

export const PRODUCT_AI_PROMPT_VERSION = "product-fit-tags-v6";

export type AIJobStatus = (typeof AI_JOB_STATUSES)[number];

export const PRODUCT_CATEGORY_OPTIONS = [
  "KIDS",
  "PANTS",
  "JACKETS",
  "DRESSES",
  "LADY_TOPS",
  "SHIRTS",
  "TSHIRTS",
  "SHORT",
  "TWO_PIECE",
  "SHOES",
  "BAG",
  "OTHERS",
  "TEXTILE",
  "OTHER"
] as const;

export type ProductCategoryOption = (typeof PRODUCT_CATEGORY_OPTIONS)[number];

export const PRODUCT_SUBCATEGORY_OPTIONS = [
  "KIDS_DRESS",
  "KIDS_JACKET_TOP",
  "KIDS_TOPS",
  "KIDS_HOODIES",
  "KIDS_SKIRTS",
  "KIDS_PANTS",
  "NEWBORN",
  "MEN_JEANS",
  "WOMEN_JEANS",
  "LADIES_PANTS_MIX",
  "SWEAT_PANTS",
  "CARGO_PANTS",
  "OFFICIAL_PANTS",
  "LEGGINGS",
  "WIDE_LEG_PANTS",
  "MEN_JACKETS",
  "THICK_VEST",
  "LADIES_JACKETS",
  "UNISEX_JACKETS",
  "HOODIES",
  "SWEATSHIRTS",
  "DENIM_JACKETS",
  "BLAZERS",
  "PUFFER_JACKETS",
  "WINDBREAKERS",
  "RAIN_JACKETS",
  "COATS",
  "CARDIGANS",
  "LONG_DRESSES",
  "MIDI_DRESSES",
  "MINI_DRESSES",
  "MAXI_SKIRTS",
  "MIDI_SKIRTS",
  "MINI_SKIRTS",
  "JUMPSUITS",
  "SHORT_DRESSES_SKIRTS",
  "OFFICIAL_TOPS",
  "FANCY_TOPS",
  "BLOUSES",
  "TANK_TOPS",
  "CROP_TOPS",
  "SWEATERS",
  "SHORT_SHIRTS",
  "LONG_SHIRTS",
  "POLO_SHIRTS",
  "TSHIRT",
  "BASIC_TSHIRT",
  "GRAPHIC_TSHIRT",
  "SHORT_PANTS",
  "DENIM_SHORTS",
  "CARGO_SHORTS",
  "SPORTS_SHORTS",
  "LONG_TWO_PIECE",
  "SHORT_TWO_PIECE",
  "MEN_SPORT_SHOES",
  "MEN_SHOES",
  "LADIES_SHOES",
  "KIDS_SHOES",
  "OFFICIAL_SHOES",
  "LADIES_BAGS",
  "SCHOOL_BAGS",
  "PACKAGE_BAGS",
  "HATS_CAPS",
  "SCARFS",
  "BODY_SHAPERS",
  "INNER_WARES",
  "BEDSHEETS",
  "LIGHT_BLANKETS",
  "OTHER"
] as const;

export type ProductSubcategoryOption = (typeof PRODUCT_SUBCATEGORY_OPTIONS)[number];

export const PRODUCT_SUBCATEGORIES_BY_CATEGORY: Record<
  ProductCategoryOption,
  readonly ProductSubcategoryOption[]
> = {
  KIDS: ["KIDS_DRESS", "KIDS_JACKET_TOP", "KIDS_TOPS", "KIDS_HOODIES", "KIDS_SKIRTS", "KIDS_PANTS", "NEWBORN", "OTHER"],
  PANTS: ["MEN_JEANS", "WOMEN_JEANS", "LADIES_PANTS_MIX", "SWEAT_PANTS", "CARGO_PANTS", "OFFICIAL_PANTS", "LEGGINGS", "WIDE_LEG_PANTS", "OTHER"],
  JACKETS: ["MEN_JACKETS", "THICK_VEST", "LADIES_JACKETS", "UNISEX_JACKETS", "HOODIES", "SWEATSHIRTS", "DENIM_JACKETS", "BLAZERS", "PUFFER_JACKETS", "WINDBREAKERS", "RAIN_JACKETS", "COATS", "CARDIGANS", "OTHER"],
  DRESSES: ["LONG_DRESSES", "MIDI_DRESSES", "MINI_DRESSES", "MAXI_SKIRTS", "MIDI_SKIRTS", "MINI_SKIRTS", "JUMPSUITS", "SHORT_DRESSES_SKIRTS", "OTHER"],
  LADY_TOPS: ["OFFICIAL_TOPS", "FANCY_TOPS", "BLOUSES", "TANK_TOPS", "CROP_TOPS", "SWEATERS", "OTHER"],
  SHIRTS: ["SHORT_SHIRTS", "LONG_SHIRTS", "POLO_SHIRTS", "OTHER"],
  TSHIRTS: ["TSHIRT", "BASIC_TSHIRT", "GRAPHIC_TSHIRT", "OTHER"],
  SHORT: ["SHORT_PANTS", "DENIM_SHORTS", "CARGO_SHORTS", "SPORTS_SHORTS", "OTHER"],
  TWO_PIECE: ["LONG_TWO_PIECE", "SHORT_TWO_PIECE", "OTHER"],
  SHOES: ["MEN_SPORT_SHOES", "MEN_SHOES", "LADIES_SHOES", "KIDS_SHOES", "OFFICIAL_SHOES", "OTHER"],
  BAG: ["LADIES_BAGS", "SCHOOL_BAGS", "PACKAGE_BAGS", "OTHER"],
  OTHERS: ["HATS_CAPS", "SCARFS", "BODY_SHAPERS", "INNER_WARES", "OTHER"],
  TEXTILE: ["BEDSHEETS", "LIGHT_BLANKETS", "OTHER"],
  OTHER: ["OTHER"]
};

export const AI_PRODUCT_CATEGORIES = PRODUCT_CATEGORY_OPTIONS;

export type AIProductCategory = (typeof AI_PRODUCT_CATEGORIES)[number];

export const AI_COLORS = [
  "BLACK",
  "WHITE",
  "OFF_WHITE",
  "GREY",
  "BROWN",
  "BEIGE",
  "CREAM",
  "TAN",
  "KHAKI",
  "RED",
  "MAROON",
  "BURGUNDY",
  "ORANGE",
  "CORAL",
  "PEACH",
  "YELLOW",
  "MUSTARD",
  "GREEN",
  "LIGHT_GREEN",
  "DARK_GREEN",
  "OLIVE",
  "BLUE",
  "LIGHT_BLUE",
  "DARK_BLUE",
  "NAVY",
  "DENIM",
  "TEAL",
  "TURQUOISE",
  "PURPLE",
  "LILAC",
  "PINK",
  "GOLD",
  "SILVER",
  "MULTICOLOR",
  "OTHER"
] as const;

export type AIColor = (typeof AI_COLORS)[number];

export const AI_PATTERNS = [
  "SOLID",
  "STRIPED",
  "CHECKED",
  "FLORAL",
  "GRAPHIC",
  "POLKA_DOT",
  "ANIMAL_PRINT",
  "ABSTRACT",
  "OTHER"
] as const;

export type AIPattern = (typeof AI_PATTERNS)[number];

export const AI_SLEEVE_TYPES = [
  "SLEEVELESS",
  "SHORT",
  "THREE_QUARTER",
  "LONG",
  "NOT_APPLICABLE",
  "OTHER"
] as const;

export type AISleeveType = (typeof AI_SLEEVE_TYPES)[number];

export const PRODUCT_FIT_TYPES = [
  "SLIM",
  "REGULAR",
  "RELAXED",
  "OVERSIZED",
  "UNKNOWN"
] as const;

export type ProductFitTypeValue = (typeof PRODUCT_FIT_TYPES)[number];

export const PRODUCT_STRETCH_LEVELS = [
  "NONE",
  "LOW",
  "MEDIUM",
  "HIGH",
  "UNKNOWN"
] as const;

export type ProductStretchLevelValue = (typeof PRODUCT_STRETCH_LEVELS)[number];

export const PRODUCT_FABRIC_WEIGHTS = [
  "LIGHT",
  "REGULAR",
  "HEAVY",
  "UNKNOWN"
] as const;

export type ProductFabricWeightValue = (typeof PRODUCT_FABRIC_WEIGHTS)[number];

export const PRODUCT_MATERIAL_OPTIONS = [
  "COTTON",
  "COTTON_BLEND",
  "POLYESTER",
  "DENIM",
  "WOOL",
  "WOOL_BLEND",
  "LINEN",
  "VISCOSE_RAYON",
  "NYLON",
  "LEATHER",
  "FAUX_LEATHER",
  "SILK",
  "SATIN",
  "FLEECE",
  "VELVET",
  "KNIT",
  "ACRYLIC",
  "SPANDEX_BLEND",
  "LACE",
  "CHIFFON",
  "CANVAS",
  "CORDUROY",
  "MIXED",
  "UNKNOWN",
  "OTHER"
] as const;

export type ProductMaterialOption = (typeof PRODUCT_MATERIAL_OPTIONS)[number];

export const PRODUCT_TAG_OPTIONS = [
  "HOODED",
  "ZIP_FRONT",
  "BUTTON_FRONT",
  "PULLOVER",
  "COLLARED",
  "V_NECK",
  "CREW_NECK",
  "TURTLENECK",
  "POCKETS",
  "CARGO_POCKETS",
  "LINED",
  "REVERSIBLE",
  "WATER_RESISTANT",
  "INSULATED",
  "LIGHTWEIGHT",
  "HIGH_WAIST",
  "ELASTIC_WAIST",
  "DRAWSTRING_WAIST",
  "STRAIGHT_LEG",
  "WIDE_LEG",
  "SKINNY_FIT",
  "FLARED",
  "CROPPED",
  "MIDI_LENGTH",
  "MAXI_LENGTH",
  "MINI_LENGTH",
  "GRAPHIC_PRINT",
  "EMBROIDERED",
  "BEADED",
  "CASUAL",
  "FORMAL",
  "SPORTS",
  "OUTDOOR",
  "MATERNITY",
  "DROP_SHOULDER",
  "RAGLAN_SLEEVE",
  "RIBBED",
  "BASE_LAYER",
  "THERMAL"
] as const;

export type ProductTagOption = (typeof PRODUCT_TAG_OPTIONS)[number];

export const AI_AUDIENCES = [
  "WOMEN",
  "MEN",
  "KIDS",
  "UNISEX"
] as const;

export type AIAudience = (typeof AI_AUDIENCES)[number];

export const AI_KIDS_AGE_RANGES = [
  "NOT_APPLICABLE",
  "NEWBORN",
  "BABY_0_12M",
  "TODDLER_1_3Y",
  "PRESCHOOL_3_5Y",
  "KIDS_6_8Y",
  "KIDS_9_12Y",
  "TEEN_13_16Y"
] as const;

export type AIKidsAgeRange = (typeof AI_KIDS_AGE_RANGES)[number];

export const AI_EXTRACTED_FIELDS = [
  "category",
  "subcategory",
  "primaryColor",
  "audience",
  "kidsAgeRange",
  "pattern",
  "sleeveType",
  "fitType",
  "stretchLevel",
  "fabricWeight",
  "material",
  "tags",
  "brandLabel",
  "sizeLabel",
  "ukSizeLabel",
  "title",
  "lengthCm",
  "chestWidthCm",
  "shoulderWidthCm",
  "sleeveLengthCm",
  "waistCm",
  "hipCm",
  "thighWidthCm",
  "legOpeningCm",
  "inseamCm"
] as const;

export type AIExtractedField = (typeof AI_EXTRACTED_FIELDS)[number];

export interface AIFieldValue<T> {
  value: T | null;
  confidence: number;
  evidenceImageIds?: string[];
}

export interface AIExtractionNormalizedOutput {
  category: AIFieldValue<AIProductCategory>;
  subcategory: AIFieldValue<ProductSubcategoryOption>;
  primaryColor: AIFieldValue<AIColor>;
  audience: AIFieldValue<AIAudience>;
  kidsAgeRange: AIFieldValue<AIKidsAgeRange>;
  pattern: AIFieldValue<AIPattern>;
  sleeveType: AIFieldValue<AISleeveType>;
  fitType: AIFieldValue<ProductFitTypeValue>;
  stretchLevel: AIFieldValue<ProductStretchLevelValue>;
  fabricWeight: AIFieldValue<ProductFabricWeightValue>;
  material: AIFieldValue<ProductMaterialOption>;
  tags: AIFieldValue<ProductTagOption[]>;
  brandLabel: AIFieldValue<string>;
  sizeLabel: AIFieldValue<string>;
  ukSizeLabel: AIFieldValue<string>;
  title: AIFieldValue<string>;
  lengthCm: AIFieldValue<number>;
  chestWidthCm: AIFieldValue<number>;
  shoulderWidthCm: AIFieldValue<number>;
  sleeveLengthCm: AIFieldValue<number>;
  waistCm: AIFieldValue<number>;
  hipCm: AIFieldValue<number>;
  thighWidthCm: AIFieldValue<number>;
  legOpeningCm: AIFieldValue<number>;
  inseamCm: AIFieldValue<number>;
}

export interface AIExtractionRequest {
  productId: string;
  imageIds: string[];
  promptVersion: string;
}

export interface AIExtractionResult {
  extractionId: string;
  productId: string;
  status: AIJobStatus;
  provider: string;
  model: string;
  promptVersion: string;
  normalizedOutput?: AIExtractionNormalizedOutput;
  rawOutput?: unknown;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostMicros?: number;
  failureCode?: string;
  failureReason?: string;
  createdAt: string;
  completedAt?: string;
}

export const confidenceBand = (confidence: number): "LOW" | "MEDIUM" | "HIGH" => {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new RangeError("AI confidence must be between 0 and 1");
  }

  if (confidence < 0.6) return "LOW";
  if (confidence < 0.85) return "MEDIUM";
  return "HIGH";
};

export const requiresHumanConfirmation = (field: AIExtractedField, confidence: number): boolean => {
  const alwaysConfirm: AIExtractedField[] = [
    "brandLabel",
    "material",
    "fitType",
    "stretchLevel",
    "fabricWeight",
    "tags",
    "sizeLabel",
    "ukSizeLabel",
    "lengthCm",
    "chestWidthCm",
    "shoulderWidthCm",
    "sleeveLengthCm",
    "waistCm",
    "hipCm",
    "thighWidthCm",
    "legOpeningCm",
    "inseamCm"
  ];
  return alwaysConfirm.includes(field) || confidence < 0.85;
};

export const AI_MEASUREMENT_FIELDS = [
  { field: "lengthCm", measurementType: "LENGTH" },
  { field: "chestWidthCm", measurementType: "CHEST_WIDTH" },
  { field: "shoulderWidthCm", measurementType: "SHOULDER_WIDTH" },
  { field: "sleeveLengthCm", measurementType: "SLEEVE_LENGTH" },
  { field: "waistCm", measurementType: "WAIST" },
  { field: "hipCm", measurementType: "HIP" },
  { field: "thighWidthCm", measurementType: "THIGH_WIDTH" },
  { field: "legOpeningCm", measurementType: "LEG_OPENING" },
  { field: "inseamCm", measurementType: "INSEAM" }
] as const satisfies ReadonlyArray<{ field: AIExtractedField; measurementType: string }>;
