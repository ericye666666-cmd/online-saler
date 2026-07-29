import {
  AI_COLORS,
  AI_PATTERNS,
  AI_PRODUCT_CATEGORIES,
  AI_SLEEVE_TYPES,
  type AIColor,
  type AIExtractionNormalizedOutput,
  type AIFieldValue,
  type AIPattern,
  type AIProductCategory,
  type AISleeveType
} from "@online-saler/shared-types";

type FieldLike = {
  value?: unknown;
  confidence?: unknown;
};

type RawExtraction = Record<string, unknown>;

const CATEGORY_SET = new Set<string>(AI_PRODUCT_CATEGORIES);
const COLOR_SET = new Set<string>(AI_COLORS);
const PATTERN_SET = new Set<string>(AI_PATTERNS);
const SLEEVE_SET = new Set<string>(AI_SLEEVE_TYPES);

export function normalizeOpenAIVisionOutput(
  raw: unknown,
  evidenceImageIds: string[]
): AIExtractionNormalizedOutput {
  const record = asRecord(raw);

  return {
    category: enumField<AIProductCategory>(record, ["category"], CATEGORY_SET, "OTHER", evidenceImageIds),
    primaryColor: enumField<AIColor>(record, ["primaryColor", "color"], COLOR_SET, "OTHER", evidenceImageIds),
    pattern: enumField<AIPattern>(record, ["pattern"], PATTERN_SET, "OTHER", evidenceImageIds),
    sleeveType: enumField<AISleeveType>(record, ["sleeveType", "sleeve"], SLEEVE_SET, "OTHER", evidenceImageIds),
    brandLabel: stringField(record, ["brandLabel", "brand"], evidenceImageIds),
    sizeLabel: stringField(record, ["sizeLabel", "size"], evidenceImageIds),
    title: stringField(record, ["title"], evidenceImageIds)
  };
}

function enumField<T extends string>(
  record: RawExtraction,
  keys: string[],
  allowed: Set<string>,
  fallback: T,
  evidenceImageIds: string[]
): AIFieldValue<T> {
  const field = firstField(record, keys);
  const rawValue = String(field.value ?? "").trim().toUpperCase().replaceAll(" ", "_").replaceAll("-", "_");
  const value = allowed.has(rawValue) ? (rawValue as T) : fallback;
  return { value, confidence: confidence(field.confidence), evidenceImageIds };
}

function stringField(record: RawExtraction, keys: string[], evidenceImageIds: string[]): AIFieldValue<string> {
  const field = firstField(record, keys);
  const value = typeof field.value === "string" ? field.value.trim() : "";
  return { value: value || null, confidence: confidence(field.confidence), evidenceImageIds };
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
