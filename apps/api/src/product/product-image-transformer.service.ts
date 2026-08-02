import { Injectable } from "@nestjs/common";
import sharp from "sharp";

export interface ProductImageTransformResult {
  body: Buffer;
  contentType: "image/png" | "image/jpeg";
  provider: string;
  processorVersion: string;
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
