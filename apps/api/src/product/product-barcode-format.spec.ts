import assert from "node:assert/strict";
import test from "node:test";
import {
  barcodeBusinessDate,
  barcodePrefix,
  buildDailyBarcode,
  isElevenDigitProductBarcode,
  nextDailyBarcode
} from "./product-barcode-format";

test("builds the 11 digit 9 + year + day + daily sequence barcode", () => {
  const date = barcodeBusinessDate(new Date("2026-08-03T08:00:00.000Z"));

  assert.deepEqual(date, { year: 2026, dayOfYear: 215 });
  assert.equal(barcodePrefix(date), "926215");
  assert.equal(buildDailyBarcode(date, 1), "92621500001");
  assert.equal(isElevenDigitProductBarcode("92621500001"), true);
});

test("uses the Nairobi business day around UTC midnight", () => {
  const date = barcodeBusinessDate(new Date("2026-08-01T22:30:00.000Z"));

  assert.deepEqual(date, { year: 2026, dayOfYear: 214 });
  assert.equal(buildDailyBarcode(date, 27), "92621400027");
});

test("continues after the highest valid barcode and ignores legacy values", () => {
  const date = { year: 2026, dayOfYear: 215 };

  assert.equal(
    nextDailyBarcode(date, ["DLFBATCH123", "92621500003", "92621500017", "92621499999", null]),
    "92621500018"
  );
});

test("rejects a daily sequence beyond the five digit capacity", () => {
  assert.throws(
    () => buildDailyBarcode({ year: 2026, dayOfYear: 215 }, 100_000),
    /between 1 and 99999/
  );
});
