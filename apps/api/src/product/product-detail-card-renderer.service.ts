import { Injectable } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import satori from "satori";
import sharp from "sharp";

export const PRODUCT_DETAIL_TEMPLATE_VERSION = "product-detail-cards-v2";

type CardRow = { label: string; value: string };

export type MeasurementTemplate =
  | "TOP_TEMPLATE"
  | "DRESS_TEMPLATE"
  | "PANTS_TEMPLATE"
  | "JACKET_TEMPLATE"
  | "KIDS_TOP_TEMPLATE"
  | "KIDS_PANTS_TEMPLATE";

@Injectable()
export class ProductDetailCardRendererService {
  private fontPromise?: Promise<ArrayBuffer>;

  async measurementCard(input: {
    template: MeasurementTemplate;
    title: string;
    measurements: Record<string, number>;
  }): Promise<Buffer> {
    const svg = measurementTemplateSvg(input.template, input.title, input.measurements);
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
  if (category === "KIDS") {
    return subcategory === "KIDS_PANTS" ? "KIDS_PANTS_TEMPLATE" : "KIDS_TOP_TEMPLATE";
  }
  if (category === "DRESSES") return "DRESS_TEMPLATE";
  if (category === "PANTS" || category === "SHORT") return "PANTS_TEMPLATE";
  if (category === "JACKETS" || category === "OUTERWEAR") return "JACKET_TEMPLATE";
  return "TOP_TEMPLATE";
}

function measurementTemplateSvg(
  template: MeasurementTemplate,
  title: string,
  measurements: Record<string, number>
): string {
  const pants = template.includes("PANTS");
  const dress = template === "DRESS_TEMPLATE";
  const ordered = pants
    ? ["OUTSEAM", "WAIST", "HIP", "THIGH_WIDTH", "LEG_OPENING", "INSEAM"]
    : dress
      ? ["LENGTH", "CHEST_WIDTH", "WAIST", "HIP", "SHOULDER_WIDTH", "SLEEVE_LENGTH"]
      : ["LENGTH", "CHEST_WIDTH", "SHOULDER_WIDTH", "SLEEVE_LENGTH"];
  const rows = ordered
    .filter((key) => Number.isFinite(measurements[key]))
    .map((key, index) => {
      const letter = String.fromCharCode(65 + index);
      return `<text x="700" y="${330 + index * 82}" font-size="29" fill="#171717">${letter}  ${escapeXml(label(key))}: ${measurements[key]} cm</text>`;
    })
    .join("");
  const outline = pants ? pantsOutline() : dress ? dressOutline() : topOutline(template === "JACKET_TEMPLATE");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
    <rect width="1200" height="1200" fill="#fff"/>
    <text x="72" y="88" font-family="DejaVu Sans, sans-serif" font-size="24" fill="#1f6f5f">MEASUREMENT GUIDE</text>
    <text x="72" y="150" font-family="DejaVu Sans, sans-serif" font-size="42" fill="#171717">${escapeXml(title)}</text>
    <g transform="translate(80 240)" stroke="#737373" stroke-width="5" fill="#f3f3f3" stroke-linejoin="round">${outline}</g>
    <g font-family="DejaVu Sans, sans-serif">${rows || '<text x="700" y="330" font-size="29" fill="#737373">Use the product measurements table.</text>'}</g>
    <text x="700" y="1030" font-family="DejaVu Sans, sans-serif" font-size="22" fill="#737373">All values are flat garment measurements.</text>
  </svg>`;
}

function topOutline(jacket: boolean): string {
  return `<path d="M180 80 L290 35 L380 80 L505 155 L450 290 L390 245 L390 720 L80 720 L80 245 L20 290 L-35 155 Z"/>
    ${jacket ? '<path d="M235 65 L235 720" fill="none"/><path d="M180 80 L235 160 L290 80" fill="none"/>' : '<path d="M180 80 Q235 155 290 80" fill="none"/>'}
    <path d="M80 325 L390 325" fill="none" stroke-dasharray="12 10"/>
    <text x="220" y="315" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">B</text>
    <path d="M80 52 L390 52" fill="none" stroke-dasharray="12 10"/><text x="220" y="42" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">C</text>
    <path d="M410 100 L510 280" fill="none" stroke-dasharray="12 10"/><text x="490" y="175" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">D</text>
    <path d="M50 80 L50 720" fill="none" stroke-dasharray="12 10"/><text x="20" y="420" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">A</text>`;
}

function dressOutline(): string {
  return `<path d="M155 55 L270 55 L350 145 L305 270 L270 235 L300 430 L430 800 L-5 800 L125 430 L155 235 L110 270 L65 145 Z"/>
    <path d="M110 330 L310 330 M125 430 L300 430 M75 570 L355 570" fill="none" stroke-dasharray="12 10"/>
    <text x="205" y="320" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">B</text><text x="205" y="420" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">C</text><text x="205" y="560" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">D</text>
    <path d="M35 55 L35 800" fill="none" stroke-dasharray="12 10"/><text x="5" y="430" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">A</text>`;
}

function pantsOutline(): string {
  return `<path d="M65 40 L395 40 L365 780 L245 780 L225 340 L205 780 L85 780 Z"/>
    <path d="M65 80 L395 80 M85 230 L375 230 M85 310 L220 310 M85 750 L200 750 M245 750 L365 750" fill="none" stroke-dasharray="12 10"/>
    <text x="220" y="70" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">B</text><text x="220" y="220" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">C</text><text x="145" y="300" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">D</text><text x="135" y="740" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">E</text>
    <path d="M35 40 L35 780" fill="none" stroke-dasharray="12 10"/><text x="5" y="420" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">A</text>
    <path d="M235 340 L235 780" fill="none" stroke-dasharray="12 10"/><text x="245" y="560" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">F</text>`;
}

function label(key: string): string {
  return ({
    LENGTH: "Length",
    OUTSEAM: "Outseam",
    CHEST_WIDTH: "Chest width",
    SHOULDER_WIDTH: "Shoulder width",
    SLEEVE_LENGTH: "Sleeve length",
    WAIST: "Waist width",
    HIP: "Hip width",
    THIGH_WIDTH: "Thigh width",
    LEG_OPENING: "Leg opening",
    INSEAM: "Inseam"
  } as Record<string, string>)[key] ?? key;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]!);
}
