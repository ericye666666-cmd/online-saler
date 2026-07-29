import assert from "node:assert/strict";
import {
  buildLabelPrintPayload,
  isDeli720Printer,
  normalizeLabelSize,
  printerList,
  selectDeliPrinter,
  type LocalPrinter
} from "./local-label-print";

const product = {
  barcode: "DLFOPENAI304937609951",
  productCode: "OPENAI-1",
  title: "Coral Orange Graphic T-Shirt",
  category: "TOP",
  color: "ORANGE",
  finalSizeLabel: "M",
  conditionGrade: "GOOD"
};

assert.equal(normalizeLabelSize("6040"), "60x40");
assert.equal(normalizeLabelSize("60 x 40"), "60x40");
assert.equal(normalizeLabelSize("4030"), "40x30");
assert.equal(normalizeLabelSize("40mmx30mm"), "40x30");

assert.equal(isDeli720Printer("Deli DL-720C"), true);
assert.equal(isDeli720Printer("deli-720"), true);
assert.equal(isDeli720Printer("Office Laser"), false);

const parsedPrinters = printerList([
  "Office Laser",
  { name: "Deli_DL_720C", status: "available", available: true },
  { status: "missing name" }
]);
assert.deepEqual(parsedPrinters.map((printer) => printer.name), ["Office Laser", "Deli_DL_720C"]);
assert.equal(selectDeliPrinter(parsedPrinters as LocalPrinter[]), "Deli_DL_720C");

const payload6040 = buildLabelPrintPayload({ product, labelSize: "60x40", printerName: "Deli DL-720C" });
assert.equal(payload6040.template_size, "60x40");
assert.equal(payload6040.template_code, "online_saler_product_60x40");
assert.equal(payload6040.label_payload.barcode_value, "DLFOPENAI304937609951");
assert.equal(payload6040.label_payload.title, "Coral Orange Graphic T-Shirt");

const payload4030 = buildLabelPrintPayload({ product, labelSize: "40x30", printerName: "deli-720" });
assert.equal(payload4030.template_size, "40x30");
assert.equal(payload4030.printer_name, "deli-720");

assert.throws(() => buildLabelPrintPayload({ product: { title: "No barcode" }, labelSize: "60x40" }));

console.log("Local label print tests passed");
