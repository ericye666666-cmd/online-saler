import { FulfillmentStatus } from "@online-saler/database";

export type PaidOrderItem = {
  id: string;
  snapshot?: { barcode?: string | null } | null;
};

export function buildPaidOrderPickingTask(orderId: string, items: readonly PaidOrderItem[]) {
  return {
    fulfillment: {
      orderId,
      status: FulfillmentStatus.PAID
    },
    items: items.map((item) => ({
      orderItemId: item.id,
      expectedBarcode: item.snapshot?.barcode?.trim() || null
    })),
    event: {
      orderId,
      action: "PAYMENT_CONFIRMED_PICK_TASK_CREATED",
      oldStatus: null,
      newStatus: FulfillmentStatus.PAID,
      note: "Payment confirmed; one order-level picking task was created."
    }
  } as const;
}
