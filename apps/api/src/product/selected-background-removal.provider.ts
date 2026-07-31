import { Injectable } from "@nestjs/common";
import type {
  BackgroundRemovalInput,
  BackgroundRemovalProvider,
  BackgroundRemovalResult
} from "./background-removal.provider";
import { LightweightBackgroundRemovalProvider } from "./lightweight-background-removal.provider";
import { RembgBirefnetBackgroundRemovalProvider } from "./rembg-birefnet-background-removal.provider";
import { RemoveBgProvider } from "./remove-bg.provider";

@Injectable()
export class SelectedBackgroundRemovalProvider implements BackgroundRemovalProvider {
  constructor(
    private readonly lightweight: LightweightBackgroundRemovalProvider,
    private readonly rembgBirefnet: RembgBirefnetBackgroundRemovalProvider,
    private readonly removeBg: RemoveBgProvider
  ) {}

  isConfigured(): boolean {
    return this.selected().isConfigured();
  }

  async removeBackground(input: BackgroundRemovalInput): Promise<BackgroundRemovalResult> {
    return this.selected().removeBackground(input);
  }

  private selected(): BackgroundRemovalProvider {
    const mode = (process.env.BACKGROUND_REMOVAL_PROVIDER ?? "lightweight")
      .trim()
      .toLowerCase();

    if (mode === "rembg_birefnet" || mode === "rembg-birefnet" || mode === "birefnet") {
      return this.rembgBirefnet;
    }
    if (mode === "remove_bg" || mode === "remove.bg") return this.removeBg;
    return this.lightweight;
  }
}
