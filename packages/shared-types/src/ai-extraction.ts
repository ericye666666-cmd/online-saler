export const AI_JOB_STATUSES = [
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED"
] as const;

export type AIJobStatus = (typeof AI_JOB_STATUSES)[number];

export const AI_PRODUCT_CATEGORIES = [
  "TOP",
  "SHIRT",
  "TROUSER",
  "SKIRT",
  "DRESS",
  "JACKET",
  "SWEATER",
  "SHORTS",
  "KIDS_WEAR",
  "OTHER"
] as const;

export type AIProductCategory = (typeof AI_PRODUCT_CATEGORIES)[number];

export const AI_COLORS = [
  "BLACK",
  "WHITE",
  "GREY",
  "BROWN",
  "BEIGE",
  "RED",
  "ORANGE",
  "YELLOW",
  "GREEN",
  "BLUE",
  "NAVY",
  "PURPLE",
  "PINK",
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

export const AI_EXTRACTED_FIELDS = [
  "category",
  "primaryColor",
  "pattern",
  "sleeveType",
  "brandLabel",
  "sizeLabel",
  "title"
] as const;

export type AIExtractedField = (typeof AI_EXTRACTED_FIELDS)[number];

export interface AIFieldValue<T> {
  value: T | null;
  confidence: number;
  evidenceImageIds?: string[];
}

export interface AIExtractionNormalizedOutput {
  category: AIFieldValue<AIProductCategory>;
  primaryColor: AIFieldValue<AIColor>;
  pattern: AIFieldValue<AIPattern>;
  sleeveType: AIFieldValue<AISleeveType>;
  brandLabel: AIFieldValue<string>;
  sizeLabel: AIFieldValue<string>;
  title: AIFieldValue<string>;
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
  const alwaysConfirm: AIExtractedField[] = ["brandLabel", "sizeLabel"];
  return alwaysConfirm.includes(field) || confidence < 0.85;
};
