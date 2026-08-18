import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { prisma } from "@online-saler/database";
import {
  AI_AUDIENCES,
  AI_KIDS_AGE_RANGES,
  AI_PATTERNS,
  AI_SLEEVE_TYPES,
  PRODUCT_FABRIC_WEIGHTS,
  PRODUCT_FIT_TYPES,
  PRODUCT_STRETCH_LEVELS,
  type AIExtractionRequest
} from "@online-saler/shared-types";
import { ProductImageStorageService } from "../product/product-image-storage.service";
import { activeTaxonomyCodes, loadProductTaxonomy } from "../product/product-taxonomy";
import type { AIProvider, AIProviderResult } from "./ai-provider";
import { LightweightMeasurementBoardProvider } from "./lightweight-measurement-board.provider";
import { normalizeOpenAIVisionOutput } from "./openai-vision-normalizer";

type ResponsesApiPayload = Record<string, any>;

const RESPONSES_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4o-mini";
export const HOODED_GARMENT_MEASUREMENT_RULES = [
  "For hoodies and hooded jackets, the hood, collar and drawstrings are never part of shoulderWidthCm or lengthCm. Find the seam where the hood joins the body, place both shoulder endpoints below the hood, and start body length at the shoulder high point beside that neck seam.",
] as const;
export const SHOULDER_WIDTH_MEASUREMENT_RULES = [
  "shoulderWidthCm is the full straight-line flat width from the left sleeve-attachment shoulder seam endpoint to the right sleeve-attachment shoulder seam endpoint.",
  "Never measure from the collar or neckline to one shoulder. That is a one-side shoulder length, not shoulderWidthCm.",
  "If a dropped shoulder, raglan sleeve or hidden seam makes either sleeve-attachment endpoint uncertain, return null instead of guessing shoulderWidthCm."
] as const;
export const MEASUREMENT_GEOMETRY_RULES = [
  "measurementGeometry must locate the visible board and garment endpoints before estimating centimeters.",
  "Return measurementGeometry as { boardCorners: { value: { topLeft, topRight, bottomRight, bottomLeft } | null, confidence }, lines }.",
  "Each point is { x, y } in image-relative percentages from 0 to 100. The image top-left is (0,0) and bottom-right is (100,100).",
  "Use the four printed calibration marks together with the outer ruler intersections to return the OUTER corners of the complete 120 cm by 160 cm board, in top-left, top-right, bottom-right, bottom-left order. Do not return garment corners or the inner ends of ruler marks.",
  "measurementGeometry.lines contains lengthCm, chestWidthCm, shoulderWidthCm, sleeveLengthCm, waistCm, hipCm, thighWidthCm, legOpeningCm and inseamCm. Each line is { value: { start, end } | null, confidence } using the same image-relative point format.",
  "Only return a line when both garment endpoints are visible. Apply the same measurement definitions to the line endpoints and centimeter field. For shoulderWidthCm the line must span both sleeve-attachment shoulder seams; never start at the collar.",
  "Use null when the ruler, garment endpoint, or full board is not clear enough. Do not guess a missing measurement."
] as const;
export const PRODUCT_MATERIAL_TAG_RULES = [
  "tags.value must be an array with 2 to 8 unique enum values when at least two visible construction, silhouette, use-case or styling facts are clear. Return an empty array only when no tag is supported by the images.",
  "For material, prefer the care label. Without a readable label, use only an unmistakable visual material such as DENIM, LEATHER, FLEECE, KNIT, LACE or CORDUROY; otherwise use UNKNOWN.",
  "Estimate fitType, stretchLevel and fabricWeight conservatively from the visible construction. Use UNKNOWN when the photos do not support the value.",
  "Do not claim WATER_RESISTANT, INSULATED, REVERSIBLE, THERMAL or an exact fiber unless visible text or construction supports it."
] as const;
export const PRODUCT_AUDIENCE_TITLE_RULES = [
  "Use MEN or WOMEN only when a readable label explicitly identifies the range or the garment has unmistakably gender-specific tailoring. Never infer audience from color, pattern, apparent size or styling alone.",
  "Neutral basics such as T-shirts, shirts, hoodies, sweatshirts, base layers, jackets and straight-cut trousers default to UNISEX when explicit evidence is absent.",
  "Keep title gender-neutral. Never put Women's, Men's, Boys', Girls' or Unisex in title; the employee confirms audience separately."
] as const;

