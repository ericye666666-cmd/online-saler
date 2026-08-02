import { Injectable } from "@nestjs/common";
import type { BackgroundRemovalMode } from "@online-saler/shared-types";
import type {
  BackgroundRemovalInput,
  BackgroundRemovalProvider,
  BackgroundRemovalResult
} from "./background-removal.provider";
import { LightweightBackgroundRemovalProvider } from "./lightweight-background-removal.provider";
import { RembgBirefnetBackgroundRemovalProvider } from "./rembg-birefnet-background-removal.provider";
import { RemoveBgProvider } from "./remove-bg.provider";
import { evaluateLightweightImageQuality } from "./product-image-processing.rules";

@Injectable()
export class SelectedBackgroundRemovalProvider implements BackgroundRemovalProvider {
  constructor(
    private readonly lightweight: LightweightBackgroundRemovalProvider,
    private readonly rembgBirefnet: RembgBirefnetBackgroundRemovalProvider,
    private readonly removeBg: RemoveBgProvider
  ) {}

  isConfigured(): boolean {
    const mode = selectedMode();
    if (mode === "auto") {
      return this.lightweight.isConfigured() || this.rembgBirefnet.isConfigured();
    }
    return this.selected(mode).isConfigured();
  }

  async removeBackground(
    input: BackgroundRemovalInput,
    modeOverride?: BackgroundRemovalMode
  ): Promise<BackgroundRemovalResult> {
    const mode = modeOverride ?? selectedMode();
    if (mode === "auto") return this.removeBackgroundAutomatically(input);
    return this.selected(mode).removeBackground(input);
  }

  private selected(mode: string): BackgroundRemovalProvider {
    if (mode === "rembg_birefnet" || mode === "rembg-birefnet" || mode === "birefnet") {
      return this.rembgBirefnet;
    }
    if (mode === "remove_bg" || mode === "remove.bg") return this.removeBg;
    return this.lightweight;
  }

  private async removeBackgroundAutomatically(
    input: BackgroundRemovalInput
  ): Promise<BackgroundRemovalResult> {
    if (!this.lightweight.isConfigured()) {
      const fallback = await this.rembgBirefnet.removeBackground(input);
      return {
        ...fallback,
        fallbackFrom: "lightweight-opencv",
        fallbackReason: "LIGHTWEIGHT_NOT_CONFIGURED"
      };
    }

    let lightweightResult: BackgroundRemovalResult;
    try {
      lightweightResult = await this.lightweight.removeBackground(input);
    } catch (error) {
      if (!this.rembgBirefnet.isConfigured()) throw error;
      const fallback = await this.rembgBirefnet.removeBackground(input);
      return {
        ...fallback,
        fallbackFrom: "lightweight-opencv",
        fallbackReason: `LIGHTWEIGHT_FAILED:${error instanceof Error ? error.message : "unknown"}`
      };
    }

    const decision = evaluateLightweightImageQuality(lightweightResult);
    if (decision.pass || !this.rembgBirefnet.isConfigured()) return lightweightResult;

    const fallback = await this.rembgBirefnet.removeBackground(input);
    return {
      ...fallback,
      qualityScore: lightweightResult.qualityScore ?? null,
      qualityIssues: lightweightResult.qualityIssues ?? [],
      fallbackFrom: lightweightResult.provider,
      fallbackReason: decision.reason
    };
  }
}

function selectedMode(): string {
  return (process.env.BACKGROUND_REMOVAL_PROVIDER ?? "auto").trim().toLowerCase();
}
