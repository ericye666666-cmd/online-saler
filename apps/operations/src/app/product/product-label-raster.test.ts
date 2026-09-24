import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import JsBarcode from "jsbarcode";
import { encodeLabelRaster, packLabelPixels } from "./product-label-raster";
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

/**
 * A canvas stand-in that records what is written where. Rendering needs a
 * browser, but what the label *says* only needs fillText. measureText is a
 * rough Arial bold width: wide enough that long text really has to wrap.
 */
function withRecordingCanvas<T>(run: (texts: Array<{ text: string; x: number; y: number; font: string }>) => T): T {
  const texts: Array<{ text: string; x: number; y: number; font: string }> = [];
  const W = 480;
  const H = 320;
  const ctx = {
    font: "", fillStyle: "", textBaseline: "", textAlign: "left", lineWidth: 1,
    fillRect() {}, strokeRect() {}, putImageData() {},
    measureText(text: string) {
      const size = Number(/(\d+)px/.exec(ctx.font)?.[1] ?? 16);
      return { width: text.length * size * 0.6 };
    },
    fillText(text: string, x: number, y: number) { texts.push({ text, x, y, font: ctx.font }); },
    getImageData() { return { data: new Uint8ClampedArray(W * H * 4).fill(255) }; },
    createImageData() { return { data: new Uint8ClampedArray(W * H * 4) }; }
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx, toDataURL: () => "data:image/png;base64," };
  const globals = globalThis as { document?: unknown };
  const previous = globals.document;
  globals.document = { createElement: () => canvas };
  try {
    return run(texts);
  } finally {
    globals.document = previous;
  }
}

test("the box label carries the customer's name, full phone and delivery address", () => {
  withRecordingCanvas((texts) => {
    const sheets = renderFulfillmentLabels({
      packageCode: "PKG-KINOO-10281",
      orderNumber: "DL-20260924-10281",
      nodeName: "Kinoo",
      isDelivery: true,
      itemCount: 2,
      customerName: "Wanjiku Kamau",
      customerPhone: "+254712345678",
      deliveryArea: "Kinoo",
      deliveryAddress: "Behind the petrol station, blue gate, house 12, ask for Mama Njeri at the shop next door and she will show you the way up the hill past the church and the water tank on the left",
      items: [{ title: "Denim jacket" }, { title: "Wool scarf" }]
    });
    assert.equal(sheets[0]!.kind, "routing");
    // Only the first sheet's text: that is the label that goes on the box.
    const boxEnd = texts.findIndex((entry, i) => i > 0 && entry.text.startsWith("DL-20260924-10281") );
    const box = texts.slice(0, boxEnd);
    const all = box.map((entry) => entry.text).join("\n");
    assert.match(all, /Wanjiku Kamau/, "the customer's name");
    assert.match(all, /\+254712345678/, "the full phone number, not masked");
    assert.doesNotMatch(all, /•/);
    assert.match(all, /Behind the petrol station/, "the delivery address");
    assert.match(all, /Kinoo · Behind/, "area first, then the address");
    // A long address is cut with an ellipsis, never drawn past the edge.
    for (const entry of box) {
      assert.ok(entry.y <= 312, `"${entry.text}" is drawn at y=${entry.y}, off the 40 mm label`);
      const size = Number(/(\d+)px/.exec(entry.font)?.[1] ?? 16);
      if (entry.x === 16) assert.ok(entry.text.length * size * 0.6 <= 480 - 16, `"${entry.text}" runs off the right edge`);
    }
    assert.ok(box.some((entry) => entry.text.endsWith("…")), "the overlong address is truncated");
  });
});

test("a pickup box label names the customer and the pickup point", () => {
  withRecordingCanvas((texts) => {
    renderFulfillmentLabels({
      packageCode: "PKG-THOGOT-10282",
      orderNumber: "DL-20260924-10282",
      nodeName: "Thogoto",
      isDelivery: false,
      itemCount: 1,
      customerName: "Otieno",
      customerPhone: "0712345678",
      items: [{ title: "Shirt" }]
    });
    const boxEnd = texts.findIndex((entry, i) => i > 0 && entry.text.startsWith("DL-20260924-10282"));
    const all = texts.slice(0, boxEnd).map((entry) => entry.text).join("\n");
    assert.match(all, /Otieno/);
    assert.match(all, /0712345678/);
    assert.match(all, /Collect at Thogoto/);
  });
});

test("the printer is sent ink as a clear bit, because TSPL prints the zeros", () => {
  // Every dot white: packing gives all-zero, and the wire form must be all-ones
  // or the printer burns the whole sticker. This shipped inverted — a solid
  // black label with the text knocked out, and a QR no scanner would read.
  const blank = new Uint8ClampedArray(480 * 320 * 4).fill(255);
  const encoded = encodeLabelRaster(packLabelPixels(blank));
  const bytes = Buffer.from(encoded, "base64");
  assert.equal(bytes.length, 480 * 320 / 8);
  assert.ok(bytes.every((byte) => byte === 0xff), "a blank label must leave every dot unburnt");

  // Every dot black: the wire form is all zeros.
  const solid = new Uint8ClampedArray(480 * 320 * 4).fill(0);
  for (let pixel = 0; pixel < 480 * 320; pixel += 1) solid[pixel * 4 + 3] = 255;
  const inked = Buffer.from(encodeLabelRaster(packLabelPixels(solid)), "base64");
  assert.ok(inked.every((byte) => byte === 0x00), "a black label must burn every dot");
});
