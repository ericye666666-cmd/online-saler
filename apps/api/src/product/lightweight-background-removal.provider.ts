import { Injectable } from "@nestjs/common";
import {
  BackgroundRemovalProviderError,
  type BackgroundRemovalInput,
  type BackgroundRemovalProvider,
  type BackgroundRemovalResult
} from "./background-removal.provider";
import { ProductImageStorageService } from "./product-image-storage.service";

const IDENTITY_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

@Injectable()
export class LightweightBackgroundRemovalProvider implements BackgroundRemovalProvider {
  readonly providerName = "lightweight-opencv";
  readonly processorVersion = "v1.0";

  private readonly timeoutMs = 120_000;
  private templatePromise:
    | Promise<{ body: Buffer; contentType: string; filename: string } | null>
    | undefined;

  constructor(private readonly storage: ProductImageStorageService) {}

  isConfigured(): boolean {
    return Boolean(this.serviceUrl());
  }

  async removeBackground(input: BackgroundRemovalInput): Promise<BackgroundRemovalResult> {
    const serviceUrl = this.serviceUrl();
    if (!serviceUrl) {
      throw new BackgroundRemovalProviderError(
        "PROCESSOR_NOT_CONFIGURED",
        "LIGHTWEIGHT_CUTOUT_SERVICE_URL is not configured"
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const form = new FormData();
      form.append(
        "image_file",
        this.toBlob(input.body, input.contentType),
        input.filename
      );

      const template = await this.backgroundTemplate();
      if (template) {
        form.append(
          "background_template",
          this.toBlob(template.body, template.contentType),
          template.filename
        );
      }

      const response = await fetch(`${serviceUrl}/remove-background`, {
        method: "POST",
        headers: await this.authorizationHeaders(serviceUrl),
        body: form,
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        const code = response.status === 400 || response.status === 413 || response.status === 415 || response.status === 422
          ? "PROCESSOR_REJECTED_IMAGE"
          : response.status === 408 || response.status === 504
            ? "PROCESSOR_TIMEOUT"
            : "UNKNOWN";
        throw new BackgroundRemovalProviderError(
          code,
          `Lightweight cutout failed: ${response.status} ${detail || response.statusText}`
        );
      }

      const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
      if (contentType !== "image/png") {
        throw new BackgroundRemovalProviderError(
          "PROCESSOR_REJECTED_IMAGE",
          `Lightweight cutout returned unsupported content type: ${contentType ?? "missing"}`
        );
      }

      const qualityScoreHeader = response.headers.get("x-cutout-quality-score");
      const qualityScore = qualityScoreHeader === null ? undefined : Number(qualityScoreHeader);
      const qualityIssues = (response.headers.get("x-cutout-quality-issues") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

      return {
        body: Buffer.from(await response.arrayBuffer()),
        contentType: "image/png",
        provider: this.providerName,
        processorVersion: this.processorVersion,
        method: response.headers.get("x-cutout-method") ?? undefined,
        qualityScore: Number.isFinite(qualityScore) ? qualityScore : undefined,
        qualityIssues
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

  private serviceUrl(): string {
    return (process.env.LIGHTWEIGHT_CUTOUT_SERVICE_URL ?? "").trim().replace(/\/$/, "");
  }

  private async authorizationHeaders(serviceUrl: string): Promise<Record<string, string>> {
    const mode = (process.env.LIGHTWEIGHT_CUTOUT_AUTH_MODE ?? "google_identity")
      .trim()
      .toLowerCase();

    if (mode === "none") return {};
    if (mode === "bearer") {
      const token = process.env.LIGHTWEIGHT_CUTOUT_BEARER_TOKEN?.trim();
      if (!token) {
        throw new BackgroundRemovalProviderError(
          "PROCESSOR_NOT_CONFIGURED",
          "LIGHTWEIGHT_CUTOUT_BEARER_TOKEN is not configured"
        );
      }
      return { Authorization: `Bearer ${token}` };
    }
    if (mode !== "google_identity") {
      throw new BackgroundRemovalProviderError(
        "PROCESSOR_NOT_CONFIGURED",
        `Unsupported LIGHTWEIGHT_CUTOUT_AUTH_MODE: ${mode}`
      );
    }

    const url = new URL(IDENTITY_TOKEN_URL);
    url.searchParams.set("audience", serviceUrl);
    url.searchParams.set("format", "full");
    const response = await fetch(url, { headers: { "Metadata-Flavor": "Google" } });
    if (!response.ok) {
      throw new BackgroundRemovalProviderError(
        "PROCESSOR_NOT_CONFIGURED",
        `Unable to obtain Cloud Run identity token: ${response.status}`
      );
    }
    const token = (await response.text()).trim();
    if (!token) {
      throw new BackgroundRemovalProviderError(
        "PROCESSOR_NOT_CONFIGURED",
        "Cloud Run identity token was empty"
      );
    }
    return { Authorization: `Bearer ${token}` };
  }

  private async backgroundTemplate(): Promise<{
    body: Buffer;
    contentType: string;
    filename: string;
  } | null> {
    const objectName = process.env.LIGHTWEIGHT_BACKGROUND_TEMPLATE_OBJECT?.trim();
    if (!objectName) return null;

    if (!this.templatePromise) {
      this.templatePromise = this.storage.download(objectName).then((stored) => ({
        body: Buffer.from(stored.body),
        contentType: stored.contentType,
        filename: objectName.split("/").at(-1) || "background-template.png"
      }));
    }
    return this.templatePromise;
  }

  private toBlob(body: Buffer, contentType: string): Blob {
    const bytes = new Uint8Array(body.length);
    bytes.set(body);
    return new Blob([bytes.buffer], { type: contentType });
  }
}
