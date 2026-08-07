import assert from "node:assert/strict";
import { batchStorageCompletionIssue, needsBatchStoragePreparation } from "./product-factory-storage-flow";

const approved = Array.from({ length: 10 }, () => ({ status: "APPROVED" }));
assert.equal(needsBatchStoragePreparation(approved, 10), true);
assert.equal(needsBatchStoragePreparation(approved.slice(0, 9), 10), false);
assert.equal(needsBatchStoragePreparation(Array.from({ length: 10 }, () => ({ status: "PUBLISHED" })), 10), false);

const assigned = Array.from({ length: 10 }, () => ({
  status: "READY_FOR_STORAGE",
  inventoryItem: { status: "PENDING_STOCK_IN", locationId: "location-1" }
}));
assert.equal(needsBatchStoragePreparation(assigned, 10), false);
assert.equal(batchStorageCompletionIssue(assigned, 10), null);
assert.match(batchStorageCompletionIssue(assigned.slice(0, 9), 10) ?? "", /10 件/);
assert.match(batchStorageCompletionIssue(approved, 10) ?? "", /尚未全部完成/);
assert.match(batchStorageCompletionIssue(assigned.map((item, index) => index === 4 ? ({ ...item, inventoryItem: null }) : item), 10) ?? "", /未分配货架号/);
