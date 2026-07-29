import { Injectable, InternalServerErrorException } from "@nestjs/common";

const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface AccessTokenResponse {
  access_token?: string;
}

@Injectable()
export class ProductImageStorageService {
  readonly bucket = process.env.PRODUCT_IMAGE_BUCKET?.trim() ?? "";

  validate(contentType: string | undefined, size: number) {
    if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new InternalServerErrorException("Only JPEG, PNG and WEBP images are supported");
    }
    if (size <= 0 || size > MAX_IMAGE_BYTES) {
      throw new InternalServerErrorException("Image must be between 1 byte and 10 MB");
    }
    if (!this.bucket) {
      throw new InternalServerErrorException("PRODUCT_IMAGE_BUCKET is not configured");
    }
  }

  objectName(productId: string, imageId: string, contentType: string): string {
    const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    return `staging/products/${productId}/${imageId}.${extension}`;
  }

  async upload(objectName: string, contentType: string, body: Buffer): Promise<void> {
    this.validate(contentType, body.length);
    const token = await this.accessToken();
    const url = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o`);
    url.searchParams.set("uploadType", "media");
    url.searchParams.set("name", objectName);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType,
        "Content-Length": String(body.length),
        "Cache-Control": "private, max-age=31536000, immutable"
      },
      body
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new InternalServerErrorException(`Image upload failed: ${response.status} ${detail}`);
    }
  }

  async download(objectName: string): Promise<{ body: ArrayBuffer; contentType: string }> {
    if (!this.bucket) {
      throw new InternalServerErrorException("PRODUCT_IMAGE_BUCKET is not configured");
    }
    const token = await this.accessToken();
    const objectPath = encodeURIComponent(objectName);
    const response = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${objectPath}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) {
      throw new InternalServerErrorException(`Image download failed: ${response.status}`);
    }
    return {
      body: await response.arrayBuffer(),
      contentType: response.headers.get("content-type") ?? "application/octet-stream"
    };
  }

  private async accessToken(): Promise<string> {
    const response = await fetch(METADATA_TOKEN_URL, {
      headers: { "Metadata-Flavor": "Google" }
    });
    if (!response.ok) {
      throw new InternalServerErrorException("Unable to obtain Cloud Storage access token");
    }
    const payload = (await response.json()) as AccessTokenResponse;
    if (!payload.access_token) {
      throw new InternalServerErrorException("Cloud Storage access token was empty");
    }
    return payload.access_token;
  }
}
