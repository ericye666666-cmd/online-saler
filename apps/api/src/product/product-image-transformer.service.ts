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
