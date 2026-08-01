import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { prisma } from "@online-saler/database";
import {
  AI_AUDIENCES,
  AI_KIDS_AGE_RANGES,
  AI_PATTERNS,
  AI_SLEEVE_TYPES,
  type AIExtractionRequest
} from "@online-saler/shared-types";
import { ProductImageStorageService } from "../product/product-image-storage.service";
import { activeTaxonomyCodes, loadProductTaxonomy } from "../product/product-taxonomy";
import type { AIProvider, AIProviderResult } from "./ai-provider";
import { normalizeOpenAIVisionOutput } from "./openai-vision-normalizer";

type ResponsesApiPayload = Record<string, any>;

const RESPONSES_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-sol";

@Injectable()
export class OpenAIVisionProvider implements AIProvider {
  constructor(private readonly imageStorage: ProductImageStorageService) {}

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
      colors: activeTaxonomyCodes(taxonomy, "COLOR")
    };
    const images = await prisma.productImage.findMany({
      where: { id: { in: request.imageIds }, productId: request.productId },
      orderBy: { createdAt: "asc" }
    });

    if (images.length === 0) {
      throw new BadRequestException("At least one stored product image is required for AI recognition");
    }

    const imageInputs = await Promise.all(
      images.map(async (image) => {
        if (!image.originalUrl.startsWith(`gs://${this.imageStorage.bucket}/`)) {
          throw new BadRequestException("Stored product image is not available for AI recognition");
        }
        const objectName = image.originalUrl.slice(`gs://${this.imageStorage.bucket}/`.length);
        const stored = await this.imageStorage.download(objectName);
        const base64 = Buffer.from(stored.body).toString("base64");
        return {
          type: "input_image",
          image_url: `data:${stored.contentType};base64,${base64}`,
          detail: image.type === "FRONT" ? "high" : "low"
        };
      })
    );

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
              "You identify and measure second-hand clothing from product photos for a Kenyan mobile resale catalog. Return JSON only. Use the exact enum values provided. If a field is not visible, choose OTHER for enum fields and null for text or measurement fields. Use the 120 cm by 160 cm measurement board, edge rulers, and perspective cues when visible. Never infer a centimeter measurement from the tag size alone. Confidence must be a number from 0 to 1."
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  "Return one JSON object with these fields:",
                  "category, subcategory, primaryColor, audience, kidsAgeRange, pattern, sleeveType, brandLabel, sizeLabel, ukSizeLabel, title, lengthCm, chestWidthCm, shoulderWidthCm, sleeveLengthCm, waistCm, hipCm, thighWidthCm, legOpeningCm, inseamCm.",
                  `category enum: ${runtimeTaxonomy.categories.join(", ")}`,
                  `subcategory enum: ${runtimeTaxonomy.subcategories.join(", ")}`,
                  `primaryColor enum: ${runtimeTaxonomy.colors.join(", ")}`,
                  `audience enum: ${AI_AUDIENCES.join(", ")}`,
                  `kidsAgeRange enum: ${AI_KIDS_AGE_RANGES.join(", ")}`,
                  `pattern enum: ${AI_PATTERNS.join(", ")}`,
                  `sleeveType enum: ${AI_SLEEVE_TYPES.join(", ")}`,
                  "Use kidsAgeRange=NOT_APPLICABLE unless audience=KIDS.",
                  "Each field must be an object: { value, confidence }.",
                  "ukSizeLabel is the best UK size notation supported by the visible tag and measured garment fit, for example UK 12, UK W32, or UK M. Use null when the evidence is insufficient; do not convert from sizeLabel alone.",
                  "All centimeter values are flat-lay garment measurements, not body circumference.",
                  "lengthCm: shoulder high point to hem for tops/dresses; top waistband to hem for bottoms.",
                  "chestWidthCm: pit to pit. shoulderWidthCm: shoulder seam to shoulder seam. sleeveLengthCm: shoulder seam to cuff.",
                  "waistCm and hipCm are flat widths. thighWidthCm is one leg flat width. legOpeningCm is one opening flat width. inseamCm is crotch to hem.",
                  "Use null when the ruler, garment endpoint, or full board is not clear enough. Do not guess a missing measurement.",
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
    return {
      provider: "openai",
      model: this.model(),
      rawOutput: payload,
      normalizedOutput: normalizeOpenAIVisionOutput(rawOutput, request.imageIds, runtimeTaxonomy),
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
    reasoning: { effort: "none" },
    text: {
      verbosity: "low",
      format: { type: "json_object" }
    },
    max_output_tokens: 3000
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
