import type { ImageProcessingFailureCode } from "@online-saler/shared-types";

export interface BackgroundRemovalInput {
  body: Buffer;
  contentType: string;
  filename: string;
}

export interface BackgroundRemovalResult {
  body: Buffer;
  contentType: "image/png";
  provider: string;
  processorVersion: string;
  method?: string;
  qualityScore?: number;
  qualityIssues?: string[];
}

export interface BackgroundRemovalProvider {
  readonly providerName: string;
  readonly processorVersion: string;
  isConfigured(): boolean;
  removeBackground(input: BackgroundRemovalInput): Promise<BackgroundRemovalResult>;
}

export class BackgroundRemovalProviderError extends Error {
  constructor(
    readonly code: ImageProcessingFailureCode,
    message: string
  ) {
    super(message);
    this.name = "BackgroundRemovalProviderError";
  }
}
