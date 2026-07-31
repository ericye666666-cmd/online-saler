import { Injectable } from "@nestjs/common";
import {
  BackgroundRemovalProviderError,
  type BackgroundRemovalInput,
  type BackgroundRemovalProvider,
  type BackgroundRemovalResult
} from "./background-removal.provider";

@Injectable()
export class LightweightBackgroundRemovalProvider implements BackgroundRemovalProvider {
  private readonly timeoutMs = 60_000;

  isConfigured(): boolean {
    return Boolean(process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL?.trim());
  }

  async removeBackground(input: BackgroundRemovalInput): Promise<BackgroundRemovalResult> {
    const serviceUrl = process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL?.trim();
    if (!serviceUrl) {
      throw new BackgroundRemovalProviderError(
        "PROCESSOR_NOT_CONFIGURED",
        "LIGHTWEIGHT_CUTOUT_SERVICE_URL is not configured"
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const payload = new Uint8Array(input.body.length);
      payload.set(input.body);

      const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/remove-background`, {
        method: "POST",
        headers: {
          "Content-Type": input.contentType,
          "X-Filename": input.filename
        },
        body: payload,
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new BackgroundRemovalProviderError(
          response.status === 400 || response.status === 422
            ? "PROCESSOR_REJECTED_IMAGE"
            : "UNKNOWN",
          `Lightweight cutout failed: ${response.status} ${detail || response.statusText}`
        );
      }

      return {
        body: Buffer.from(await response.arrayBuffer()),
        contentType: "image/png",
        provider: "lightweight-opencv",
        processorVersion: response.headers.get("x-processor-version") ?? "v1.0",
        qualityScore: parseQualityScore(response.headers.get("x-quality-score")),
        qualityIssues: parseQualityIssues(response.headers.get("x-quality-issues"))
      };
    } catch (error) {
      if (error instanceof BackgroundRemovalProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new BackgroundRemovalProviderError(
          "PROCESSOR_TIMEOUT",
          "Lightweight cutout request timed out"
        );
      }
      throw new BackgroundRemovalProviderError(
        "UNKNOWN",
        error instanceof Error ? error.message : "Unknown lightweight cutout failure"
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseQualityScore(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseQualityIssues(value: string | null): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((issue) => issue.trim())
    .filter(Boolean);
}
