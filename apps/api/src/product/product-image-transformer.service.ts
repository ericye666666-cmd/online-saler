import { Injectable } from "@nestjs/common";
import sharp from "sharp";

import type { ProductImageUploadRotation } from "./product-image-upload-orientation";

export interface ProductImageTransformResult {
  body: Buffer;
  contentType: "image/png" | "image/jpeg";
  provider: string;
  processorVersion: string;
  widthPx: number;
  heightPx: number;
}

const STOREFRONT_CANVAS_SIZE = 1200;
const STOREFRONT_SUBJECT_SIZE = 1080;

// Display framing: the subject fills the same share of every card, so a rail of
// cards reads as one catalogue instead of a set of unrelated photographs.
const DISPLAY_CANVAS_SIZE = 1200;
const DISPLAY_SUBJECT_SIZE = 1000;
// A white garment on white can trim away to nothing; below this share of the
// original the trim is treated as a miss and the untrimmed image is framed.
const MIN_TRIM_RETENTION = 0.2;

@Injectable()
export class ProductImageTransformerService {
  async orientUploadedImage(
    input: Buffer,
    contentType: string,
    rotation: ProductImageUploadRotation
  ): Promise<Buffer> {
    const pipeline = sharp(input).autoOrient().rotate(rotation);
    if (contentType === "image/png") {
      return pipeline.png({ compressionLevel: 9 }).toBuffer();
    }
    if (contentType === "image/webp") {
      return pipeline.webp({ quality: 95 }).toBuffer();
    }
    return pipeline.jpeg({ quality: 98, chromaSubsampling: "4:4:4" }).toBuffer();
  }

  async composeWhiteBackground(input: Buffer): Promise<ProductImageTransformResult> {
    const subject = await sharp(input)
      .rotate()
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 2 })
      .resize(STOREFRONT_SUBJECT_SIZE, STOREFRONT_SUBJECT_SIZE, {
        fit: "inside",
        withoutEnlargement: false
      })
      .png()
      .toBuffer({ resolveWithObject: true });
    const left = Math.floor((STOREFRONT_CANVAS_SIZE - subject.info.width) / 2);
    const right = STOREFRONT_CANVAS_SIZE - subject.info.width - left;
    const top = Math.floor((STOREFRONT_CANVAS_SIZE - subject.info.height) / 2);
    const bottom = STOREFRONT_CANVAS_SIZE - subject.info.height - top;
    const data = await sharp(subject.data)
      .extend({ top, bottom, left, right, background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
      .toBuffer();

    return this.result(data, "image/jpeg", STOREFRONT_CANVAS_SIZE, STOREFRONT_CANVAS_SIZE);
  }

  /**
   * Give a generated display image the same framing as every other one.
   *
   * The image model decides its own composition, so one product filled 26% of
   * the frame while the next filled 55% and a third touched the edge. Trimming
   * back to the subject and re-padding to a fixed size makes the margin
   * identical on every card.
   */
  async normalizeDisplayFraming(
    generated: ProductImageTransformResult
  ): Promise<ProductImageTransformResult> {
    const subject = await this.trimToSubject(generated.body);
    const data = await this.centreOnWhite(subject.data, subject.info.width, subject.info.height);
    return {
      ...generated,
      body: data,
      contentType: "image/jpeg",
      processorVersion: `${generated.processorVersion}+framed-${DISPLAY_SUBJECT_SIZE}of${DISPLAY_CANVAS_SIZE}`,
      widthPx: DISPLAY_CANVAS_SIZE,
      heightPx: DISPLAY_CANVAS_SIZE
    };
  }

  private async trimToSubject(input: Buffer): Promise<{ data: Buffer; info: { width: number; height: number } }> {
    const source = sharp(input).rotate();
    const { width = 0, height = 0 } = await source.metadata();
    const scale = (result: { info: { width: number; height: number } }) =>
      width > 0 && height > 0
        ? Math.min(result.info.width / width, result.info.height / height)
        : 1;

    try {
      const trimmed = await sharp(input)
        .rotate()
        .trim({ background: "#ffffff", threshold: 12 })
        .toBuffer({ resolveWithObject: true });
      if (scale(trimmed) >= MIN_TRIM_RETENTION) return this.fitSubject(trimmed.data);
    } catch {
      // sharp throws when a trim would leave nothing at all; fall through.
    }
    return this.fitSubject(await sharp(input).rotate().toBuffer());
  }

  private async fitSubject(input: Buffer) {
    const { data, info } = await sharp(input)
      .resize(DISPLAY_SUBJECT_SIZE, DISPLAY_SUBJECT_SIZE, { fit: "inside", withoutEnlargement: false })
      .png()
      .toBuffer({ resolveWithObject: true });
    return { data, info };
  }

  private async centreOnWhite(subject: Buffer, width: number, height: number): Promise<Buffer> {
    const left = Math.floor((DISPLAY_CANVAS_SIZE - width) / 2);
    const top = Math.floor((DISPLAY_CANVAS_SIZE - height) / 2);
    return sharp(subject)
      .extend({
        top,
        bottom: DISPLAY_CANVAS_SIZE - height - top,
        left,
        right: DISPLAY_CANVAS_SIZE - width - left,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
      .toBuffer();
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
      processorVersion: "sharp-v2-centered-white",
      widthPx,
      heightPx
    };
  }
}
