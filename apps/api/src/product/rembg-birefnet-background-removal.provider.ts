import { Injectable } from "@nestjs/common";
import {
  BackgroundRemovalProviderError,
  type BackgroundRemovalInput,
  type BackgroundRemovalProvider,
  type BackgroundRemovalResult
} from "./background-removal.provider";

@Injectable()
export class RembgBirefnetBackgroundRemovalProvider implements BackgroundRemovalProvider {
  private readonly timeoutMs = 120_000;
  private readonly maxAttempts = 4;
  private requestQueue: Promise<void> = Promise.resolve();

  isConfigured(): boolean {
    return Boolean(process.env.REMBG_BIREFNET_SERVICE_URL?.trim());
  }

  async removeBackground(input: BackgroundRemovalInput): Promise<BackgroundRemovalResult> {
    const result = this.requestQueue.then(
      () => this.removeBackgroundWithRetry(input),
      () => this.removeBackgroundWithRetry(input)
    );
    this.requestQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async removeBackgroundWithRetry(input: BackgroundRemovalInput): Promise<BackgroundRemovalResult> {
    const serviceUrl = process.env.REMBG_BIREFNET_SERVICE_URL?.trim();
    if (!serviceUrl) {
      throw new BackgroundRemovalProviderError(
        "PROCESSOR_NOT_CONFIGURED",
        "REMBG_BIREFNET_SERVICE_URL is not configured"
      );
    }

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
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
          if (isTransientStatus(response.status) && attempt < this.maxAttempts) {
            await this.waitBeforeRetry(attempt);
            continue;
          }
          throw new BackgroundRemovalProviderError(
            response.status === 400 || response.status === 413 || response.status === 422
              ? "PROCESSOR_REJECTED_IMAGE"
              : "UNKNOWN",
            `rembg BiRefNet failed after ${attempt} attempt${attempt === 1 ? "" : "s"}: ${response.status} ${detail || response.statusText}`
          );
        }

        return {
          body: Buffer.from(await response.arrayBuffer()),
          contentType: "image/png",
          provider: "rembg-birefnet",
          processorVersion: response.headers.get("x-processor-version") ?? "rembg-birefnet-v1",
          qualityScore: parseQualityScore(response.headers.get("x-quality-score")),
          qualityIssues: parseQualityIssues(response.headers.get("x-quality-issues"))
        };
      } catch (error) {
        if (error instanceof BackgroundRemovalProviderError) throw error;
        if (error instanceof Error && error.name === "AbortError") {
          throw new BackgroundRemovalProviderError(
            "PROCESSOR_TIMEOUT",
            "rembg BiRefNet request timed out"
          );
        }
        if (attempt < this.maxAttempts) {
          await this.waitBeforeRetry(attempt);
          continue;
        }
        throw new BackgroundRemovalProviderError(
          "UNKNOWN",
          error instanceof Error ? error.message : "Unknown rembg BiRefNet failure"
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new BackgroundRemovalProviderError("UNKNOWN", "Unknown rembg BiRefNet failure");
  }

  private async waitBeforeRetry(attempt: number): Promise<void> {
    const configured = Number.parseInt(process.env.REMBG_BIREFNET_RETRY_BASE_DELAY_MS ?? "750", 10);
    const baseDelayMs = Number.isFinite(configured) && configured >= 0 ? configured : 750;
    const delayMs = baseDelayMs * (2 ** (attempt - 1));
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

function isTransientStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function parseQualityScore(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseQualityIssues(value: string | null): string[] {
  if (!value?.trim()) return [];
  return value.split(",").map((issue) => issue.trim()).filter(Boolean);
}
