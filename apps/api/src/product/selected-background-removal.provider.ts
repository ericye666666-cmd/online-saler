import { Injectable } from "@nestjs/common";
import {
  BackgroundRemovalProviderError,
  type BackgroundRemovalInput,
  type BackgroundRemovalProvider,
  type BackgroundRemovalResult
} from "./background-removal.provider";
import { LightweightBackgroundRemovalProvider } from "./lightweight-background-removal.provider";
import { RemoveBgProvider } from "./remove-bg.provider";

export type BackgroundRemovalMode = "lightweight" | "remove_bg" | "auto";

export function resolveBackgroundRemovalMode(
  configuredMode: string | undefined,
  availability: { lightweight: boolean; removeBg: boolean }
): Exclude<BackgroundRemovalMode, "auto"> {
  const mode = (configuredMode ?? "lightweight")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");

  if (mode === "lightweight") return "lightweight";
  if (mode === "remove_bg" || mode === "remove.bg") return "remove_bg";
  if (mode === "auto") {
    if (availability.lightweight) return "lightweight";
    if (availability.removeBg) return "remove_bg";
    return "lightweight";
  }

  throw new BackgroundRemovalProviderError(
    "PROCESSOR_NOT_CONFIGURED",
    `Unsupported BACKGROUND_REMOVAL_PROVIDER: ${mode}`
  );
}

@Injectable()
export class SelectedBackgroundRemovalProvider implements BackgroundRemovalProvider {
  readonly providerName = "selected";
  readonly processorVersion = "v1.0";

  constructor(
    private readonly lightweight: LightweightBackgroundRemovalProvider,
    private readonly removeBg: RemoveBgProvider
  ) {}

  isConfigured(): boolean {
    try {
      return this.selected().isConfigured();
    } catch {
      return false;
    }
  }

  removeBackground(input: BackgroundRemovalInput): Promise<BackgroundRemovalResult> {
    return this.selected().removeBackground(input);
  }

  private selected(): BackgroundRemovalProvider {
    const mode = resolveBackgroundRemovalMode(process.env.BACKGROUND_REMOVAL_PROVIDER, {
      lightweight: this.lightweight.isConfigured(),
      removeBg: this.removeBg.isConfigured()
    });
    return mode === "lightweight" ? this.lightweight : this.removeBg;
  }
}
