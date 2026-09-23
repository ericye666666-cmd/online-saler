import {
  CheckoutDraftStatus,
  InventoryItemStatus,
  InventoryMovementType,
  OrderPaymentPlan,
  OrderStatus,
  PaymentKind,
  PaymentStatus,
  Prisma,
  RefundKind,
  RefundRequestStatus
} from "@prisma/client";
import { lockOrderReservationInventory, lockReservationOrder } from "./reservation-maintenance";

/**
 * The two ends of a deposit hold: taking half the money and putting the garment
 * aside, and giving the garment back to the shop when the balance never came.
 *
 * Settling the balance itself is not here — that is an ordinary completed sale
 * and goes through `settleSuccessfulPayment`, so a deposit order and a
 * pay-in-full order reach fulfilment through exactly one code path.
 *
 * Like payment settlement, this file takes its policy numbers as arguments
 * rather than importing the business rules package, so the database layer keeps
 * no opinion about what half of an order is worth.
 */

export class DepositSettlementError extends Error {}

export type SettleDepositPaymentInput = {
  paymentId: string;
  /** When the hold lapses. Computed by the caller from the deposit rules. */
  balanceDueAt: Date;
  now?: Date;
};

export type SettleDepositPaymentResult = {
  orderId: string;
  balanceKsh: number;
  balanceDueAt: Date;
  heldItems: number;
};

/**
 * Money is in for half the order. The garments move from a minutes-long cart
 * reservation to a seven-day deposit hold, the order parks in DEPOSIT_PAID, and
 * the checkout draft closes so the reservation sweeper stops watching it.
 *
 * Deliberately absent: no picking task and no affiliate commission. Nothing is
 * picked until the order is paid for in full, and a sale that may still lapse
 * has not earned anyone a commission.
 */
export async function settleDepositPayment(
  tx: Prisma.TransactionClient,
  input: SettleDepositPaymentInput
): Promise<SettleDepositPaymentResult> {
  const now = input.now ?? new Date();
  const payment = await tx.payment.findUnique({
    where: { id: input.paymentId },
    include: { order: { include: { sourceDraft: true, items: { select: { id: true } } } } }
  });
  if (!payment) throw new DepositSettlementError("Payment was not found.");
  if (payment.kind !== PaymentKind.DEPOSIT) {
    throw new DepositSettlementError("This payment is not a deposit.");
  }
  const order = payment.order;
  await lockReservationOrder(tx, order.id);

  if (order.paymentPlan !== OrderPaymentPlan.DEPOSIT_50) {
    throw new DepositSettlementError("This order was not placed on the deposit plan.");
  }
  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED) {
    throw new DepositSettlementError("This order was already closed. Record a refund instead of settling it.");
  }

  const inventory = await lockOrderReservationInventory(tx, order.id);
  if (inventory.length !== order.items.length || !inventory.length) {
    throw new DepositSettlementError("This order no longer has one inventory row per item.");
  }
  // A re-delivered callback finds the hold already placed; that is success, not
  // a conflict. Anything else means the garment left this order.
  const alreadyHeld = inventory.every((item) => item.owned && item.status === InventoryItemStatus.DEPOSIT_HELD);
  const heldReservation = inventory.every((item) => item.owned && item.status === InventoryItemStatus.RESERVED);
  if (!alreadyHeld && !heldReservation) {
    throw new DepositSettlementError(
      "The garments on this order are no longer reserved for it — they were released or sold. Refund the deposit instead."
    );
  }

  let heldItems = 0;
  for (const item of inventory) {
    if (item.status !== InventoryItemStatus.RESERVED) continue;
    const updated = await tx.inventoryItem.updateMany({
      where: { id: item.id, status: InventoryItemStatus.RESERVED },
      data: { status: InventoryItemStatus.DEPOSIT_HELD }
    });
    if (updated.count !== 1) throw new DepositSettlementError("Reserved inventory changed during deposit confirmation.");
    await tx.inventoryMovement.create({
      data: {
        inventoryItemId: item.id,
        productId: item.productId,
        movementType: InventoryMovementType.ADJUST,
        employeeId: null,
        reason: `Deposit received for order ${order.orderNumber}; held off sale until ${input.balanceDueAt.toISOString()}.`
      }
    });
    heldItems += 1;
  }

  const balanceDueAt = order.balanceDueAt ?? input.balanceDueAt;
  if (order.status !== OrderStatus.DEPOSIT_PAID) {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.DEPOSIT_PAID,
        depositPaidAt: order.depositPaidAt ?? now,
        balanceDueAt
      }
    });
  }
  // The draft's five-minute clock has done its job. Leaving it ACTIVE would put
  // a seven-day hold in front of the reservation sweeper, which would hand the
  // garment back to the shop minutes after the shopper paid for half of it.
  if (order.sourceDraft && order.sourceDraft.status !== CheckoutDraftStatus.CONVERTED) {
    await tx.checkoutDraft.update({
      where: { id: order.sourceDraft.id },
      data: { status: CheckoutDraftStatus.CONVERTED }
    });
  }

  await tx.payment.updateMany({
    where: { id: payment.id, status: { not: PaymentStatus.SUCCESS } },
    data: { status: PaymentStatus.SUCCESS, completedAt: payment.completedAt ?? now }
  });

  return { orderId: order.id, balanceKsh: order.balanceKsh, balanceDueAt, heldItems };
}

