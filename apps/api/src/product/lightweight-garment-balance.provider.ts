import { Injectable } from "@nestjs/common";
import {
  BackgroundRemovalProviderError,
  type BackgroundRemovalInput
} from "./background-removal.provider";
import type { ProductImageTransformResult } from "./product-image-transformer.service";

@Injectable()
export class LightweightGarmentBalanceProvider {
  private readonly timeoutMs = 90_000;

  async balance(input: BackgroundRemovalInput): Promise<ProductImageTransformResult> {
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
      const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/balance-garment`, {
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
          response.status === 400 || response.status === 415 || response.status === 422
            ? "PROCESSOR_REJECTED_IMAGE"
            : "UNKNOWN",
          `Garment balancing failed: ${response.status} ${detail || response.statusText}`
        );
      }
      return {
        body: Buffer.from(await response.arrayBuffer()),
        contentType: "image/jpeg",
        provider: response.headers.get("x-processor") ?? "lightweight-opencv",
        processorVersion: response.headers.get("x-processor-version") ?? "opencv-balance-v4",
        widthPx: 1200,
        heightPx: 1200
      };
    } catch (error) {
      if (error instanceof BackgroundRemovalProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new BackgroundRemovalProviderError("PROCESSOR_TIMEOUT", "Garment balancing request timed out");
      }
      throw new BackgroundRemovalProviderError(
        "UNKNOWN",
        error instanceof Error ? error.message : "Unknown garment balancing failure"
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
