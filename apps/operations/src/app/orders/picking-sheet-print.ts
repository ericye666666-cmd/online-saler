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

  // How many garments each destination is owed. Printed at the end so the
  // packing bench can count its piles against a number instead of against
  // memory, which is where a parcel goes to the wrong store.
  const perDestination = new Map<string, number>();
  for (const line of lines) perDestination.set(line.destination, (perDestination.get(line.destination) ?? 0) + 1);

  let zone = "";
  const rows = lines.map((line) => {
    const nextZone = line.locationCode.split(/[^0-9a-zA-Z]/)[0] || "—";
    // A band whenever the aisle changes. A picker looks up from the trolley and
    // needs to know, without re-reading, that the next few lines are elsewhere.
    const band = nextZone !== zone
      ? `<tr class="zone"><td colspan="6">${escapeHtml(t("{zone} 区", { zone: nextZone }))}</td></tr>`
      : "";
    zone = nextZone;
    return `${band}
    <tr>
      <td class="tick"></td>
      <td class="shelf">${escapeHtml(line.locationCode)}</td>
      <td class="title">${escapeHtml(line.title)}${line.sizeLabel ? `<span class="size">${escapeHtml(line.sizeLabel)}</span>` : ""}</td>
      <td class="mono">${escapeHtml(line.barcode)}</td>
      <td class="mono dim">${escapeHtml(line.orderNumber)}</td>
      <td class="dest">${escapeHtml(line.destination)}</td>
    </tr>`;
  }).join("");

  const summary = [...perDestination.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([destination, count]) => `<li><span>${escapeHtml(destination)}</span><b>${count}</b></li>`)
    .join("");

  // Which garments go in one bag. The table is sorted by shelf, so an order's
  // lines are scattered down the page — true to how they are fetched, useless
  // for packing them. This is the same run read the other way round.
  const perOrder = new Map<string, { count: number; destination: string }>();
  for (const line of lines) {
    const existing = perOrder.get(line.orderNumber);
    if (existing) existing.count += 1;
    else perOrder.set(line.orderNumber, { count: 1, destination: line.destination });
  }
  const parcels = [...perOrder.entries()]
    .sort((a, b) => a[1].destination.localeCompare(b[1].destination) || a[0].localeCompare(b[0]))
    .map(([orderNumber, parcel]) =>
      `<li><span class="mono">${escapeHtml(orderNumber)}</span><b>${parcel.count}</b><i>${escapeHtml(parcel.destination)}</i></li>`)
    .join("");

  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>${escapeHtml(t("拣货单"))}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4; margin: 12mm 10mm 14mm; }
  body { font-family: "Noto Sans SC", "Microsoft YaHei", "Segoe UI", system-ui, sans-serif; margin: 0; color: #111; font-size: 10pt; }

  header { display: flex; align-items: flex-end; justify-content: space-between; gap: 6mm; border-bottom: 2px solid #111; padding-bottom: 2.5mm; }
  h1 { font-size: 20pt; margin: 0; letter-spacing: .02em; }
  .counts { font-size: 13pt; font-weight: 700; white-space: nowrap; }
  .stamp { font-size: 9pt; color: #555; text-align: right; }

  /* Who picked it and when. The sheet is the only thing present at the racks,
     so if it is not written here it is not written anywhere. */
  .signoff { display: flex; gap: 8mm; margin: 3mm 0 4mm; font-size: 9.5pt; color: #333; }
  .signoff span { flex: 1; border-bottom: 1px solid #999; padding-bottom: 1mm; }

  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { border-bottom: 1.2px solid #333; padding: 1.5mm 2mm; text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .06em; color: #555; font-weight: 600; }
  td { border-bottom: 1px solid #ddd; padding: 2.6mm 2mm; vertical-align: middle; }
  tr { page-break-inside: avoid; }

  /* Tick boxes are 6 mm because they are ticked with a pen, standing up,
     holding a trolley. */
  .tick { width: 10mm; }
  .tick::before { content: ""; display: block; width: 6mm; height: 6mm; border: 1.3px solid #333; border-radius: 1px; }

  /* The shelf column is the one a picker reads while walking, so it is the
     largest thing on the page and sits in its own tinted lane to follow down. */
  .shelf { width: 30mm; font-size: 14pt; font-weight: 800; white-space: nowrap; background: #f2f2f2; font-variant-numeric: tabular-nums; }
  .title { font-size: 10.5pt; }
  .size { display: inline-block; margin-left: 2mm; padding: 0 1.6mm; border: 1px solid #bbb; border-radius: 2px; font-size: 8.5pt; color: #444; }
  .mono { font-family: "Consolas", "Menlo", monospace; white-space: nowrap; font-size: 9.5pt; }
  .dim { color: #666; }
  .dest { font-size: 9pt; white-space: nowrap; }

  .zone td { background: #111; color: #fff; font-weight: 700; font-size: 9pt; letter-spacing: .08em; padding: 1.2mm 2mm; border: none; }

  footer { margin-top: 5mm; border-top: 1px solid #999; padding-top: 2.5mm; }
  footer h2 { font-size: 10pt; margin: 0 0 1.5mm; }
  footer ul { display: flex; flex-wrap: wrap; gap: 2mm 6mm; margin: 0; padding: 0; list-style: none; font-size: 9.5pt; }
  footer li { display: flex; gap: 2mm; border: 1px solid #ccc; border-radius: 2px; padding: 1mm 2.5mm; align-items: baseline; }
  .parcels-title { margin-top: 3.5mm; }
  .parcels li i { font-style: normal; color: #666; font-size: 8.5pt; }
  .note { margin-top: 3mm; font-size: 8.5pt; color: #555; }
</style></head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(t("拣货单"))}</h1>
      <div class="counts">${escapeHtml(t("{orders} 单 · {items} 件", { orders: orders.size, items: lines.length }))}</div>
    </div>
    <div class="stamp">
      ${escapeHtml(printedAt.toLocaleString("zh-CN"))}<br>
      ${escapeHtml(t("按货架位排序，从上往下走一遍"))}
    </div>
  </header>

  <div class="signoff">
    <span>${escapeHtml(t("拣货员"))}</span>
    <span>${escapeHtml(t("开始"))}</span>
    <span>${escapeHtml(t("完成"))}</span>
  </div>

  <table>
    <thead><tr>
      <th></th><th>${escapeHtml(t("货架位"))}</th><th>${escapeHtml(t("商品"))}</th>
      <th>${escapeHtml(t("条码"))}</th><th>${escapeHtml(t("订单号"))}</th><th>${escapeHtml(t("目的地"))}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <footer>
    <h2>${escapeHtml(t("拣完按目的地分堆"))}</h2>
    <ul>${summary}</ul>
    <h2 class="parcels-title">${escapeHtml(t("再按订单装袋 · 一行一个包裹"))}</h2>
    <ul class="parcels">${parcels}</ul>
    <p class="note">${escapeHtml(t("这张纸不是凭证。拣完在手机拣货台逐件扫码，扫过的才算数；打包也在那里，一张卡片就是一个包裹。"))}</p>
  </footer>
</body></html>`;
}
