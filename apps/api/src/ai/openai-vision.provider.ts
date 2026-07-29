import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { prisma } from "@online-saler/database";
import {
  AI_COLORS,
  AI_PATTERNS,
  AI_PRODUCT_CATEGORIES,
  AI_SLEEVE_TYPES,
  type AIExtractionRequest
} from "@online-saler/shared-types";
import { ProductImageStorageService } from "../product/product-image-storage.service";
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
          detail: "low"
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
              "You identify second-hand clothing from product photos for a Kenyan mobile resale catalog. Return JSON only. Use the exact enum values provided. If a field is not visible, choose OTHER for enum fields and null for text fields. Confidence must be a number from 0 to 1."
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  "Return one JSON object with these fields:",
                  "category, primaryColor, pattern, sleeveType, brandLabel, sizeLabel, title.",
                  `category enum: ${AI_PRODUCT_CATEGORIES.join(", ")}`,
                  `primaryColor enum: ${AI_COLORS.join(", ")}`,
                  `pattern enum: ${AI_PATTERNS.join(", ")}`,
                  `sleeveType enum: ${AI_SLEEVE_TYPES.join(", ")}`,
                  "Each field must be an object: { value, confidence }.",
                  "Base the answer only on the attached image."
                ].join("\n")
              },
              ...imageInputs
            ]
          }
        ],
        text: { format: { type: "json_object" } },
        max_output_tokens: 900
      })
    });

    const responseText = await response.text();
    const payload = parseResponsePayload(responseText);
    if (!response.ok) {
      throw new InternalServerErrorException(openAIErrorMessage(response.status, payload));
    }

    const rawOutput = parseOutputText(payload);
    return {
      provider: "openai",
      model: this.model(),
      rawOutput: payload,
      normalizedOutput: normalizeOpenAIVisionOutput(rawOutput, request.imageIds),
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

function parseOutputText(payload: ResponsesApiPayload): unknown {
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
    throw new InternalServerErrorException("OpenAI did not return a readable product recognition result");
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
