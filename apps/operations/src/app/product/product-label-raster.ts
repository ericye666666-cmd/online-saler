import JsBarcode from "jsbarcode";
import type { LabelPrintPayload } from "../local-label-print";
import { t } from "@/i18n/runtime";

export type LabelRaster = { width: 480; height: 320; data: string };
// TSPL BITMAP is packed MSB first, one bit per printer dot (1 = black).
export function packLabelPixels(rgba: Uint8ClampedArray): Uint8Array {
  if (rgba.length !== 480 * 320 * 4) throw new Error("Invalid label dimensions");
  const bytes = new Uint8Array(480 * 320 / 8);
  for (let pixel = 0; pixel < 480 * 320; pixel++) {
    const p = pixel * 4;
    if (rgba[p + 3]! > 127 && (rgba[p]! + rgba[p + 1]! + rgba[p + 2]!) < 384) bytes[pixel >> 3]! |= 128 >> (pixel % 8);
  }
  return bytes;
}

export function renderProductLabel(payload: LabelPrintPayload): { preview: string; raster: LabelRaster } {
  const canvas = document.createElement("canvas");
  canvas.width = 480; canvas.height = 320;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t("浏览器无法生成标签预览，请使用电脑端 Chrome 或 Edge。"));
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, 480, 320); ctx.fillStyle = "black";
  const label = payload.label_payload;
  function line(text: string, y: number, size: number, bold = false) {
    ctx!.font = `${bold ? "bold " : ""}${size}px Arial, 'Microsoft YaHei', sans-serif`;
    let value = text;
    while (ctx!.measureText(value).width > 432 && value.length > 1) value = value.slice(0, -1);
    ctx!.fillText(value === text ? value : value.slice(0, -1) + "…", 24, y);
  }
  line(label.title, 40, 24, true);
  line(`${label.category} / ${label.color}`, 69, 18);
  line(`SIZE ${label.size}   ${label.condition}`, 96, 20);
  line(t("货架 {location}", { location: label.location }), 137, 32, true);
  const bars = document.createElement("canvas");
  JsBarcode(bars, label.barcode_value, { format: "CODE128", displayValue: false, width: 2, height: 80, margin: 20, marginTop: 0, marginBottom: 0 });
  // Never stretch or compress bars: preserve two-dot modules and quiet zones.
  if (bars.width > 480) throw new Error(t("条码过长，无法在 60×40 标签上清晰打印。请联系管理员检查条码规则。"));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bars, Math.floor((480 - bars.width) / 2), 155);
  line(label.barcode_value, 260, 20);
  line(label.product_code, 290, 16);
  const pixels = packLabelPixels(ctx.getImageData(0, 0, 480, 320).data);
  // Preview uses exactly the same binary pixels sent to the printer.
  const monochrome = ctx.createImageData(480, 320);
  for (let p = 0; p < 480 * 320; p++) {
    const color = (pixels[p >> 3]! & (128 >> (p % 8))) ? 0 : 255;
    monochrome.data.set([color, color, color, 255], p * 4);
  }
  ctx.putImageData(monochrome, 0, 0);
  let binary = "";
  for (const byte of pixels) binary += String.fromCharCode(byte);
  return { preview: canvas.toDataURL("image/png"), raster: { width: 480, height: 320, data: btoa(binary) } };
}
