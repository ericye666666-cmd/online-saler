import QRCode from "qrcode";
import { encodeLabelRaster, packLabelPixels, type LabelRaster } from "../product/product-label-raster";
import { t } from "@/i18n/runtime";

/**
 * The parcel paperwork for an online order, printed on a strip of 60×40 mm
 * labels instead of one 75×130 mm sheet.
 *
 * The sheet was one page because a sheet can be. A roll cannot, so the same
 * content runs across consecutive labels: routing first, then the customer,
 * then the picking list. Nothing is dropped and nothing is summarised — the
 * strip carries what the sheet carried.
 *
 * Only the first label goes on the box. The rest travel with it, which is why
 * every label repeats the order number and its own position in the strip: a
 * label that comes loose on a warehouse floor has to be traceable to its parcel
 * without reading the QR.
 *
 * A QR rather than Code 128 for the package code: 18 characters needs 506
 * printer dots as bars, 26 more than a 60 mm label has, and bars cannot be
 * narrowed below two dots and stay readable. The same string is a 16 mm square.
 */

export const FULFILLMENT_LABEL_WIDTH = 480;
export const FULFILLMENT_LABEL_HEIGHT = 320;

/**
 * Drawn at whole dots so the QR has hard edges under a thermal head. Six dots a
 * module puts the code at about 16 mm, which a phone reads at arm's length
 * without it dominating the label.
 */
const QR_MODULE_DOTS = 6;
const QR_QUIET_MODULES = 2;
/** A QR hard against the die-cut edge loses the margin a scanner needs. */
const QR_RIGHT_MARGIN_DOTS = 16;

/** Four lines of item fit under a header without crowding the tick boxes. */
const ITEMS_PER_LABEL = 4;

export type FulfillmentLabelItem = {
  title: string;
  sizeLabel?: string | null;
  barcode?: string | null;
};

export type FulfillmentLabelInput = {
  nodeName: string;
  packageCode: string;
  orderNumber: string;
  isDelivery: boolean;
  itemCount: number;
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryArea?: string | null;
  deliveryAddress?: string | null;
  items?: readonly FulfillmentLabelItem[];
};

export type FulfillmentLabelSheet = {
  /** 1-based position in the strip, for the header and the print progress. */
  index: number;
  total: number;
  kind: "routing" | "customer" | "picking";
  preview: string;
  raster: LabelRaster;
};

type Pen = CanvasRenderingContext2D;

function font(ctx: Pen, size: number, bold = false): void {
  ctx.font = `${bold ? "bold " : ""}${size}px Arial, 'Microsoft YaHei', sans-serif`;
}

/** Largest size at or below `max` that keeps the text inside `width`. */
function fitFont(ctx: Pen, text: string, width: number, max: number, min = 14, bold = true): number {
  for (let size = max; size > min; size -= 2) {
    font(ctx, size, bold);
    if (ctx.measureText(text).width <= width) return size;
  }
  font(ctx, min, bold);
  return min;
}

function clip(ctx: Pen, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let value = text;
  while (value.length > 1 && ctx.measureText(`${value}…`).width > width) value = value.slice(0, -1);
  return `${value}…`;
}

/** Greedy wrap. Falls back to breaking a single long word so nothing vanishes. */
function wrap(ctx: Pen, text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= width) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    while (ctx.measureText(current).width > width && current.length > 1) {
      let cut = current.length;
      while (cut > 1 && ctx.measureText(current.slice(0, cut)).width > width) cut -= 1;
      lines.push(current.slice(0, cut));
      current = current.slice(cut);
    }
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  const last = lines.length - 1;
  if (last >= 0 && lines.length === maxLines) lines[last] = clip(ctx, lines[last]!, width);
  return lines;
}

function newCanvas(): { canvas: HTMLCanvasElement; ctx: Pen } {
  const canvas = document.createElement("canvas");
  canvas.width = FULFILLMENT_LABEL_WIDTH;
  canvas.height = FULFILLMENT_LABEL_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t("浏览器无法生成面单预览，请使用电脑端 Chrome 或 Edge。"));
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, FULFILLMENT_LABEL_WIDTH, FULFILLMENT_LABEL_HEIGHT);
  ctx.fillStyle = "black";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  return { canvas, ctx };
}

