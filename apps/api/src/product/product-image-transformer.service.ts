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
const DISPLAY_SUBJECT_SIZE = 1060;
// A white garment on white can trim away to nothing; below this share of the
// original the trim is treated as a miss and the untrimmed image is framed.
const MIN_TRIM_RETENTION = 0.2;
// The trim finds the subject by its difference from white, which stops short of
// the faint outer edge of a soft contact shadow. Keeping this much of the
// surrounding original, relative to the subject, lets the shadow fade out
// naturally instead of ending in a hard line against the white padding.
const SUBJECT_BLEED = 0.08;
// The model's "white" is 253-254 with a wide faint halo around the garment.
// Neutral pixels from WHITE_LIFT_FROM up are eased to pure white, reaching it at
// WHITE_LIFT_FULL, so the background matches the 255 canvas instead of showing
// as a faint box — most visibly on the storefront's tinted tiles, where the
// image is multiplied into the tile colour.
const WHITE_LIFT_FROM = 244;
const WHITE_LIFT_FULL = 252;
// Only near-grey pixels count as background; anything with more channel spread
// than this is coloured fabric and is never touched.
const NEUTRAL_SPREAD = 6;

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
      processorVersion: `${generated.processorVersion}+framed-v4-${DISPLAY_SUBJECT_SIZE}of${DISPLAY_CANVAS_SIZE}`,
      widthPx: DISPLAY_CANVAS_SIZE,
      heightPx: DISPLAY_CANVAS_SIZE
    };
  }

  private async trimToSubject(input: Buffer): Promise<{ data: Buffer; info: { width: number; height: number } }> {
    const oriented = await this.liftBackgroundToWhite(input);
    const { width, height } = oriented.info;

    try {
      const trimmed = await sharp(oriented.data)
        .trim({ background: "#ffffff", threshold: 12 })
        .toBuffer({ resolveWithObject: true });
      const subjectWidth = trimmed.info.width;
      const subjectHeight = trimmed.info.height;
      if (Math.min(subjectWidth / width, subjectHeight / height) >= MIN_TRIM_RETENTION) {
        const left = Math.abs(trimmed.info.trimOffsetLeft ?? 0);
        const top = Math.abs(trimmed.info.trimOffsetTop ?? 0);
        const bleed = Math.round(Math.max(subjectWidth, subjectHeight) * SUBJECT_BLEED);
        // Pad first so a subject near the edge gets the same bleed as one in the
        // middle; otherwise the clamp would change the subject's final size.
        const padded = await sharp(oriented.data)
          .extend({ top: bleed, bottom: bleed, left: bleed, right: bleed, background: "#ffffff" })
          .toBuffer();
        const regionWidth = subjectWidth + bleed * 2;
        const regionHeight = subjectHeight + bleed * 2;
        const region = await sharp(padded)
          .extract({ left, top, width: regionWidth, height: regionHeight })
          .removeAlpha()
          .toBuffer();
        return this.fitSubject(await this.featherIntoWhite(region, regionWidth, regionHeight, bleed));
      }
    } catch {
      // sharp throws when a trim would leave nothing at all; fall through.
    }
    return this.fitSubject(oriented.data);
  }

  private async liftBackgroundToWhite(input: Buffer): Promise<{ data: Buffer; info: { width: number; height: number } }> {
    const { data, info } = await sharp(input).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const span = WHITE_LIFT_FULL - WHITE_LIFT_FROM;
    for (let index = 0; index < data.length; index += 3) {
      const r = data[index], g = data[index + 1], b = data[index + 2];
      const low = Math.min(r, g, b);
      if (low < WHITE_LIFT_FROM || Math.max(r, g, b) - low > NEUTRAL_SPREAD) continue;
      const scale = (value: number) => Math.min(255, Math.round(WHITE_LIFT_FROM + (value - WHITE_LIFT_FROM) * (255 - WHITE_LIFT_FROM) / span));
      data[index] = scale(r);
      data[index + 1] = scale(g);
      data[index + 2] = scale(b);
    }
    const encoded = await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
    return { data: encoded, info: { width: info.width, height: info.height } };
  }

  /**
   * The model's white is 253-254, the canvas padding is 255. Butting them
   * together leaves a straight one- or two-level edge that the eye picks out
   * as a faint box around the product. Fading the outer half of the bleed band
   * to transparent lets the region dissolve into the white canvas instead. The
   * fade stops short of the subject's own bounding box, so no garment pixel is
   * touched.
   */
  private async featherIntoWhite(region: Buffer, width: number, height: number, bleed: number): Promise<Buffer> {
    const inset = Math.round(bleed * 0.5);
    const sigma = Math.max(0.3, bleed * 0.2);
    const mask = await sharp(Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
      + `<rect width="${width}" height="${height}" fill="#000"/>`
      + `<rect x="${inset}" y="${inset}" width="${Math.max(1, width - inset * 2)}" height="${Math.max(1, height - inset * 2)}" fill="#fff"/>`
      + "</svg>"
    ))
      .resize(width, height, { fit: "fill" })
      .blur(sigma)
      .extractChannel(0)
      .raw()
      .toBuffer();
    return sharp(region)
      .joinChannel(mask, { raw: { width, height, channels: 1 } })
      .png()
      .toBuffer();
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
