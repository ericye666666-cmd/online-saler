/**
 * The picking sheet's content and its shelf ordering, with no React in sight.
 *
 * Split out from the dialog so the part that decides what a picker walks can be
 * tested by `node --test`: the component around it pulls in the whole operations
 * UI, and the ordering rule is the only thing here that can be wrong in a way
 * that costs someone an hour.
 */

import { t } from "../../i18n/runtime";

export type PickingLine = {
  locationCode: string;
  title: string;
  sizeLabel: string | null;
  barcode: string;
  orderNumber: string;
  destination: string;
};

/**
 * Shelf codes are like A-010203: rack, then bay, then level. Comparing them as
 * plain text is right when every code has the same shape and wrong the moment
 * one does not, so this compares them the way a person reads them — segment by
 * segment, numbers as numbers — and puts anything unparseable at the end, where
 * it is visible rather than silently sorted into the middle of the walk.
 */
export function compareShelfCodes(left: string, right: string): number {
  const missing = (value: string) => !value || value === "—";
  if (missing(left) || missing(right)) return missing(left) && missing(right) ? 0 : missing(left) ? 1 : -1;
  const parts = (value: string) => value.split(/[^0-9a-zA-Z]+/).filter(Boolean);
  const a = parts(left);
  const b = parts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const one = a[index];
    const two = b[index];
    if (one === undefined) return -1;
    if (two === undefined) return 1;
    const numeric = /^\d+$/.test(one) && /^\d+$/.test(two);
    const result = numeric ? Number(one) - Number(two) : one.localeCompare(two);
    if (result !== 0) return result;
  }
  return 0;
}

export function sortPickingLines(lines: PickingLine[]): PickingLine[] {
  return [...lines].sort((a, b) => compareShelfCodes(a.locationCode, b.locationCode) || a.orderNumber.localeCompare(b.orderNumber));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

/**
 * The sheet as a standalone document.
 *
 * Self-contained on purpose: it is printed inside an isolated iframe, so it
 * cannot inherit the app's stylesheet and must not depend on it. That also means
 * the print output cannot be broken by an unrelated change to the operations
 * theme, which is a good property for the one artefact that leaves the screen.
 */
export function pickingSheetHtml(lines: PickingLine[], printedAt: Date): string {
  const orders = new Set(lines.map((line) => line.orderNumber));
  const rows = lines.map((line) => `
    <tr>
      <td class="tick"></td>
      <td class="shelf">${escapeHtml(line.locationCode)}</td>
      <td>${escapeHtml(line.title)}${line.sizeLabel ? ` <span class="size">${escapeHtml(line.sizeLabel)}</span>` : ""}</td>
      <td class="mono">${escapeHtml(line.barcode)}</td>
      <td class="mono">${escapeHtml(line.orderNumber)}</td>
      <td>${escapeHtml(line.destination)}</td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>${escapeHtml(t("拣货单"))}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Noto Sans SC", "Segoe UI", system-ui, sans-serif; margin: 12mm 10mm; color: #111; }
  h1 { font-size: 18pt; margin: 0 0 2mm; }
  .meta { font-size: 10pt; color: #444; margin-bottom: 4mm; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th, td { border-bottom: 1px solid #bbb; padding: 2.4mm 2mm; text-align: left; vertical-align: top; }
  th { border-bottom: 1.5px solid #333; font-size: 9pt; text-transform: uppercase; letter-spacing: .04em; }
  .tick { width: 9mm; }
  .tick::before { content: ""; display: block; width: 5mm; height: 5mm; border: 1.2px solid #333; }
  .shelf { font-weight: 700; font-size: 12pt; white-space: nowrap; }
  .mono { font-family: "Consolas", "Menlo", monospace; white-space: nowrap; }
  .size { color: #555; }
  tfoot td { border: none; padding-top: 5mm; font-size: 9pt; color: #444; }
  /* A picker reads a row at a time; a row split across a page break is a row
     that gets missed. */
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  @page { size: A4; margin: 0; }
</style></head>
<body>
  <h1>${escapeHtml(t("拣货单"))}</h1>
  <div class="meta">
    ${escapeHtml(printedAt.toLocaleString("zh-CN"))} ·
    ${escapeHtml(t("{orders} 单 · {items} 件", { orders: orders.size, items: lines.length }))} ·
    ${escapeHtml(t("按货架位排序，从上往下走一遍"))}
  </div>
  <table>
    <thead><tr>
      <th></th><th>${escapeHtml(t("货架位"))}</th><th>${escapeHtml(t("商品"))}</th>
      <th>${escapeHtml(t("条码"))}</th><th>${escapeHtml(t("订单号"))}</th><th>${escapeHtml(t("目的地"))}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="6">${escapeHtml(t("拣完在作业台逐件扫码核对。这张纸不是凭证，扫码才是。"))}</td></tr></tfoot>
  </table>
</body></html>`;
}
