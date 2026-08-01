import assert from "node:assert/strict";
import { labelScanIssue, normalizeLabelScan } from "./product-factory-barcode-flow";

assert.equal(normalizeLabelScan(" dl-001 \n"), "DL-001");
assert.match(labelScanIssue("WRONG", [{ barcode: "DL-001", labelPrintedAt: new Date() }]) ?? "", /不属于/);
assert.match(labelScanIssue("DL-001", [{ barcode: "DL-001" }]) ?? "", /尚未确认打印/);
assert.match(labelScanIssue("DL-001", [{ barcode: "DL-001", labelPrintedAt: new Date(), labelAppliedAt: new Date() }]) ?? "", /重复/);
assert.equal(labelScanIssue("DL-001", [{ barcode: "DL-001", labelPrintedAt: new Date() }]), null);
