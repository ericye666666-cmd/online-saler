import { Injectable } from "@nestjs/common";
import {
  BackgroundRemovalProviderError,
  type BackgroundRemovalInput,
  type BackgroundRemovalProvider,
  type BackgroundRemovalResult,
  type GuidedCutoutPoint
} from "./background-removal.provider";

@Injectable()
export class LightweightBackgroundRemovalProvider implements BackgroundRemovalProvider {
  private readonly timeoutMs = 60_000;
  private readonly maxAttempts = 4;
  private readonly requestQueues = Array.from(
    { length: configuredConcurrency() },
    () => Promise.resolve()
  );
  private nextQueue = 0;

  isConfigured(): boolean {
    return Boolean(process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL?.trim());
  }

  async removeBackground(input: BackgroundRemovalInput): Promise<BackgroundRemovalResult> {
    return this.enqueue(() => this.requestWithRetry(input, "/remove-background"));
  }

  async removeBackgroundGuided(
    input: BackgroundRemovalInput,
    points: GuidedCutoutPoint[]
  ): Promise<BackgroundRemovalResult> {
    return this.enqueue(() => this.requestWithRetry(input, "/remove-background-guided", {
      "X-Foreground-Polygon": JSON.stringify(points)
    }));
  }

  private enqueue<T>(request: () => Promise<T>): Promise<T> {
    const index = this.nextQueue % this.requestQueues.length;
    this.nextQueue += 1;
    const result = this.requestQueues[index]!.then(request, request);
    this.requestQueues[index] = result.then(() => undefined, () => undefined);
    return result;
  }

  private async requestWithRetry(
    input: BackgroundRemovalInput,
    path: string,
    additionalHeaders: Record<string, string> = {}
  ): Promise<BackgroundRemovalResult> {
    const serviceUrl = process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL?.trim();
    if (!serviceUrl) {
      throw new BackgroundRemovalProviderError(
        "PROCESSOR_NOT_CONFIGURED",
        "LIGHTWEIGHT_CUTOUT_SERVICE_URL is not configured"
      );
    }

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const payload = new Uint8Array(input.body.length);
        payload.set(input.body);

        const response = await fetch(`${serviceUrl.replace(/\/$/, "")}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": input.contentType,
            "X-Filename": input.filename,
            ...additionalHeaders
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
            `Lightweight cutout failed after ${attempt} attempt${attempt === 1 ? "" : "s"}: ${response.status} ${detail || response.statusText}`
          );
        }

        return {
          body: Buffer.from(await response.arrayBuffer()),
          contentType: "image/png",
          provider: response.headers.get("x-processor") ?? "lightweight-opencv",
          processorVersion: response.headers.get("x-processor-version") ?? "opencv-cutout-v2.2-board-quality",
          qualityScore: parseQualityScore(response.headers.get("x-quality-score")),
          qualityIssues: parseQualityIssues(response.headers.get("x-quality-issues"))
        };
      } catch (error) {
        if (error instanceof BackgroundRemovalProviderError) throw error;
        if (attempt < this.maxAttempts) {
          await this.waitBeforeRetry(attempt);
          continue;
        }
        if (error instanceof Error && error.name === "AbortError") {
          throw new BackgroundRemovalProviderError(
            "PROCESSOR_TIMEOUT",
            `Lightweight cutout request timed out after ${attempt} attempts`
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

    throw new BackgroundRemovalProviderError("UNKNOWN", "Unknown lightweight cutout failure");
  }

  private async waitBeforeRetry(attempt: number): Promise<void> {
    const configured = Number.parseInt(process.env.LIGHTWEIGHT_CUTOUT_RETRY_BASE_DELAY_MS ?? "300", 10);
    const baseDelayMs = Number.isFinite(configured) && configured >= 0 ? configured : 300;
    const delayMs = baseDelayMs * (2 ** (attempt - 1));
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

function configuredConcurrency(): number {
  const value = Number.parseInt(process.env.LIGHTWEIGHT_CUTOUT_MAX_CONCURRENCY ?? "2", 10);
  return Number.isFinite(value) ? Math.max(1, Math.min(4, value)) : 2;
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
  return value
    .split(",")
    .map((issue) => issue.trim())
    .filter(Boolean);
}
