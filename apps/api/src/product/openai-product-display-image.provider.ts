import { isShoeCategory } from "@online-saler/shared-types";
import { Injectable } from "@nestjs/common";
import { BackgroundRemovalProviderError, type BackgroundRemovalInput } from "./background-removal.provider";
import type { ProductImageTransformResult } from "./product-image-transformer.service";

const OPENAI_IMAGE_EDIT_URL = "https://api.openai.com/v1/images/edits";
const DEFAULT_MODEL = "gpt-image-2.5-sunburst";
const DEFAULT_QUALITY = "high";
const DEFAULT_TIMEOUT_MS = 180_000;

export const PRODUCT_DISPLAY_PROMPT_VERSION = "product-display-v4-studio-shadow";
export const PRODUCT_DISPLAY_IMAGE_PROMPT = [
  "Edit this exact uploaded photograph into a faithful white-background product photograph. This is an evidence-preserving edit of a real second-hand garment, not an illustration, redesign, or a similar garment.",
  "Use the supplied original photograph directly. Preserve the original garment image as closely as possible: the same pose, asymmetric silhouette, sleeve positions, collar or waistband opening, hem, folds, drape, seams, buttons, labels, material texture and color.",
  "Crucially preserve every existing print, logo, embroidery, symbol, number and letter, including small lettering and non-Latin text, in its original position, scale, orientation and shape on the garment.",
  "Do not redraw, simplify, substitute, repeat, relocate or invent prints or lettering. Do not replace unreadable text with guessed words or decorative marks.",
  "Do not flatten, straighten, symmetrize, unfold, iron, widen, shorten or rearrange the garment. Do not change the viewing angle, sleeve placement, collar opening, proportions or fabric drape.",
  "Preserve all visible wear, stains, holes, fading and other defects. Do not repair, clean away, hide or beautify them.",
  "Replace the surrounding backdrop, board, floor and any clutter with a seamless pure white studio background, as in a professional e-commerce catalogue photograph.",
  "Beneath and just around the garment, add one soft, diffuse, neutral grey contact shadow, as if the item were lying on a white studio surface under a large soft overhead light: darkest exactly where the garment meets the surface and fading smoothly to pure white within a short distance. The shadow belongs to the surface only; it must never darken, tint, reshape or overlap any part of the garment.",
  "Correct only exposure and white balance so the garment reads under clean neutral studio light: whites neutral, colours true to the real fabric. Never change the garment's actual colour, the colours of its prints, or how visible its wear is.",
  "Keep the garment's own shading, folds, knit or weave texture, stitching and surface detail crisp and fully visible. Do not smooth, blur, denoise or airbrush the fabric. Preserve visible inner fabric and neck or size labels.",
  "If a hanger, clip, mannequin or other support intersects the garment or is visible inside its opening, retain it rather than fabricating the hidden garment. Never reconstruct unseen fabric or prints.",
  "Keep the full garment and its existing silhouette visible without cropping. If a square canvas needs extra space, add white margins; never stretch or rearrange the garment to fill the canvas.",
  "Return one conservative edited photograph, prioritizing fidelity over prettification. No added text, captions, borders or comparison panels."
].join("\n");

export const SHOE_DISPLAY_PROMPT_VERSION = "shoe-display-v2-studio-shadow";
export const SHOE_DISPLAY_IMAGE_PROMPT = [
  "Create a clean white-background catalog image of the exact pair of second-hand shoes in the original photo.",
  "Keep both original shoes fully visible. Preserve the left and right shoe separately, their side-specific geometry, toe shape, heel height, soles, tread, laces, labels, logos, color and material texture.",
  "Preserve all real wear, stains, scuffs, cracks, sole wear, creases, discoloration, tears, holes and glue separation. Do not repair, clean away, hide, repaint or improve any defect.",
  "Remove only the background. Keep the supplied viewpoint and relative arrangement; do not synthesize an unseen side, mirror or duplicate one shoe to fabricate its partner, or invent a missing shoe.",
  "Do not straighten shoes as trouser legs, add garment parts, change size or proportions, or create a replacement product.",
  "Place the pair on a seamless pure white studio background with one soft, diffuse, neutral grey contact shadow under the soles, darkest where each sole meets the surface and fading smoothly to white. The shadow must not darken or recolour the shoes.",
  "Correct only exposure and white balance to clean neutral studio light; never change the shoes' real colour or how visible their wear is. Keep leather grain, knit, suede nap and stitching crisp; do not smooth or airbrush them.",
  "Keep balanced white margins around the full pair. No feet, person, mannequin, props, added text, size claims or borders.",
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
