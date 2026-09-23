import {
  CheckoutDraftStatus,
  CommissionStatus,
  InventoryItemStatus,
  InventoryMovementType,
  OrderStatus,
  PaymentStatus,
  Prisma
} from "@prisma/client";
import { lockOrderReservationInventory, lockReservationOrder } from "./reservation-maintenance";

/**
 * Closing an order has to decide what happens to the physical garment. An
 * unpaid reservation goes straight back on sale; a paid order that can never be
 * shipped is either found and reshelved or written off as lost. Leaving the
 * inventory row untouched — which is what cancellation used to do — takes the
 * item out of circulation permanently without recording anything.
 */
export type InventoryOutcome = "RESTOCK" | "LOST";

export type OrderClosureResult = {
  changed: boolean;
  restockedItems: number;
  lostItems: number;
  releasedItems: number;
};

const CLOSEABLE_INVENTORY_STATUSES: InventoryItemStatus[] = [
  InventoryItemStatus.RESERVED,
  // A garment held against a deposit is released the same way as any other.
  // The deposit itself is money already taken, so closing such an order always
  // leaves a refund decision behind it.
  InventoryItemStatus.DEPOSIT_HELD,
  InventoryItemStatus.PAID,
  InventoryItemStatus.PICKED,
  InventoryItemStatus.PACKED
];

const EMPTY_RESULT: OrderClosureResult = {
  changed: false,
  restockedItems: 0,
  lostItems: 0,
  releasedItems: 0
};

/**
 * Releases every inventory row this order still holds and records a movement
 * for each one. Call inside a transaction that already holds the order lock.
 */
export async function settleOrderInventory(
  tx: Prisma.TransactionClient,
  orderId: string,
  outcome: InventoryOutcome,
  employeeId: string | null,
  reason: string
): Promise<Pick<OrderClosureResult, "restockedItems" | "lostItems">> {
  const inventory = await lockOrderReservationInventory(tx, orderId);
  const nextStatus = outcome === "RESTOCK" ? InventoryItemStatus.AVAILABLE : InventoryItemStatus.LOST;
  let restockedItems = 0;
  let lostItems = 0;

  for (const item of inventory) {
    // `owned` is false when a legacy overlapping reservation points at the same
    // product. Releasing it here would hand another order's item back to sale.
    if (!item.owned || !CLOSEABLE_INVENTORY_STATUSES.includes(item.status)) continue;
    const updated = await tx.inventoryItem.updateMany({
      where: { id: item.id, status: item.status },
      data: { status: nextStatus }
    });
    if (updated.count !== 1) continue;
    await tx.inventoryMovement.create({
      data: {
        inventoryItemId: item.id,
        productId: item.productId,
        movementType: InventoryMovementType.ADJUST,
        employeeId,
        reason
      }
    });
    if (outcome === "RESTOCK") restockedItems += 1;
    else lostItems += 1;
  }

  return { restockedItems, lostItems };
}

/**
 * Cancels an order that was never paid: the draft is closed, pending payments
 * are cancelled, and the reserved garments go back on sale immediately.
 */
export async function closeUnpaidOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  employeeId: string | null,
  reason: string,
  now = new Date()
): Promise<OrderClosureResult> {
  await lockReservationOrder(tx, orderId);
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { sourceDraft: true, payments: { where: { status: PaymentStatus.SUCCESS } } }
  });
  if (!order || order.payments.length) return EMPTY_RESULT;
  if (order.status !== OrderStatus.PENDING_PAYMENT && order.status !== OrderStatus.PAYMENT_PROCESSING) {
    return EMPTY_RESULT;
  }

  const settled = await settleOrderInventory(tx, orderId, "RESTOCK", employeeId, reason);
  if (order.sourceDraft && order.sourceDraft.status === CheckoutDraftStatus.ACTIVE) {
    await tx.checkoutDraft.update({
      where: { id: order.sourceDraft.id },
      data: { status: CheckoutDraftStatus.ABANDONED }
    });
  }
  await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.CANCELLED } });
  await tx.payment.updateMany({
    where: { orderId, status: { in: [PaymentStatus.PENDING, PaymentStatus.MANUAL_REVIEW] } },
    data: {
      status: PaymentStatus.CANCELLED,
      providerResultDescription: reason,
      completedAt: now
    }
  });

  return {
    changed: true,
    releasedItems: settled.restockedItems,
    restockedItems: settled.restockedItems,
    lostItems: 0
  };
}

/**
 * Writes off a paid order that can never be fulfilled. The money stays
 * recorded — a refund is a separate finance action — but the garment stops
 * being stuck in PAID and the affiliate commission is reversed.
 */
export async function writeOffPaidOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  outcome: InventoryOutcome,
  employeeId: string | null,
  reason: string
): Promise<OrderClosureResult> {
  await lockReservationOrder(tx, orderId);
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { sourceDraft: true }
  });
  if (!order) return EMPTY_RESULT;
  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED) return EMPTY_RESULT;

  const settled = await settleOrderInventory(tx, orderId, outcome, employeeId, reason);
  if (order.sourceDraft && order.sourceDraft.status === CheckoutDraftStatus.ACTIVE) {
    await tx.checkoutDraft.update({
      where: { id: order.sourceDraft.id },
      data: { status: CheckoutDraftStatus.ABANDONED }
    });
  }
  await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.CANCELLED } });
  await reverseCommissionForClosedOrder(tx, orderId, "ORDER_CANCELLED");

  return {
    changed: true,
    releasedItems: settled.restockedItems,
    restockedItems: settled.restockedItems,
    lostItems: settled.lostItems
  };
}

/**
 * A cancelled or refunded order must not leave a payable commission behind.
 * Unconfirmed commissions are rejected outright; a commission that finance has
 * already confirmed is frozen with a hold reason so it cannot be paid out
 * without someone looking at it.
 */
export async function reverseCommissionForClosedOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  reason: "ORDER_CANCELLED" | "ORDER_REFUNDED",
  now = new Date()
) {
  const commission = await tx.commission.findUnique({ where: { orderId } });
  if (!commission) return null;
  if (commission.status === CommissionStatus.PAID || commission.status === CommissionStatus.REJECTED) {
    return commission;
  }
  const note = reason === "ORDER_CANCELLED"
    ? "Order was cancelled before the commission could be paid."
    : "Order was refunded before the commission could be paid.";
  if (commission.status === CommissionStatus.PENDING) {
    return tx.commission.update({
      where: { id: commission.id },
      data: { status: CommissionStatus.REJECTED, rejectedAt: now, holdReason: reason, note }
    });
  }
  return tx.commission.update({
    where: { id: commission.id },
    data: { holdReason: reason, note }
  });
}

export type OrderRefundPosition = {
  paidKsh: number;
  refundedKsh: number;
  outstandingKsh: number;
  fullyRefunded: boolean;
};

export function orderRefundPosition(input: {
  payments: ReadonlyArray<{ status: PaymentStatus; amountKsh: number }>;
  refunds: ReadonlyArray<{ amountKsh: number }>;
}): OrderRefundPosition {
  const paidKsh = input.payments
    .filter((payment) => payment.status === PaymentStatus.SUCCESS)
    .reduce((sum, payment) => sum + payment.amountKsh, 0);
  const refundedKsh = input.refunds.reduce((sum, refund) => sum + refund.amountKsh, 0);
  return {
    paidKsh,
    refundedKsh,
    outstandingKsh: Math.max(paidKsh - refundedKsh, 0),
    fullyRefunded: paidKsh > 0 && refundedKsh >= paidKsh
  };
}
