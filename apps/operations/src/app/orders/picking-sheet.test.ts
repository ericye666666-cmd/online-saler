import assert from "node:assert/strict";
import test from "node:test";
import { compareShelfCodes, pickingSheetHtml, sortPickingLines, type PickingLine } from "./picking-sheet-print";

/**
 * The sheet exists to make a picker walk the racks once. If the order it prints
 * is not the order the racks are in, it is worse than no sheet: it looks
 * authoritative and sends someone back and forth.
 */

function line(locationCode: string, orderNumber = "DL-1"): PickingLine {
  return { locationCode, orderNumber, title: "Denim jacket", sizeLabel: "M", barcode: "9262610000", destination: "自提 · Kinoo" };
}

test("shelf codes walk in rack order", () => {
  // Real codes look like A-010203: zone, then rack, then bin, in one segment.
  const walked = sortPickingLines([line("B-010101"), line("A-010203"), line("A-010105"), line("A-020101")])
    .map((entry) => entry.locationCode);
  assert.deepEqual(walked, ["A-010105", "A-010203", "A-020101", "B-010101"]);
});

test("numbers inside a shelf code compare as numbers", () => {
  assert.ok(compareShelfCodes("A-2", "A-10") < 0, "bay 2 comes before bay 10");
  assert.ok(compareShelfCodes("B-01", "A-99") > 0, "rack B comes after rack A");
  assert.equal(compareShelfCodes("A-010203", "A-010203"), 0);
});

test("a garment with no shelf goes last, where somebody will notice it", () => {
  const walked = sortPickingLines([line("—"), line("A-01"), line("")]).map((entry) => entry.locationCode);
  assert.deepEqual(walked, ["A-01", "—", ""]);
});

test("lines from different orders interleave by shelf, because the picker walks shelves", () => {
  const walked = sortPickingLines([line("C-01", "DL-2"), line("A-01", "DL-9"), line("B-01", "DL-2")])
    .map((entry) => `${entry.locationCode}/${entry.orderNumber}`);
  assert.deepEqual(walked, ["A-01/DL-9", "B-01/DL-2", "C-01/DL-2"]);
});

test("the sheet is a standalone document and escapes what it prints", () => {
  const html = pickingSheetHtml([{ ...line("A-01"), title: '<script>alert("x")</script>' }], new Date("2026-09-24T06:00:00Z"));
  assert.match(html, /^<!doctype html>/);
  // Self-contained: printed inside an isolated iframe, so it cannot rely on the
  // app's stylesheet being there.
  assert.match(html, /<style>/);
  assert.ok(!html.includes("<script>"), "a product title cannot inject script into the sheet");
  assert.match(html, /&lt;script&gt;/);
});

test("the header counts orders and garments separately", () => {
  const html = pickingSheetHtml([line("A-01", "DL-1"), line("A-02", "DL-1"), line("B-01", "DL-2")], new Date());
  // Two orders, three garments: a picker needs the garment count to know when
  // the trolley is full, and the order count to know how many parcels follow.
  assert.match(html, /2 单/);
  assert.match(html, /3 件/);
});
