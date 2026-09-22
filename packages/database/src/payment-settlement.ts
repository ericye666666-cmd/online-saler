import {
  CheckoutDraftStatus,
  CommissionStatus,
  FulfillmentStatus,
  InventoryItemStatus,
  OrderStatus,
  PaymentStatus,
  Prisma
} from "@prisma/client";
import { lockOrderReservationInventory, lockReservationOrder } from "./reservation-maintenance";

/**
 * Everything that has to happen when money is confirmed for an order: the order
 * becomes PAID, the reserved garments become PAID stock, a picking task and its
 * first event exist, the checkout draft closes, and the affiliate earns a
 * pending commission.
 *
 * This lives here rather than in the storefront because a payment can also be
 * confirmed by hand, when a late or mismatched callback sent it to manual
 * review. Both paths must leave the database in exactly the same shape.
 */

export class PaymentSettlementError extends Error {}

export type SettleSuccessfulPaymentInput = {
  paymentId: string;
  commissionRateBps: number;
  /**
   * A callback arriving inside the reservation window owns its inventory. A
   * manual settlement happens after the window has closed, so the reservation
   * is re-checked but its expiry is not.
   */
  requireActiveReservation: boolean;
  now?: Date;
};

export type SettleSuccessfulPaymentResult = {
  orderId: string;
  fulfillmentCreated: boolean;
  commissionCreated: boolean;
};

export async function settleSuccessfulPayment(
  tx: Prisma.TransactionClient,
  input: SettleSuccessfulPaymentInput
): Promise<SettleSuccessfulPaymentResult> {
  const now = input.now ?? new Date();
  const payment = await tx.payment.findUnique({
    where: { id: input.paymentId },
    include: {
      order: {
        include: {
          sourceDraft: true,
          items: { include: { snapshot: true } },
          affiliateAttribution: true,
          commission: true
        }
      }
    }
  });
  if (!payment) throw new PaymentSettlementError("Payment was not found.");
  const order = payment.order;
  await lockReservationOrder(tx, order.id);

  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED) {
    throw new PaymentSettlementError("This order was already closed. Record a refund instead of settling it.");
  }

  const inventory = await lockOrderReservationInventory(tx, order.id);
  if (inventory.length !== order.items.length || !inventory.length) {
    throw new PaymentSettlementError("This order no longer has one inventory row per item.");
  }
  const alreadyPaidStock = inventory.every((item) => item.owned && item.status === InventoryItemStatus.PAID);
  const heldReservation = inventory.every((item) => item.owned && item.status === InventoryItemStatus.RESERVED);
  if (!alreadyPaidStock && !heldReservation) {
    throw new PaymentSettlementError(
      "The garments on this order are no longer reserved for it — they were released or sold. Write the order off and refund it instead."
    );
  }
  if (input.requireActiveReservation && !heldReservation) {
    throw new PaymentSettlementError("This order no longer owns its reserved items.");
  }

  for (const item of inventory) {
    if (item.status !== InventoryItemStatus.RESERVED) continue;
    const updated = await tx.inventoryItem.updateMany({
      where: { id: item.id, status: InventoryItemStatus.RESERVED },
      data: { status: InventoryItemStatus.PAID }
    });
    if (updated.count !== 1) throw new PaymentSettlementError("Reserved inventory changed during payment confirmation.");
  }

  if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.FULFILLING) {
    await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.PAID } });
  }
  if (order.sourceDraft && order.sourceDraft.status !== CheckoutDraftStatus.CONVERTED) {
    await tx.checkoutDraft.update({
      where: { id: order.sourceDraft.id },
      data: { status: CheckoutDraftStatus.CONVERTED }
    });
  }

  let fulfillmentCreated = false;
  const existingFulfillment = await tx.orderFulfillment.findUnique({ where: { orderId: order.id } });
  if (!existingFulfillment) {
    const fulfillment = await tx.orderFulfillment.create({
      data: {
        orderId: order.id,
        status: FulfillmentStatus.PAID,
        // Pickup orders already know their node from checkout.
        fulfillmentNodeId: order.fulfillmentNodeId
      }
    });
    if (order.items.length) {
      await tx.fulfillmentItem.createMany({
        data: order.items.map((item) => ({
          fulfillmentId: fulfillment.id,
          orderItemId: item.id,
          expectedBarcode: item.snapshot?.barcode?.trim() || null
        })),
        skipDuplicates: true
      });
    }
    await tx.fulfillmentEvent.create({
      data: {
        idempotencyKey: `pick-task:${order.id}`,
        fulfillmentId: fulfillment.id,
        orderId: order.id,
        action: "PAYMENT_CONFIRMED_PICK_TASK_CREATED",
        oldStatus: null,
        newStatus: FulfillmentStatus.PAID,
        note: "Payment confirmed; one order-level picking task was created."
      }
    });
    fulfillmentCreated = true;
  }

  let commissionCreated = false;
  if (order.affiliateId && !order.commission) {
    await tx.commission.create({
      data: {
        affiliateId: order.affiliateId,
        orderId: order.id,
        attributionId: order.affiliateAttribution?.id ?? null,
        status: CommissionStatus.PENDING,
        rateBps: input.commissionRateBps,
        orderSubtotalKsh: order.itemSubtotalKsh,
        commissionAmountKsh: Math.round((order.itemSubtotalKsh * input.commissionRateBps) / 10000)
      }
    });
    commissionCreated = true;
  }

  await tx.payment.updateMany({
    where: { id: payment.id, status: { not: PaymentStatus.SUCCESS } },
    data: { status: PaymentStatus.SUCCESS, completedAt: payment.completedAt ?? now }
  });

  return { orderId: order.id, fulfillmentCreated, commissionCreated };
}