export type LapseDepositHoldInput = {
  orderId: string;
  /** What goes back to the shopper. The rest of the deposit stays with the shop. */
  refundKsh: number;
  reason: string;
  now?: Date;
};

export type LapseDepositHoldResult = {
  changed: boolean;
  releasedItems: number;
  refundKsh: number;
  forfeitKsh: number;
  refundRequestId: string | null;
};

const NO_LAPSE: LapseDepositHoldResult = {
  changed: false,
  releasedItems: 0,
  refundKsh: 0,
  forfeitKsh: 0,
  refundRequestId: null
};

/**
 * Seven days are up and the balance never arrived. The garment goes back on
 * sale immediately — that is the whole point of a deadline — and the part of
 * the deposit the shopper is owed becomes a refund request for finance.
 *
 * The refund is raised, not paid: M-Pesa payouts are a manual action, so this
 * only guarantees the debt is visible in the queue someone already works.
 */
export async function lapseDepositHold(
  tx: Prisma.TransactionClient,
  input: LapseDepositHoldInput
): Promise<LapseDepositHoldResult> {
  const now = input.now ?? new Date();
  await lockReservationOrder(tx, input.orderId);
  const order = await tx.order.findUnique({
    where: { id: input.orderId },
    include: {
      payments: { where: { status: PaymentStatus.SUCCESS } },
      refundRequests: { where: { kind: RefundKind.LAPSED_DEPOSIT } }
    }
  });
  if (!order || order.status !== OrderStatus.DEPOSIT_PAID) return NO_LAPSE;
  if (!order.balanceDueAt || order.balanceDueAt > now) return NO_LAPSE;
  // A balance that cleared between the sweep's query and this lock has already
  // moved the order on; never take a paid-for garment back off a customer.
  if (order.payments.some((payment) => payment.kind === PaymentKind.BALANCE || payment.kind === PaymentKind.FULL)) {
    return NO_LAPSE;
  }

  const depositPaidKsh = order.payments
    .filter((payment) => payment.kind === PaymentKind.DEPOSIT)
    .reduce((sum, payment) => sum + payment.amountKsh, 0);
  const refundKsh = Math.max(0, Math.min(input.refundKsh, depositPaidKsh));

  const inventory = await lockOrderReservationInventory(tx, input.orderId);
  let releasedItems = 0;
  for (const item of inventory) {
    if (!item.owned || item.status !== InventoryItemStatus.DEPOSIT_HELD) continue;
    const released = await tx.inventoryItem.updateMany({
      where: { id: item.id, status: InventoryItemStatus.DEPOSIT_HELD },
      data: { status: InventoryItemStatus.AVAILABLE }
    });
    if (released.count !== 1) continue;
    await tx.inventoryMovement.create({
      data: {
        inventoryItemId: item.id,
        productId: item.productId,
        movementType: InventoryMovementType.ADJUST,
        employeeId: null,
        reason: input.reason
      }
    });
    releasedItems += 1;
  }

  await tx.order.update({ where: { id: input.orderId }, data: { status: OrderStatus.DEPOSIT_EXPIRED } });
  await tx.payment.updateMany({
    where: { orderId: input.orderId, status: { in: [PaymentStatus.PENDING, PaymentStatus.MANUAL_REVIEW] } },
    data: { status: PaymentStatus.EXPIRED, providerResultDescription: input.reason, completedAt: now }
  });

  let refundRequestId = order.refundRequests[0]?.id ?? null;
  if (!refundRequestId && refundKsh > 0) {
    const request = await tx.refundRequest.create({
      data: {
        orderId: input.orderId,
        status: RefundRequestStatus.PENDING_APPROVAL,
        kind: RefundKind.LAPSED_DEPOSIT,
        amountKsh: refundKsh,
        reason: input.reason,
        requestedByAdminUserId: null
      }
    });
    refundRequestId = request.id;
  }

  return {
    changed: true,
    releasedItems,
    refundKsh,
    forfeitKsh: depositPaidKsh - refundKsh,
    refundRequestId
  };
}

/**
 * Orders whose hold has run out, oldest first. Read outside the transaction; a
 * balance can still land before the lock, which `lapseDepositHold` re-checks.
 */
export async function depositHoldsDueForLapse(
  client: Pick<Prisma.TransactionClient, "order">,
  now = new Date(),
  take = 100
) {
  return client.order.findMany({
    where: { status: OrderStatus.DEPOSIT_PAID, balanceDueAt: { lte: now } },
    select: { id: true, orderNumber: true, totalKsh: true, balanceDueAt: true, whatsappPhone: true, customer: { select: { phone: true, displayName: true } } },
    orderBy: { balanceDueAt: "asc" },
    take
  });
}

/**
 * Deposit orders whose balance is still due, for the reminder sweep. Returns
 * everything held; the caller decides which day's reminder each one is owed.
 */
export async function openDepositHolds(
  client: Pick<Prisma.TransactionClient, "order">,
  now = new Date(),
  take = 200
) {
  return client.order.findMany({
    where: { status: OrderStatus.DEPOSIT_PAID, balanceDueAt: { gt: now } },
    select: {
      id: true,
      orderNumber: true,
      balanceKsh: true,
      balanceDueAt: true,
      depositPaidAt: true,
      whatsappPhone: true,
      customer: { select: { phone: true, displayName: true } }
    },
    orderBy: { balanceDueAt: "asc" },
    take
  });
}
