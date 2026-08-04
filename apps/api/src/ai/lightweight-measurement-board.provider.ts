import { Injectable } from "@nestjs/common";
import type { AIMeasurementBoardCorners } from "@online-saler/shared-types";
import type { MeasurementBoardOverride } from "./openai-vision-normalizer";

type DetectionPayload = {
  corners?: AIMeasurementBoardCorners;
  confidence?: number;
};

@Injectable()
export class LightweightMeasurementBoardProvider {
  private readonly timeoutMs = 20_000;

  async detect(input: {
    body: Buffer;
    contentType: string;
    filename: string;
  }): Promise<MeasurementBoardOverride | null> {
    const serviceUrl = process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL?.trim();
    if (!serviceUrl) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const payload = new Uint8Array(input.body.length);
      payload.set(input.body);
      const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/detect-measurement-board`, {
        method: "POST",
        headers: {
          "Content-Type": input.contentType,
          "X-Filename": input.filename
        },
        body: payload,
        signal: controller.signal
      });
      if (!response.ok) return null;

      const result = await response.json() as DetectionPayload;
      const confidence = Number(result.confidence);
      if (!result.corners || !Number.isFinite(confidence)) return null;
      return { corners: result.corners, confidence: Math.max(0, Math.min(1, confidence)) };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
