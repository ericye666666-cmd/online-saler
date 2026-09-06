import { isShoeCategory } from "@online-saler/shared-types";
import { Injectable } from "@nestjs/common";
import { BackgroundRemovalProviderError, type BackgroundRemovalInput } from "./background-removal.provider";
import type { ProductImageTransformResult } from "./product-image-transformer.service";

const OPENAI_IMAGE_EDIT_URL = "https://api.openai.com/v1/images/edits";
const DEFAULT_MODEL = "gpt-image-1-mini";
const DEFAULT_QUALITY = "low";
const DEFAULT_TIMEOUT_MS = 180_000;

export const PRODUCT_DISPLAY_PROMPT_VERSION = "product-display-v1";
export const PRODUCT_DISPLAY_IMAGE_PROMPT = [
  "Create one clean catalog display image by carefully rearranging only the exact second-hand garment in the supplied image.",
  "Preserve the garment's identity and all factual details exactly: color, material texture, print, logo, embroidery, seams, pockets, buttons, zippers, drawstrings, labels, wear, stains, holes and other defects.",
  "Do not add, remove, replace, redraw or invent any garment detail. Do not repair or hide defects.",
  "Lay the garment out naturally and evenly on a pure white square background.",
  "For tops and outerwear: level the shoulders, place both sleeves in a natural relaxed and approximately symmetric downward position, align the cuffs, center and open any hood naturally, and level the hem.",
  "For trousers and shorts: level the waistband, straighten both legs naturally, keep the legs parallel without changing their cut, and align the hems.",
  "For dresses and skirts: level the shoulders or waistband and spread the body and hem naturally without changing the cut or proportions.",
  "Reduce only large accidental bunching and deep storage wrinkles. Keep normal fabric drape, construction folds and texture.",
  "Keep the full garment visible with balanced white margins. No person, mannequin, hanger, props, text, border or decorative shadow.",
  "Return a realistic front-facing ecommerce catalog image of this exact garment, not a redesigned or replacement garment."
].join("\n");

export const SHOE_DISPLAY_PROMPT_VERSION = "shoe-display-v1";
export const SHOE_DISPLAY_IMAGE_PROMPT = [
  "Create a clean white-background catalog image of the exact pair of second-hand shoes in the original photo.",
  "Keep both original shoes fully visible. Preserve the left and right shoe separately, their side-specific geometry, toe shape, heel height, soles, tread, laces, labels, logos, color and material texture.",
  "Preserve all real wear, stains, scuffs, cracks, sole wear, creases, discoloration, tears, holes and glue separation. Do not repair, clean away, hide, repaint or improve any defect.",
  "Remove only the background. Keep the supplied viewpoint and relative arrangement; do not synthesize an unseen side, mirror or duplicate one shoe to fabricate its partner, or invent a missing shoe.",
  "Do not straighten shoes as trouser legs, add garment parts, change size or proportions, or create a replacement product.",
  "Keep balanced white margins around the full pair. No feet, person, mannequin, props, added text, size claims, borders or decorative shadows.",
  "Return a realistic catalog photo of this exact pair. If only one shoe is visible, keep the visible evidence without fabricating another shoe; an employee must reject incomplete pair photos."
].join("\n");

type OpenAIImageEditPayload = {
  data?: Array<{ b64_json?: string }>;
  error?: { message?: string } | string;
};

@Injectable()
export class OpenAIProductDisplayImageProvider {
  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  async generate(input: BackgroundRemovalInput & { category?: string | null }): Promise<ProductImageTransformResult> {
    const apiKey = this.apiKey();
    if (!apiKey) {
      throw new BackgroundRemovalProviderError(
        "PROCESSOR_NOT_CONFIGURED",
        "OPENAI_API_KEY is not configured for AI display image generation"
      );
    }

    const form = new FormData();
    form.set("model", this.model());
    const shoes = isShoeCategory(input.category);
    form.set("prompt", shoes ? SHOE_DISPLAY_IMAGE_PROMPT : PRODUCT_DISPLAY_IMAGE_PROMPT);
    form.set("size", "1024x1024");
    form.set("quality", this.quality());
    form.set("background", "opaque");
    form.set("output_format", "png");
    form.append(
      "image[]",
      new Blob([new Uint8Array(input.body)], { type: input.contentType }),
      input.filename
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      const response = await fetch(OPENAI_IMAGE_EDIT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal
      });
      const responseText = await response.text();
      const payload = parsePayload(responseText);
      if (!response.ok) {
        throw new BackgroundRemovalProviderError(
          response.status >= 500 || response.status === 429 ? "UNKNOWN" : "PROCESSOR_REJECTED_IMAGE",
          `OpenAI display image generation failed (${response.status}): ${errorMessage(payload)}`
        );
      }

      const encoded = payload.data?.[0]?.b64_json;
      if (!encoded) {
        throw new BackgroundRemovalProviderError(
          "PROCESSOR_REJECTED_IMAGE",
          "OpenAI display image generation returned no image data"
        );
      }

      return {
        body: Buffer.from(encoded, "base64"),
        contentType: "image/png",
        provider: "openai-image-edit",
        processorVersion: `${this.model()}:${shoes ? SHOE_DISPLAY_PROMPT_VERSION : PRODUCT_DISPLAY_PROMPT_VERSION}:${this.quality()}`,
        widthPx: 1024,
        heightPx: 1024
      };
    } catch (error) {
      if (error instanceof BackgroundRemovalProviderError) throw error;
      if (controller.signal.aborted) {
        throw new BackgroundRemovalProviderError(
          "PROCESSOR_TIMEOUT",
          `OpenAI display image generation exceeded ${this.timeoutMs()} ms`
        );
      }
      throw new BackgroundRemovalProviderError(
        "UNKNOWN",
        error instanceof Error ? error.message : "OpenAI display image generation failed"
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private apiKey(): string {
    return process.env.OPENAI_API_KEY?.trim() ?? "";
  }

  private model(): string {
    return process.env.OPENAI_IMAGE_EDIT_MODEL?.trim() || DEFAULT_MODEL;
  }

  private quality(): "low" | "medium" | "high" | "auto" {
    const configured = process.env.OPENAI_IMAGE_EDIT_QUALITY?.trim().toLowerCase();
    return configured === "low" || configured === "medium" || configured === "high" || configured === "auto"
      ? configured
      : DEFAULT_QUALITY;
  }

  private timeoutMs(): number {
    const configured = Number.parseInt(process.env.OPENAI_IMAGE_EDIT_TIMEOUT_MS ?? "", 10);
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
  }
}

function parsePayload(text: string): OpenAIImageEditPayload {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as OpenAIImageEditPayload;
  } catch {
    return { error: text.slice(0, 600) };
  }
}

function errorMessage(payload: OpenAIImageEditPayload): string {
  if (typeof payload.error === "string") return payload.error.slice(0, 600);
  return String(payload.error?.message ?? "unknown error").slice(0, 600);
}
