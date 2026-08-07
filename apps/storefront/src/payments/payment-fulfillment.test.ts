import assert from "node:assert/strict";
import { FulfillmentStatus } from "@online-saler/database";
import { buildPaidOrderPickingTask } from "./payment-fulfillment";

const task = buildPaidOrderPickingTask("order-1", [
  { id: "item-1", snapshot: { barcode: "DLF001258" } },
  { id: "item-2", snapshot: { barcode: "DLF008742" } },
  { id: "item-3", snapshot: { barcode: "DLF006811" } }
]);

assert.deepEqual(task.fulfillment, { orderId: "order-1", status: FulfillmentStatus.PAID });
assert.equal(task.items.length, 3);
assert.deepEqual(task.items.map((item) => item.orderItemId), ["item-1", "item-2", "item-3"]);
assert.equal(task.event.action, "PAYMENT_CONFIRMED_PICK_TASK_CREATED");
assert.equal(task.event.idempotencyKey, "pick-task:order-1");

console.log("Paid order picking-task tests passed");
