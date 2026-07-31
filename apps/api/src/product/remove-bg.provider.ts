import { Injectable } from "@nestjs/common";
import {
  BackgroundRemovalProviderError,
  type BackgroundRemovalInput,
  type BackgroundRemovalProvider,
  type BackgroundRemovalResult
} from "./background-removal.provider";

export { BackgroundRemovalProviderError } from "./background-removal.provider";

@Injectable()
export class RemoveBgProvider implements BackgroundRemovalProvider {
  readonly providerName = "remove.bg";
  readonly processorVersion = "v1.0";

  private readonly endpoint = "https://api.remove.bg/v1.0/removebg";
  private readonly timeoutMs = 45_000;

  isConfigured(): boolean {
    return Boolean(process.env.REMOVE_BG_API_KEY?.trim());
  }

  async removeBackground(input: BackgroundRemovalInput): Promise<BackgroundRemovalResult> {
    const apiKey = process.env.REMOVE_BG_API_KEY?.trim();
    if (!apiKey) {
      throw new BackgroundRemovalProviderError(
        "PROCESSOR_NOT_CONFIGURED",
        "REMOVE_BG_API_KEY is not configured"
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const form = new FormData();
      const payload = new Uint8Array(input.body.length);
      payload.set(input.body);

      form.append("size", "auto");
      form.append("format", "png");
      form.append(
        "image_file",
        new Blob([payload.buffer], { type: input.contentType }),
        input.filename
      );

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "X-Api-Key": apiKey },
        body: form,
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        const code = response.status === 400 || response.status === 422
          ? "PROCESSOR_REJECTED_IMAGE"
          : "UNKNOWN";
        throw new BackgroundRemovalProviderError(
          code,
          `remove.bg failed: ${response.status} ${detail || response.statusText}`
        );
      }

      return {
        body: Buffer.from(await response.arrayBuffer()),
        contentType: "image/png",
        provider: this.providerName,
        processorVersion: this.processorVersion
      };
    } catch (error) {
      if (error instanceof BackgroundRemovalProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new BackgroundRemovalProviderError("PROCESSOR_TIMEOUT", "remove.bg request timed out");
      }
      throw new BackgroundRemovalProviderError(
        "UNKNOWN",
        error instanceof Error ? error.message : "Unknown background removal failure"
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
