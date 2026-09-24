import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import JsBarcode from "jsbarcode";
import { packLabelPixels } from "./product-label-raster";
import { renderFulfillmentLabels } from "../warehouse/fulfillment-label-raster";

test("keeps MSB-first binary pixels and transparent background white", () => {
  const pixels = new Uint8ClampedArray(480 * 320 * 4).fill(255);
  for (const index of [0, 7, 8, 479, 480 * 320 - 1]) pixels.set([0, 0, 0, 255], index * 4);
  pixels.set([0, 0, 0, 0], 16 * 4);
  const packed = packLabelPixels(pixels);
  assert.equal(packed.length, 19200);
  assert.equal(packed[0], 0x81);
  assert.equal(packed[1], 0x80);
  assert.equal(packed[2], 0);
  assert.equal(packed[59], 1);
  assert.equal(packed[19199], 1);
  assert.throws(() => packLabelPixels(new Uint8ClampedArray(4)));
});

test("current 11-digit product barcodes fit 60mm labels with two-dot bars and quiet zones", () => {
  for (const value of ["92625700001", "92625799999"]) {
    const output: { encodings?: Array<{ data: string }> } = {};
    JsBarcode(output, value, { format: "CODE128", width: 2 });
    assert.ok(output.encodings?.length);
    const width = output.encodings!.reduce((sum, part) => sum + part.data.length * 2, 0) + 40;
    assert.ok(width <= 480, `${value} requires ${width} printer dots`);
  }
});

test("a label with no package code refuses by name rather than by QR error", () => {
  // The routing sticker is a QR of the package code and nothing else. The
  // encoder's own complaint ("No input text") tells a packer nothing, so the
  // renderer says which order and what to do about it.
  assert.throws(
    () => renderFulfillmentLabels({ packageCode: "", orderNumber: "DL-20260812-37F0960D", nodeName: "—", isDelivery: false, itemCount: 1, items: [] }),
    /DL-20260812-37F0960D has no package code/
  );
  assert.throws(
    () => renderFulfillmentLabels({ packageCode: "   ", orderNumber: "", nodeName: "—", isDelivery: false, itemCount: 0, items: [] }),
    /This order has no package code/
  );
});

/**
 * The label is read in a Nairobi store, not on the screen that printed it. The
 * operator's language must not reach it: a supervisor switching the workspace to
 * Chinese would otherwise start printing stickers nobody at the counter can read.
 */
test("nothing the label draws is translated by the workspace locale", () => {
  const source = readFileSync(new URL("../warehouse/fulfillment-label-raster.ts", import.meta.url), "utf8");
  // Only what ends up on the sticker. The module also throws a translated error
  // when a browser gives it no canvas, and that one is read on a screen.
  const drawn = source
    .split("\n")
    .filter((line) => !line.includes("new Error("))
    .flatMap((line) => [...line.matchAll(/\bt\("([^"]*)"\)/g)].map((match) => match[1]!));
  assert.ok(drawn.length > 0, "the label does use t() — this test is watching the right file");
  for (const key of drawn) {
    assert.doesNotMatch(
      key,
      /[一-鿿]/,
      `"${key}" is drawn on the label and is Chinese. Label copy stays English whatever the workspace is set to.`
    );
  }
});

test("the label prints the node's own name, not a composed screen label", () => {
  // "自提 · Kinoo" is what the workbench shows a Chinese-reading supervisor.
  // It reached a sticker in Nairobi once, through nodeName. Asserted against the
  // source because rendering a label needs a browser canvas.
  const picker = readFileSync(new URL("../orders/picking/picking-client.tsx", import.meta.url), "utf8");
  assert.match(picker, /nodeName: labelOrder[.]nodeName/, "the label takes the node's own name");
  assert.doesNotMatch(picker, /nodeName: labelOrder[.]destination/, "and never the composed screen label");
});