/** Order number on the left, position on the right, rule underneath. */
function header(ctx: Pen, orderNumber: string, index: number, total: number, caption?: string): void {
  font(ctx, 18);
  ctx.fillText(clip(ctx, caption ? `${orderNumber}  ${caption}` : orderNumber, 360), 16, 26);
  ctx.textAlign = "right";
  ctx.fillText(`${index}/${total}`, FULFILLMENT_LABEL_WIDTH - 16, 26);
  ctx.textAlign = "left";
  ctx.fillRect(16, 36, FULFILLMENT_LABEL_WIDTH - 32, 2);
}

function finish(canvas: HTMLCanvasElement, ctx: Pen): { preview: string; raster: LabelRaster } {
  const pixels = packLabelPixels(ctx.getImageData(0, 0, FULFILLMENT_LABEL_WIDTH, FULFILLMENT_LABEL_HEIGHT).data);
  // The preview is the bits the printer receives, not a smoothed approximation.
  const monochrome = ctx.createImageData(FULFILLMENT_LABEL_WIDTH, FULFILLMENT_LABEL_HEIGHT);
  for (let pixel = 0; pixel < FULFILLMENT_LABEL_WIDTH * FULFILLMENT_LABEL_HEIGHT; pixel += 1) {
    const value = (pixels[pixel >> 3]! & (128 >> (pixel % 8))) ? 0 : 255;
    monochrome.data.set([value, value, value, 255], pixel * 4);
  }
  ctx.putImageData(monochrome, 0, 0);
  return {
    preview: canvas.toDataURL("image/png"),
    raster: { width: FULFILLMENT_LABEL_WIDTH, height: FULFILLMENT_LABEL_HEIGHT, data: encodeLabelRaster(pixels) }
  };
}

/** Label 1: the only one that goes on the box. */
function routingLabel(input: FulfillmentLabelInput, index: number, total: number) {
  const { canvas, ctx } = newCanvas();
  header(ctx, input.orderNumber, index, total);

  const qr = QRCode.create(input.packageCode, { errorCorrectionLevel: "M" });
  const modules = qr.modules.size;
  const block = modules * QR_MODULE_DOTS + QR_QUIET_MODULES * 2 * QR_MODULE_DOTS;
  const qrLeft = FULFILLMENT_LABEL_WIDTH - block - QR_RIGHT_MARGIN_DOTS;
  const qrTop = 56;
  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      if (!qr.modules.get(row, column)) continue;
      ctx.fillRect(
        qrLeft + (QR_QUIET_MODULES + column) * QR_MODULE_DOTS,
        qrTop + (QR_QUIET_MODULES + row) * QR_MODULE_DOTS,
        QR_MODULE_DOTS,
        QR_MODULE_DOTS
      );
    }
  }
  font(ctx, 14);
  ctx.textAlign = "center";
  ctx.fillText(clip(ctx, input.packageCode, block + 40), qrLeft + block / 2, qrTop + block + 18);
  ctx.textAlign = "left";

  const column = qrLeft - 28;
  const node = input.nodeName.trim().toUpperCase() || "—";
  const nodeSize = fitFont(ctx, node, column, 58, 22);
  ctx.fillText(node, 16, 56 + nodeSize);

  // A box, not a colour: a thermal head only prints black.
  const method = input.isDelivery ? t("DELIVERY") : t("CUSTOMER PICKUP");
  const boxTop = 168;
  const boxHeight = 54;
  const methodSize = fitFont(ctx, method, column - 24, 28, 15);
  const boxWidth = Math.min(column, ctx.measureText(method).width + 28);
  ctx.lineWidth = 4;
  ctx.strokeRect(18, boxTop + 2, boxWidth, boxHeight);
  ctx.fillText(method, 32, boxTop + boxHeight / 2 + methodSize / 2 - 2);

  font(ctx, 22, true);
  const items = `${input.itemCount} ${input.itemCount === 1 ? t("item") : t("items")}`;
  ctx.fillText(`${items}   ${t("PAID")}`, 16, 280);

  return { ...finish(canvas, ctx), index, total, kind: "routing" as const };
}

