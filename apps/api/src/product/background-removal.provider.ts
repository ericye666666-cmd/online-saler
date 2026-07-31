export type BackgroundRemovalFailureCode =
  | "PROCESSOR_NOT_CONFIGURED"
  | "PROCESSOR_TIMEOUT"
  | "PROCESSOR_REJECTED_IMAGE"
  | "UNKNOWN";

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
  qualityScore?: number | null;
  qualityIssues?: string[];
  fallbackFrom?: string | null;
  fallbackReason?: string | null;
}

export interface BackgroundRemovalProvider {
  isConfigured(): boolean;
  removeBackground(input: BackgroundRemovalInput): Promise<BackgroundRemovalResult>;
}

export class BackgroundRemovalProviderError extends Error {
  constructor(
    readonly code: BackgroundRemovalFailureCode,
    message: string
  ) {
    super(message);
  }
}
