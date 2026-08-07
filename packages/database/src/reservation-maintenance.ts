import {
  CheckoutDraftStatus,
  InventoryItemStatus,
  OrderStatus,
  PaymentStatus
} from "@prisma/client";
import { prisma } from "./client";

export type ReservationReleaseResult = {
  expiredDrafts: number;
  releasedItems: number;
};

export async function releaseExpiredReservations(now = new Date()): Promise<ReservationReleaseResult> {
  const drafts = await prisma.checkoutDraft.findMany({
    where: { status: CheckoutDraftStatus.ACTIVE, expiresAt: { lte: now } },
    include: { convertedOrder: { include: { items: true } } },
    take: 100
  });

  let releasedItems = 0;
  for (const draft of drafts) {
    await prisma.$transaction(async (tx) => {
      const expired = await tx.checkoutDraft.updateMany({
        where: { id: draft.id, status: CheckoutDraftStatus.ACTIVE },
        data: { status: CheckoutDraftStatus.EXPIRED }
      });
      if (expired.count !== 1 || !draft.convertedOrder) return;

      await tx.order.updateMany({
        where: {
          id: draft.convertedOrder.id,
          status: { in: [OrderStatus.PENDING_PAYMENT, OrderStatus.PAYMENT_PROCESSING] }
        },
        data: { status: OrderStatus.EXPIRED }
      });
      await tx.payment.updateMany({
        where: { orderId: draft.convertedOrder.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.EXPIRED, completedAt: now }
      });
      for (const item of draft.convertedOrder.items) {
        const released = await tx.inventoryItem.updateMany({
          where: { productId: item.productId, status: InventoryItemStatus.RESERVED },
          data: { status: InventoryItemStatus.AVAILABLE }
        });
        releasedItems += released.count;
      }
    });
  }

  return { expiredDrafts: drafts.length, releasedItems };
}
