import { BadRequestException } from "@nestjs/common";

export const PRODUCT_DETAIL_PROMPT_VERSION = "product-detail-copy-v1";

export type ProductDetailCopy = {
  title: string;
  sellingPoints: [string, string, string];
  shortDescription: string;
  fitSummary: string;
  measurementSummary: string;
  conditionSummary: string;
  styleTags: string[];
  missingInformation: string[];
  warnings: string[];
};

export type ProductDetailFacts = {
  productId: string;
  sourceDataVersion: number;
  title: string | null;
  category: string | null;
  subcategory: string | null;
  gender: string | null;
  color: string | null;
  pattern: string | null;
  sleeveType: string | null;
  brand: string | null;
  tagSize: string | null;
  platformSize: string | null;
  conditionGrade: string | null;
  fitType: string | null;
  stretchLevel: string | null;
  fabricWeight: string | null;
  material: string | null;
  tags: string[];
  priceKsh: number | null;
  measurementsCm: Record<string, number>;
  defects: Array<{
    type: string;
    severity: string;
    description: string;
    customerSafeDescription: string | null;
  }>;
  fitRecommendation: {
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
    expectedFit: string | null;
    confidence: number | null;
    basis: unknown;
    warnings: unknown;
    disclaimer: string | null;
  };
};

export const PRODUCT_DETAIL_COPY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "sellingPoints",
    "shortDescription",
    "fitSummary",
    "measurementSummary",
    "conditionSummary",
    "styleTags",
    "missingInformation",
    "warnings"
  ],
  properties: {
    title: { type: "string", maxLength: 120 },
    sellingPoints: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string", maxLength: 160 }
    },
    shortDescription: { type: "string", maxLength: 500 },
    fitSummary: { type: "string", maxLength: 300 },
    measurementSummary: { type: "string", maxLength: 400 },
    conditionSummary: { type: "string", maxLength: 300 },
    styleTags: {
      type: "array",
      maxItems: 8,
      items: { type: "string", maxLength: 40 }
    },
    missingInformation: {
      type: "array",
      maxItems: 10,
      items: { type: "string", maxLength: 120 }
    },
    warnings: {
      type: "array",
      maxItems: 10,
      items: { type: "string", maxLength: 160 }
    }
  }
} as const;

export function normalizeProductDetailCopy(value: unknown): ProductDetailCopy {
  if (!isRecord(value)) throw new BadRequestException("Product detail output must be an object");

  const sellingPoints = stringArray(value.sellingPoints, "sellingPoints", 3);
  if (sellingPoints.length !== 3 || sellingPoints.some((item) => !item)) {
    throw new BadRequestException("Product detail output must contain exactly three selling points");
  }

  return {
    title: requiredString(value.title, "title", 120),
    sellingPoints: [sellingPoints[0]!, sellingPoints[1]!, sellingPoints[2]!],
    shortDescription: requiredString(value.shortDescription, "shortDescription", 500),
    fitSummary: requiredString(value.fitSummary, "fitSummary", 300),
    measurementSummary: requiredString(value.measurementSummary, "measurementSummary", 400),
    conditionSummary: requiredString(value.conditionSummary, "conditionSummary", 300),
    styleTags: stringArray(value.styleTags, "styleTags", 8, 40),
    missingInformation: stringArray(value.missingInformation, "missingInformation", 10, 120),
    warnings: stringArray(value.warnings, "warnings", 10, 160)
  };
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException(`Product detail output ${field} must be a non-empty string`);
  }
  return value.trim().slice(0, maxLength);
}

function stringArray(value: unknown, field: string, maxItems: number, maxLength = 160): string[] {
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string")) {
    throw new BadRequestException(`Product detail output ${field} must be a string array`);
  }
  return value.map((item) => item.trim().slice(0, maxLength)).filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