/** Label 2: who to hand it to, and the number to ring when nobody answers. */
function customerLabel(input: FulfillmentLabelInput, index: number, total: number) {
  const { canvas, ctx } = newCanvas();
  header(ctx, input.orderNumber, index, total, input.isDelivery ? t("DELIVERY") : t("PICKUP"));

  const width = FULFILLMENT_LABEL_WIDTH - 32;
  const name = input.customerName?.trim() || t("Customer");
  const nameSize = fitFont(ctx, name, width, 40, 20);
  ctx.fillText(name, 16, 36 + nameSize + 12);

  const phone = input.customerPhone?.trim();
  if (phone) {
    const phoneSize = fitFont(ctx, phone, width, 42, 22);
    ctx.fillText(phone, 16, 152 + phoneSize / 2);
  }

  if (input.isDelivery) {
    const area = input.deliveryArea?.trim();
    if (area) {
      font(ctx, 22, true);
      ctx.fillText(clip(ctx, area, width), 16, 214);
    }
    const address = input.deliveryAddress?.trim();
    if (address) {
      font(ctx, 20);
      const lines = wrap(ctx, address, width, area ? 3 : 4);
      lines.forEach((line, row) => ctx.fillText(line, 16, (area ? 244 : 218) + row * 26));
    }
  } else {
    font(ctx, 24, true);
    ctx.fillText(t("Collects at"), 16, 218);
    const node = input.nodeName.trim().toUpperCase() || "—";
    const nodeSize = fitFont(ctx, node, width, 40, 20);
    ctx.fillText(node, 16, 230 + nodeSize);
  }

  return { ...finish(canvas, ctx), index, total, kind: "customer" as const };
}

/** Labels 3..n: the picking list, ticked off against each garment's own barcode. */
function pickingLabel(
  input: FulfillmentLabelInput,
  slice: readonly FulfillmentLabelItem[],
  firstItemNumber: number,
  index: number,
  total: number
) {
  const { canvas, ctx } = newCanvas();
  header(ctx, input.orderNumber, index, total, t("PICKING"));

  const width = FULFILLMENT_LABEL_WIDTH - 32;
  slice.forEach((item, row) => {
    const top = 52 + row * 68;
    ctx.lineWidth = 3;
    ctx.strokeRect(18, top + 2, 26, 26);

    font(ctx, 22, true);
    ctx.fillText(clip(ctx, `${firstItemNumber + row}. ${item.title}`, width - 44), 56, top + 24);

    const detail = [item.sizeLabel?.trim(), item.barcode?.trim()].filter(Boolean).join("  ·  ");
    if (detail) {
      font(ctx, 18);
      ctx.fillText(clip(ctx, detail, width - 44), 56, top + 50);
    }
  });

  return { ...finish(canvas, ctx), index, total, kind: "picking" as const };
}

/**
 * The whole strip, in the order it comes off the roll. The count is derived
 * from the order rather than fixed: a one-item pickup is three labels, a twelve
 * item delivery is five.
 */
export function renderFulfillmentLabels(input: FulfillmentLabelInput): FulfillmentLabelSheet[] {
  // The routing sticker is a QR of the package code and nothing else. Without
  // one there is no label to print, and the QR encoder's own complaint ("No
  // input text") tells a packer nothing about what to do next.
  if (!input.packageCode?.trim()) {
    throw new Error(`${input.orderNumber || "This order"} has no package code yet. Route it to a store and pack it, then the label can print.`);
  }
  const items = input.items ?? [];
  const pages: FulfillmentLabelItem[][] = [];
  for (let start = 0; start < items.length; start += ITEMS_PER_LABEL) {
    pages.push(items.slice(start, start + ITEMS_PER_LABEL));
  }
  const total = 2 + pages.length;

  const sheets: FulfillmentLabelSheet[] = [routingLabel(input, 1, total), customerLabel(input, 2, total)];
  pages.forEach((page, pageIndex) => {
    sheets.push(pickingLabel(input, page, pageIndex * ITEMS_PER_LABEL + 1, 3 + pageIndex, total));
  });
  return sheets;
}
