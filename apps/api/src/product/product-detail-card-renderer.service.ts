import { Injectable } from "@nestjs/common";
import {
  PRODUCT_DETAIL_MEASUREMENT_TEMPLATES,
  PRODUCT_DETAIL_MEASUREMENT_TEMPLATE_VERSION,
  renderProductDetailMeasurementGuideSvg,
  selectProductDetailMeasurementTemplate,
  type ProductDetailMeasurementTemplateCode
} from "@online-saler/business-rules";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import satori from "satori";
import sharp from "sharp";

export const PRODUCT_DETAIL_TEMPLATE_VERSION = PRODUCT_DETAIL_MEASUREMENT_TEMPLATE_VERSION;

type CardRow = { label: string; value: string };

export type MeasurementTemplate = ProductDetailMeasurementTemplateCode;

@Injectable()
export class ProductDetailCardRendererService {
  private fontPromise?: Promise<ArrayBuffer>;

  async measurementCard(input: {
    template: MeasurementTemplate;
    title: string;
    measurements: Record<string, number>;
  }): Promise<Buffer> {
    const svg = renderProductDetailMeasurementGuideSvg({
      template: PRODUCT_DETAIL_MEASUREMENT_TEMPLATES[input.template],
      title: input.title,
      measurements: input.measurements
    });
    return sharp(Buffer.from(svg)).webp({ quality: 92 }).toBuffer();
  }

  async informationCard(input: {
    eyebrow: string;
    title: string;
    rows: CardRow[];
    note?: string | null;
    accent?: string;
  }): Promise<Buffer> {
    const font = await this.font();
    const node = {
      type: "div",
      props: {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#ffffff",
          color: "#171717",
          padding: "72px",
          fontFamily: "Noto Sans"
        },
        children: [
          {
            type: "div",
            props: {
              style: { display: "flex", fontSize: "24px", color: input.accent ?? "#1f6f5f", marginBottom: "16px" },
              children: input.eyebrow.toUpperCase()
            }
          },
          {
            type: "div",
            props: {
              style: { display: "flex", fontSize: "48px", lineHeight: 1.15, marginBottom: "44px" },
              children: input.title
            }
          },
          {
            type: "div",
            props: {
              style: { display: "flex", flexDirection: "column", borderTop: "2px solid #dedede" },
              children: input.rows.map((row) => ({
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "32px",
                    padding: "22px 0",
                    borderBottom: "1px solid #e8e8e8",
                    fontSize: "27px"
                  },
                  children: [
                    { type: "div", props: { style: { display: "flex", color: "#656565" }, children: row.label } },
                    { type: "div", props: { style: { display: "flex", textAlign: "right" }, children: row.value } }
                  ]
                }
              }))
            }
          },
          input.note
            ? {
                type: "div",
                props: {
                  style: { display: "flex", marginTop: "auto", fontSize: "21px", lineHeight: 1.45, color: "#737373" },
                  children: input.note
                }
              }
            : null
        ].filter(Boolean)
      }
    };
    const svg = await satori(node as never, {
      width: 1200,
      height: 1200,
      fonts: [{ name: "Noto Sans", data: font, weight: 400, style: "normal" }]
    });
    return sharp(Buffer.from(svg)).webp({ quality: 92 }).toBuffer();
  }

  private font(): Promise<ArrayBuffer> {
    this.fontPromise ??= readFile(
      join(
        require.resolve("@fontsource/noto-sans/package.json"),
        "..",
        "files",
        "noto-sans-latin-400-normal.woff"
      )
    ).then((buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    return this.fontPromise;
  }
}

export function selectMeasurementTemplate(category: string | null, subcategory: string | null): MeasurementTemplate {
  return selectProductDetailMeasurementTemplate(category, subcategory).code;
}
