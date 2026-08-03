import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import type { ProductImageType } from "@online-saler/database";
import { ProductImageStorageService } from "./product-image-storage.service";
import {
  normalizeProductDetailCopy,
  PRODUCT_DETAIL_COPY_SCHEMA,
  PRODUCT_DETAIL_PROMPT_VERSION,
  type ProductDetailCopy,
  type ProductDetailFacts
} from "./product-detail-copy";

const RESPONSES_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-sol";

type SourceImage = {
  id: string;
  type: ProductImageType;
  originalUrl: string;
};

type ResponsesPayload = Record<string, any>;

export type ProductDetailProviderResult = {
  provider: "openai";
  model: string;
  promptVersion: string;
  requestRecord: Record<string, unknown>;
  rawOutput: ResponsesPayload;
  finalOutput: ProductDetailCopy;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  latencyMs: number;
};

@Injectable()
export class ProductDetailOpenAIProvider {
  constructor(private readonly imageStorage: ProductImageStorageService) {}

  isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY?.trim());
  }

  async generate(facts: ProductDetailFacts, images: SourceImage[]): Promise<ProductDetailProviderResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new InternalServerErrorException("OpenAI API key is not configured");
    if (images.length === 0) throw new BadRequestException("At least one original product image is required");

    const startedAt = Date.now();
    const imageInputs = await Promise.all(images.map((image) => this.imageInput(image)));
    const requestRecord = {
      productId: facts.productId,
      sourceDataVersion: facts.sourceDataVersion,
      imageIds: images.map((image) => image.id),
      imageTypes: images.map((image) => image.type),
      facts,
      promptVersion: PRODUCT_DETAIL_PROMPT_VERSION
    };
    const response = await fetch(RESPONSES_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model(),
        input: [
          {
            role: "system",
            content: [
              "You write concise second-hand clothing catalog copy for a Kenyan mobile storefront.",
              "Use only the supplied employee-confirmed facts and original product photos.",
              "Never change or invent measurements, material composition, stretch, condition or defects.",
              "Never infer a missing factual value. Put missing facts in missingInformation.",
              "Summarize only flat garment measurements. Never recommend a wearer height, weight, age, body range or who the item should fit.",
              "Never describe an adult garment as childrenswear unless the employee-confirmed category explicitly says KIDS.",
              "Do not claim waterproofing, authenticity or performance unless explicitly supplied.",
              "Return only the requested structured JSON."
            ].join(" ")
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Write the structured product detail copy from these final facts:\n${JSON.stringify(facts)}`
              },
              ...imageInputs
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "product_detail_copy",
            strict: true,
            schema: PRODUCT_DETAIL_COPY_SCHEMA
          }
        },
        max_output_tokens: 1000
      })
    });

    const responseText = await response.text();
    const payload = parseResponsePayload(responseText);
    if (!response.ok) {
      const message = String(payload.error?.message ?? payload.error ?? "unknown error").slice(0, 600);
      throw new InternalServerErrorException(`OpenAI product detail generation failed (${response.status}): ${message}`);
    }

    const inputTokens = finiteNumber(payload.usage?.input_tokens);
    const outputTokens = finiteNumber(payload.usage?.output_tokens);
    return {
      provider: "openai",
      model: this.model(),
      promptVersion: PRODUCT_DETAIL_PROMPT_VERSION,
      requestRecord,
      rawOutput: payload,
      finalOutput: normalizeProductDetailCopy(parseOutputText(payload)),
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCost(inputTokens, outputTokens),
      latencyMs: Date.now() - startedAt
    };
  }

  private async imageInput(image: SourceImage) {
    const prefix = `gs://${this.imageStorage.bucket}/`;
    if (!image.originalUrl.startsWith(prefix)) {
      throw new BadRequestException(`Original image ${image.id} is not available in product storage`);
    }
    const stored = await this.imageStorage.download(image.originalUrl.slice(prefix.length));
    return {
      type: "input_image",
      image_url: `data:${stored.contentType};base64,${Buffer.from(stored.body).toString("base64")}`,
      detail: "low"
    };
  }

  private model(): string {
    return process.env.OPENAI_DETAIL_MODEL?.trim() || process.env.OPENAI_VISION_MODEL?.trim() || DEFAULT_MODEL;
  }
}

function parseResponsePayload(text: string): ResponsesPayload {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as ResponsesPayload;
  } catch {
    return { error: text.slice(0, 600) };
  }
}

function parseOutputText(payload: ResponsesPayload): unknown {
  const direct = typeof payload.output_text === "string" ? payload.output_text : "";
  const nested = (Array.isArray(payload.output) ? payload.output : [])
    .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
    .map((content: any) => content?.text)
    .filter((value: unknown): value is string => typeof value === "string")
    .join("\n");
  const text = (direct || nested).trim();
  if (!text) throw new InternalServerErrorException("OpenAI did not return product detail JSON");
  try {
    return JSON.parse(text);
  } catch {
    throw new InternalServerErrorException("OpenAI product detail output was not valid JSON");
  }
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function estimateCost(inputTokens?: number, outputTokens?: number): number | undefined {
  const inputRate = Number(process.env.OPENAI_DETAIL_INPUT_USD_PER_MILLION);
  const outputRate = Number(process.env.OPENAI_DETAIL_OUTPUT_USD_PER_MILLION);
  if (!Number.isFinite(inputRate) || !Number.isFinite(outputRate) || inputRate < 0 || outputRate < 0) {
    return undefined;
  }
  return Number((((inputTokens ?? 0) * inputRate + (outputTokens ?? 0) * outputRate) / 1_000_000).toFixed(6));
}
