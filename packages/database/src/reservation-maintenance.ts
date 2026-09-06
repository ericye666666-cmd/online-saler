import {
  CheckoutDraftStatus,
  InventoryItemStatus,
  OrderStatus,
  PaymentStatus,
  Prisma
} from "@prisma/client";
import { prisma } from "./client";

export type ReservationReleaseResult = {
  expiredDrafts: number;
  releasedItems: number;
};

// Every callback, cancellation and expiry takes the order lock before touching
// its draft, payments or inventory. Never act on a draft read before this lock.
export async function lockReservationOrder(tx: Prisma.TransactionClient, orderId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
}

export async function lockOrderReservationInventory(tx: Prisma.TransactionClient, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId }, select: { productId: true } });
  const productIds = items.map((item) => item.productId).sort();
  if (!productIds.length) return [];
  const inventory = await tx.$queryRaw<Array<{ id: string; productId: string; status: InventoryItemStatus }>>`
    SELECT "id", "productId", "status" FROM "InventoryItem"
    WHERE "productId" IN (${Prisma.join(productIds)}) ORDER BY "productId" FOR UPDATE
  `;
  // There is no reservation-owner column in the current schema. The active
  // draft and its order items are the ownership record; protect legacy overlap.
  const competingItems = await tx.orderItem.findMany({
    where: {
      productId: { in: productIds },
      orderId: { not: orderId },
      order: { sourceDraft: { is: { status: CheckoutDraftStatus.ACTIVE } } }
    },
    select: { productId: true }
  });
  const competingProducts = new Set(competingItems.map((item) => item.productId));
  return inventory.map((item) => ({ ...item, owned: !competingProducts.has(item.productId) }));
}

export async function releaseUnpaidOrderReservation(
  tx: Prisma.TransactionClient,
  orderId: string,
  draftStatus: CheckoutDraftStatus,
  orderStatus: OrderStatus,
  now = new Date(),
  requireExpired = false
): Promise<{ changed: boolean; releasedItems: number }> {
  await lockReservationOrder(tx, orderId);
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { sourceDraft: true, payments: { where: { status: PaymentStatus.SUCCESS } } }
  });
  if (!order || order.payments.length ||
      (order.status !== OrderStatus.PENDING_PAYMENT && order.status !== OrderStatus.PAYMENT_PROCESSING) ||
      order.sourceDraft?.status !== CheckoutDraftStatus.ACTIVE) {
    return { changed: false, releasedItems: 0 };
  }
  if (requireExpired &&
      (!order.sourceDraft.expiresAt || order.sourceDraft.expiresAt > now)) {
    return { changed: false, releasedItems: 0 };
  }
  const inventory = await lockOrderReservationInventory(tx, orderId);
  await tx.checkoutDraft.update({ where: { id: order.sourceDraft.id }, data: { status: draftStatus } });
  await tx.order.update({ where: { id: orderId }, data: { status: orderStatus } });
  let releasedItems = 0;
  for (const item of inventory) {
    if (!item.owned || item.status !== InventoryItemStatus.RESERVED) continue;
    const released = await tx.inventoryItem.updateMany({
      where: { id: item.id, status: InventoryItemStatus.RESERVED },
      data: { status: InventoryItemStatus.AVAILABLE }
    });
    releasedItems += released.count;
  }
  return { changed: true, releasedItems };
}

export async function releaseExpiredReservations(now = new Date()): Promise<ReservationReleaseResult> {
  const drafts = await prisma.checkoutDraft.findMany({
    where: { status: CheckoutDraftStatus.ACTIVE, expiresAt: { lte: now } },
    select: { id: true, convertedOrderId: true },
    orderBy: { expiresAt: "asc" },
    take: 100
  });
  let expiredDrafts = 0;
  let releasedItems = 0;
  for (const draft of drafts) {
    const result = await prisma.$transaction(async (tx) => {
      if (!draft.convertedOrderId) {
        const expired = await tx.checkoutDraft.updateMany({
          where: { id: draft.id, status: CheckoutDraftStatus.ACTIVE, expiresAt: { lte: now }, convertedOrderId: null },
          data: { status: CheckoutDraftStatus.EXPIRED }
        });
        return { changed: expired.count === 1, releasedItems: 0 };
      }
      const released = await releaseUnpaidOrderReservation(tx, draft.convertedOrderId, CheckoutDraftStatus.EXPIRED, OrderStatus.EXPIRED, now, true);
      if (released.changed) {
        await tx.payment.updateMany({
          where: { orderId: draft.convertedOrderId, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.EXPIRED, completedAt: now }
        });
      }
      return released;
    });
    if (result.changed) expiredDrafts += 1;
    releasedItems += result.releasedItems;
  }
  return { expiredDrafts, releasedItems };
}
