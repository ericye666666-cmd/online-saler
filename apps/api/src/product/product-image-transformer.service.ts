import { Injectable } from "@nestjs/common";
import sharp from "sharp";

export interface ProductImageTransformResult {
  body: Buffer;
  contentType: "image/png" | "image/jpeg";
  provider: "deterministic-sharp";
  processorVersion: "sharp-v1" | "sharp-balanced-v1";
  widthPx: number;
  heightPx: number;
}

@Injectable()
export class ProductImageTransformerService {
  async composeWhiteBackground(input: Buffer): Promise<ProductImageTransformResult> {
    const { data, info } = await sharp(input)
      .rotate()
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
      .toBuffer({ resolveWithObject: true });

    return this.result(data, "image/jpeg", info.width, info.height);
  }

  async optimizeMainImage(input: Buffer): Promise<ProductImageTransformResult> {
    const trimmed = await sharp(input)
      .rotate()
      .trim({ background: "#ffffff", threshold: 12 })
      .resize(1032, 1032, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toBuffer({ resolveWithObject: true });
    const left = Math.floor((1200 - trimmed.info.width) / 2);
    const right = 1200 - trimmed.info.width - left;
    const top = Math.floor((1200 - trimmed.info.height) / 2);
    const bottom = 1200 - trimmed.info.height - top;
    const data = await sharp(trimmed.data)
      .extend({ top, bottom, left, right, background: "#ffffff" })
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toBuffer();

    return this.result(data, "image/jpeg", 1200, 1200);
  }

  async optimizeBalancedMainImage(input: Buffer): Promise<ProductImageTransformResult> {
    const normalized = await sharp(input).rotate().ensureAlpha().png().toBuffer();
    const { data: pixels, info } = await sharp(normalized)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const bounds = opaqueBounds(pixels, info.width, info.height, info.channels);
    if (!bounds) throw new Error("Transparent cutout does not contain a visible garment");

    const subject = await sharp(normalized)
      .extract({
        left: bounds.left,
        top: bounds.top,
        width: bounds.right - bounds.left + 1,
        height: bounds.bottom - bounds.top + 1
      })
      .resize(1032, 1032, { fit: "inside", withoutEnlargement: false })
      .png()
      .toBuffer({ resolveWithObject: true });

    const scaleX = subject.info.width / (bounds.right - bounds.left + 1);
    const visualCenterX = (bounds.centerX - bounds.left) * scaleX;
    const desiredLeft = Math.round(600 - visualCenterX);
    const left = clamp(desiredLeft, 48, 1200 - subject.info.width - 48);
    const top = clamp(Math.round((1200 - subject.info.height) / 2), 48, 1200 - subject.info.height - 48);
    const data = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: "#ffffff" }
    })
      .composite([{ input: subject.data, left, top }])
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toBuffer();

    return {
      ...this.result(data, "image/jpeg", 1200, 1200),
      processorVersion: "sharp-balanced-v1"
    };
  }

  private result(
    body: Buffer,
    contentType: "image/png" | "image/jpeg",
    widthPx: number,
    heightPx: number
  ): ProductImageTransformResult {
    return {
      body,
      contentType,
      provider: "deterministic-sharp",
      processorVersion: "sharp-v1",
      widthPx,
      heightPx
    };
  }
}

function opaqueBounds(
  pixels: Buffer,
  width: number,
  height: number,
  channels: number
): { left: number; right: number; top: number; bottom: number; centerX: number } | null {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  let alphaTotal = 0;
  let weightedX = 0;
  const alphaIndex = channels - 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * channels + alphaIndex] ?? 0;
      if (alpha <= 8) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      alphaTotal += alpha;
      weightedX += x * alpha;
    }
  }

  if (right < left || bottom < top || alphaTotal === 0) return null;
  return { left, right, top, bottom, centerX: weightedX / alphaTotal };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
