import assert from "node:assert/strict";
import {
  buildFulfillmentLabelPayload,
  buildLabelPrintPayload,
  isDeli720Printer,
  isSafariBrowser,
  isSupportedAgentPlatform,
  labelText,
  normalizeLabelSize,
  printerList,
  selectDeliPrinter,
  PRINTABLE_CODE,
  type LocalPrinter
} from "./local-label-print";

const product = {
  barcode: "DLFOPENAI304937609951",
  productCode: "OPENAI-1",
  title: "Coral Orange Graphic T-Shirt",
  category: "TOP",
  color: "ORANGE",
  finalSizeLabel: "M",
  conditionGrade: "GOOD",
  inventoryItem: { location: { locationCode: "A-01-02-03" } }
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
assert.equal(payload6040.label_payload.location, "A-01-02-03");

const payload4030 = buildLabelPrintPayload({ product, labelSize: "40x30", printerName: "deli-720" });
assert.equal(payload4030.template_size, "40x30");
assert.equal(payload4030.printer_name, "deli-720");

// The printed label is always English, never raw codes or Chinese.
assert.equal(labelText("LADY_TOPS"), "Lady tops");
assert.equal(labelText("LIKE_NEW"), "Like new");
assert.equal(labelText("Coral Orange"), "Coral Orange");
assert.equal(payload6040.label_payload.condition, "Good");
assert.equal(payload6040.label_payload.color, "Orange");
assert.equal(buildLabelPrintPayload({ product: { barcode: "X1" }, labelSize: "60x40" }).label_payload.location, "Unassigned");

assert.throws(() => buildLabelPrintPayload({ product: { title: "No barcode" }, labelSize: "60x40" }));

console.log("Local label print tests passed");

// --- parcel label for an online order --------------------------------------
//
// The print agent validates the payload before it will spool anything, and the
// agent is a signed Windows exe on a shop counter — not something to change
// when a field drifts. These pin the contract it enforces.

const parcel = {
  packageCode: "PKG-KINOO-1A2B3C4D",
  nodeName: "Kinoo",
  orderNumber: "DL-10281",
  isDelivery: true,
  itemCount: 3,
  customerName: "Wanjiku"
};

{
  const payload = buildFulfillmentLabelPayload(parcel);
  // The agent hard-rejects any other scope or size; it identifies the wire
  // contract, not the contents.
  assert.equal(payload.label_payload.template_scope, "online_saler_product");
  assert.equal(payload.template_size, "60x40");
  assert.equal(payload.copies, 1);
  assert.equal(payload.printer_name, "Deli DL-720C");
  assert.equal(payload.label_payload.barcode_value, "PKG-KINOO-1A2B3C4D");
  assert.ok(PRINTABLE_CODE.test(payload.label_payload.barcode_value));
}

{
  // Package codes are built from a node code and an order number, so a lower
  // case one reaching the agent would be rejected rather than printed.
  const payload = buildFulfillmentLabelPayload({ ...parcel, packageCode: " pkg-kinoo-1a2b3c4d " });
  assert.equal(payload.label_payload.barcode_value, "PKG-KINOO-1A2B3C4D");
}

{
  const payload = buildFulfillmentLabelPayload({ ...parcel, printerName: "Deli DL-720C (copy 2)" });
  assert.equal(payload.printer_name, "Deli DL-720C (copy 2)");
  assert.equal(payload.printer, payload.printer_name);
}

// A parcel that has not been packed has no code to scan, so printing a label
// for it would put an unreceivable sticker on a box.
for (const missing of ["", "   ", "PKG", "pkg!bad"]) {
  assert.throws(() => buildFulfillmentLabelPayload({ ...parcel, packageCode: missing }), /package code/i);
}

// The longest node code the package builder emits still passes the agent regex.
assert.ok(PRINTABLE_CODE.test("PKG-LUCKYS-1A2B3C4D"));
assert.ok(!PRINTABLE_CODE.test("PKG_KINOO_1A2B3C4D"));

// The helper answers /health from any machine, so the screen decides whether this
// one can actually reach a printer. It was Windows-only for a while, which left a
// Mac looking connected right up to the moment somebody pressed print.
assert.ok(isSupportedAgentPlatform("windows"));
assert.ok(isSupportedAgentPlatform("darwin"));
assert.ok(isSupportedAgentPlatform("Darwin"));
assert.ok(isSupportedAgentPlatform("linux"));
assert.ok(!isSupportedAgentPlatform("ios"));
assert.ok(!isSupportedAgentPlatform(undefined));
assert.ok(!isSupportedAgentPlatform(""));

// A CUPS queue name cannot hold spaces, so the Mac reports Deli_DL-720C where
// Windows reports Deli DL-720C. Both have to resolve to the same printer.
assert.equal(selectDeliPrinter(printerList(["Deli_DL-720C"])), "Deli_DL-720C");
assert.ok(isDeli720Printer("Deli_DL-720C"));

console.log("local label print tests passed");

// Safari blocks the https console from reaching the http helper; say so.
assert.equal(isSafariBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"), true);
assert.equal(isSafariBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"), false);
assert.equal(isSafariBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0"), false);
assert.equal(isSafariBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:130.0) Gecko/20100101 Firefox/130.0"), false);
assert.equal(isSafariBrowser(undefined), false);