@Injectable()
export class OpenAIVisionProvider implements AIProvider {
  constructor(
    private readonly imageStorage: ProductImageStorageService,
    private readonly measurementBoard: LightweightMeasurementBoardProvider
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  async extract(request: AIExtractionRequest): Promise<AIProviderResult> {
    const apiKey = this.apiKey();
    if (!apiKey) {
      throw new InternalServerErrorException("OpenAI API key is not configured");
    }

    const startedAt = Date.now();
    const taxonomy = await loadProductTaxonomy();
    const runtimeTaxonomy = {
      categories: activeTaxonomyCodes(taxonomy, "CATEGORY"),
      subcategories: activeTaxonomyCodes(taxonomy, "SUBCATEGORY"),
      colors: activeTaxonomyCodes(taxonomy, "COLOR"),
      materials: activeTaxonomyCodes(taxonomy, "MATERIAL"),
      tags: activeTaxonomyCodes(taxonomy, "TAG")
    };
    const images = await prisma.productImage.findMany({
      where: { id: { in: request.imageIds }, productId: request.productId },
      orderBy: { createdAt: "asc" }
    });

    if (images.length === 0) {
      throw new BadRequestException("At least one stored product image is required for AI recognition");
    }

    const storedImages = await Promise.all(
      images.map(async (image) => {
        if (!image.originalUrl.startsWith(`gs://${this.imageStorage.bucket}/`)) {
          throw new BadRequestException("Stored product image is not available for AI recognition");
        }
        const objectName = image.originalUrl.slice(`gs://${this.imageStorage.bucket}/`.length);
        const stored = await this.imageStorage.download(objectName);
        return { image, stored };
      })
    );
    const imageInputs = storedImages.map(({ image, stored }) => {
        const base64 = Buffer.from(stored.body).toString("base64");
        return {
          type: "input_image",
          image_url: `data:${stored.contentType};base64,${base64}`,
          detail: image.type === "FRONT" ? "high" : "low"
        };
      });
    const frontStored = storedImages.find(({ image }) => image.type === "FRONT") ?? storedImages[0];
    const boardDetectionPromise = frontStored
      ? this.measurementBoard.detect({
          body: Buffer.from(frontStored.stored.body),
          contentType: frontStored.stored.contentType,
          filename: `${frontStored.image.id}.${frontStored.stored.contentType.split("/")[1] ?? "jpg"}`
        })
      : Promise.resolve(null);

    const response = await fetch(RESPONSES_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model(),
        input: [
          {
            role: "system",
            content:
              "You identify and measure second-hand clothing from product photos for a Kenyan mobile resale catalog. Return JSON only. Use the exact enum values provided. If a field is not visible, use its documented UNKNOWN or OTHER fallback, return an empty array for tags, and null for text or measurement fields. Use the 120 cm by 160 cm measurement board, edge rulers, and perspective cues when visible. Never infer a centimeter measurement from the tag size alone. Confidence must be a number from 0 to 1."
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  "Return one JSON object with these fields:",
                  "category, subcategory, primaryColor, audience, kidsAgeRange, pattern, sleeveType, fitType, stretchLevel, fabricWeight, material, tags, brandLabel, sizeLabel, ukSizeLabel, title, lengthCm, chestWidthCm, shoulderWidthCm, sleeveLengthCm, waistCm, hipCm, thighWidthCm, legOpeningCm, inseamCm, measurementGeometry.",
                  `category enum: ${runtimeTaxonomy.categories.join(", ")}`,
                  `subcategory enum: ${runtimeTaxonomy.subcategories.join(", ")}`,
                  `primaryColor enum: ${runtimeTaxonomy.colors.join(", ")}`,
                  `material enum: ${runtimeTaxonomy.materials.join(", ")}`,
                  `tags enum: ${runtimeTaxonomy.tags.join(", ")}`,
                  `audience enum: ${AI_AUDIENCES.join(", ")}`,
                  `kidsAgeRange enum: ${AI_KIDS_AGE_RANGES.join(", ")}`,
                  `pattern enum: ${AI_PATTERNS.join(", ")}`,
                  `sleeveType enum: ${AI_SLEEVE_TYPES.join(", ")}`,
                  `fitType enum: ${PRODUCT_FIT_TYPES.join(", ")}`,
                  `stretchLevel enum: ${PRODUCT_STRETCH_LEVELS.join(", ")}`,
                  `fabricWeight enum: ${PRODUCT_FABRIC_WEIGHTS.join(", ")}`,
                  "Use kidsAgeRange=NOT_APPLICABLE unless audience=KIDS.",
                  "Each catalog and centimeter field must be an object: { value, confidence }.",
                  ...PRODUCT_AUDIENCE_TITLE_RULES,
                  ...PRODUCT_MATERIAL_TAG_RULES,
                  "ukSizeLabel is the best UK size notation supported by the visible tag and measured garment fit, for example UK 12, UK W32, or UK M. Use null when the evidence is insufficient; do not convert from sizeLabel alone.",
                  "All centimeter values are flat-lay garment measurements, not body circumference.",
                  "lengthCm: shoulder high point at the neck/shoulder seam to hem for tops/dresses; top waistband to hem for bottoms.",
                  "chestWidthCm: pit to pit. sleeveLengthCm: shoulder seam to cuff.",
                  ...SHOULDER_WIDTH_MEASUREMENT_RULES,
                  ...HOODED_GARMENT_MEASUREMENT_RULES,
                  "waistCm and hipCm are flat widths. thighWidthCm is one leg flat width. legOpeningCm is one opening flat width. inseamCm is crotch to hem.",
                  ...MEASUREMENT_GEOMETRY_RULES,
                  "Base the answer only on the attached images."
                ].join("\n")
              },
              ...imageInputs
            ]
          }
        ],
        ...openAIVisionResponseSettings()
      })
    });

    const responseText = await response.text();
    const payload = parseResponsePayload(responseText);
    if (!response.ok) {
      throw new InternalServerErrorException(openAIErrorMessage(response.status, payload));
    }

    const rawOutput = parseOpenAIVisionOutput(payload);
    const boardDetection = await boardDetectionPromise;
    return {
      provider: "openai",
      model: this.model(),
      rawOutput: payload,
      normalizedOutput: normalizeOpenAIVisionOutput(
        rawOutput,
        request.imageIds,
        runtimeTaxonomy,
        images.find((image) => image.type === "FRONT")?.id ?? request.imageIds[0] ?? null,
        boardDetection
      ),
      latencyMs: Date.now() - startedAt,
      inputTokens: numberOrUndefined(payload.usage?.input_tokens),
      outputTokens: numberOrUndefined(payload.usage?.output_tokens)
    };
  }

  private apiKey(): string {
    return process.env.OPENAI_API_KEY?.trim() ?? "";
  }

  private model(): string {
    return process.env.OPENAI_VISION_MODEL?.trim() || DEFAULT_MODEL;
  }
}

