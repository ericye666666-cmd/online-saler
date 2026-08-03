import { Injectable } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import satori from "satori";
import sharp from "sharp";

export const PRODUCT_DETAIL_TEMPLATE_VERSION = "product-detail-cards-v4";

type CardRow = { label: string; value: string };

export type MeasurementTemplate =
  | "TOP_TEMPLATE"
  | "DRESS_TEMPLATE"
  | "PANTS_TEMPLATE"
  | "SHORTS_TEMPLATE"
  | "SKIRT_TEMPLATE"
  | "SHIRT_TEMPLATE"
  | "HOODIE_TEMPLATE"
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
  const normalizedCategory = category?.toUpperCase() ?? "";
  const normalizedSubcategory = subcategory?.toUpperCase() ?? "";
  if (category === "KIDS") {
    return subcategory === "KIDS_PANTS" ? "KIDS_PANTS_TEMPLATE" : "KIDS_TOP_TEMPLATE";
  }
  if (normalizedCategory.includes("DRESS")) return "DRESS_TEMPLATE";
  if (normalizedCategory.includes("SKIRT")) return "SKIRT_TEMPLATE";
  if (normalizedCategory === "SHORT" || normalizedCategory.includes("SHORTS")) return "SHORTS_TEMPLATE";
  if (normalizedCategory.includes("PANT") || normalizedCategory.includes("TROUSER") || normalizedCategory.includes("JEAN")) return "PANTS_TEMPLATE";
  if (normalizedSubcategory.includes("HOOD") || normalizedCategory.includes("HOOD")) return "HOODIE_TEMPLATE";
  if (normalizedCategory.includes("JACKET") || normalizedCategory.includes("OUTERWEAR") || normalizedSubcategory.includes("JACKET")) return "JACKET_TEMPLATE";
  if (normalizedCategory.includes("SHIRT") || normalizedSubcategory.includes("SHIRT") || normalizedSubcategory.includes("BLOUSE")) return "SHIRT_TEMPLATE";
  return "TOP_TEMPLATE";
}

function measurementTemplateSvg(
  template: MeasurementTemplate,
  title: string,
  measurements: Record<string, number>
): string {
  const pants = template.includes("PANTS");
  const shorts = template === "SHORTS_TEMPLATE";
  const skirt = template === "SKIRT_TEMPLATE";
  const dress = template === "DRESS_TEMPLATE";
  const ordered = pants || shorts
    ? ["OUTSEAM", "WAIST", "HIP", "THIGH_WIDTH", "LEG_OPENING", "INSEAM"]
    : skirt
      ? ["LENGTH", "WAIST", "HIP", "HEM_WIDTH"]
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
  const outline = pants
    ? pantsOutline()
    : shorts
      ? shortsOutline()
      : skirt
        ? skirtOutline()
        : dress
          ? dressOutline()
          : topOutline(template);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
    <rect width="1200" height="1200" fill="#fff"/>
    <text x="72" y="88" font-family="DejaVu Sans, sans-serif" font-size="24" fill="#1f6f5f">MEASUREMENT GUIDE</text>
    <text x="72" y="150" font-family="DejaVu Sans, sans-serif" font-size="42" fill="#171717">${escapeXml(title)}</text>
    <g transform="translate(80 240)" stroke="#737373" stroke-width="5" fill="#f3f3f3" stroke-linejoin="round">${outline}</g>
    <g font-family="DejaVu Sans, sans-serif">${rows || '<text x="700" y="330" font-size="29" fill="#737373">Use the product measurements table.</text>'}</g>
    <text x="700" y="1030" font-family="DejaVu Sans, sans-serif" font-size="22" fill="#737373">All values are flat garment measurements.</text>
  </svg>`;
}

function topOutline(template: MeasurementTemplate): string {
  const jacket = template === "JACKET_TEMPLATE";
  const hoodie = template === "HOODIE_TEMPLATE";
  const shirt = template === "SHIRT_TEMPLATE";
  return `<path d="M150 95 L210 58 Q235 42 260 58 L320 95 L470 190 L415 330 L350 280 L350 720 L120 720 L120 280 L55 330 L0 190 Z"/>
    ${hoodie ? '<path d="M170 92 Q235 -25 300 92 Q275 145 235 155 Q195 145 170 92" fill="#ececec"/><path d="M215 130 L215 220 M255 130 L255 220" fill="none"/>' : jacket ? '<path d="M235 65 L235 720" fill="none"/><path d="M175 88 L235 165 L295 88" fill="none"/>' : shirt ? '<path d="M190 72 L235 125 L280 72 M205 88 L185 145 M265 88 L285 145" fill="none"/>' : '<path d="M190 72 Q235 125 280 72" fill="none"/>'}
    <path d="M80 325 L390 325" fill="none" stroke-dasharray="12 10"/>
    <text x="220" y="315" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">B</text>
    <path d="M80 52 L390 52" fill="none" stroke-dasharray="12 10"/><text x="220" y="42" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">C</text>
    <path d="M410 100 L510 280" fill="none" stroke-dasharray="12 10"/><text x="490" y="175" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">D</text>
    <path d="M50 80 L50 720" fill="none" stroke-dasharray="12 10"/><text x="20" y="420" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">A</text>`;
}

function shortsOutline(): string {
  return `<path d="M80 55 L390 55 L365 520 L255 520 L230 285 L205 520 L95 520 Z"/>
    <path d="M80 95 L390 95 M95 230 L375 230 M105 490 L200 490 M265 490 L360 490" fill="none" stroke-dasharray="12 10"/>
    <path d="M45 55 L45 520 M245 285 L245 520" fill="none" stroke-dasharray="12 10"/>
    <text x="220" y="85" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">B</text>
    <text x="220" y="220" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">C</text>
    <text x="145" y="480" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">E</text>`;
}

function skirtOutline(): string {
  return `<path d="M125 60 L345 60 L410 735 L60 735 Z"/>
    <path d="M125 100 L345 100 M105 330 L365 330 M60 700 L410 700" fill="none" stroke-dasharray="12 10"/>
    <path d="M25 60 L25 735" fill="none" stroke-dasharray="12 10"/>
    <text x="220" y="90" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">B</text>
    <text x="220" y="320" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">C</text>
    <text x="220" y="690" font-family="DejaVu Sans" font-size="28" fill="#555" stroke="none">D</text>`;
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
    INSEAM: "Inseam",
    HEM_WIDTH: "Hem width"
  } as Record<string, string>)[key] ?? key;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]!);
}
