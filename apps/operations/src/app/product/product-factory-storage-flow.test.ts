import assert from "node:assert/strict";
import { normalizeStorageScan, storageScanIssue } from "./product-factory-storage-flow";

assert.equal(normalizeStorageScan(" a-010101\n"), "A-010101");
assert.match(storageScanIssue("WRONG", "A-010101", [{ barcode: "DL-1", status: "READY_FOR_STORAGE" }]) ?? "", /不属于/);
assert.match(storageScanIssue("DL-1", "", [{ barcode: "DL-1", status: "READY_FOR_STORAGE" }]) ?? "", /货位码/);
assert.match(storageScanIssue("DL-1", "A-010101", [{ barcode: "DL-1", status: "APPROVED" }]) ?? "", /尚未完成/);
assert.match(storageScanIssue("DL-1", "A-010101", [{ barcode: "DL-1", status: "READY_FOR_STORAGE", inventoryItem: { status: "AVAILABLE" } }]) ?? "", /重复/);
assert.equal(storageScanIssue("DL-1", "A-010101", [{ barcode: "DL-1", status: "READY_FOR_STORAGE" }]), null);