export function openAIVisionResponseSettings() {
  return {
    text: {
      format: { type: "json_object" }
    },
    max_output_tokens: 5000
  } as const;
}

export function parseOpenAIVisionOutput(payload: ResponsesApiPayload): unknown {
  if (typeof payload.output_text === "string") {
    return parseJsonObject(payload.output_text);
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const text = output
    .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
    .map((content: any) => content?.text)
    .filter((value: unknown): value is string => typeof value === "string")
    .join("\n")
    .trim();

  if (!text) {
    const status = String(payload.status ?? "unknown");
    const reason = String(payload.incomplete_details?.reason ?? payload.error?.message ?? "no_output_text");
    throw new InternalServerErrorException(
      `OpenAI did not return a readable product recognition result (${status}: ${reason})`
    );
  }
  return parseJsonObject(text);
}

function parseResponsePayload(text: string): ResponsesApiPayload {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as ResponsesApiPayload;
  } catch {
    return { error: text.slice(0, 600) };
  }
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new InternalServerErrorException("OpenAI product recognition result was not valid JSON");
  }
}

function openAIErrorMessage(status: number, payload: ResponsesApiPayload): string {
  const message = String(payload.error?.message ?? payload.error ?? "unknown error").slice(0, 600);
  return `OpenAI image recognition failed (${status}): ${message}`;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
