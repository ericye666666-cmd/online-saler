import { randomBytes } from "node:crypto";
import {
  CheckoutDraftStatus,
  FulfillmentMethod,
  InventoryItemStatus,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  prisma
} from "@online-saler/database";
import { KIKUYU_DELIVERY_FEE_KSH, RESERVATION_MINUTES, calculateOrderAmounts } from "@online-saler/business-rules";

export type StartCheckoutInput = {
  customerId: string;
  productId: string;
  phone: string;
  fulfillmentMethod: FulfillmentMethod;
  deliveryAddress?: string | null;
  deliveryNote?: string | null;
};

export class CheckoutConflictError extends Error {}
export class CheckoutValidationError extends Error {}

export function normalizeKenyaPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  throw new CheckoutValidationError("Enter a valid Kenyan M-Pesa phone number.");
}

export async function startCheckout(input: StartCheckoutInput) {
  const phone = normalizeKenyaPhone(input.phone);
  const deliveryAddress = input.deliveryAddress?.trim() || null;
  const deliveryNote = input.deliveryNote?.trim() || null;

  if (input.fulfillmentMethod === FulfillmentMethod.KIKUYU_LOCAL_DELIVERY && !deliveryAddress) {
    throw new CheckoutValidationError("Delivery address is required for local delivery.");
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const existing = await tx.checkoutDraft.findFirst({
      where: {
        customerId: input.customerId,
        status: CheckoutDraftStatus.ACTIVE,
        expiresAt: { gt: now },
        convertedOrder: { is: { items: { some: { productId: input.productId } } } }
      },
      include: { convertedOrder: true },
      orderBy: { createdAt: "desc" }
    });

    if (existing?.convertedOrder) {
      return {
        orderId: existing.convertedOrder.id,
        orderNumber: existing.convertedOrder.orderNumber,
        draftId: existing.id,
        phone,
        expiresAt: existing.expiresAt!.toISOString(),
        reservationMinutes: RESERVATION_MINUTES,
        itemSubtotalKsh: existing.itemSubtotalKsh,
        deliveryFeeKsh: existing.deliveryFeeKsh,
        totalKsh: existing.totalKsh,
        currency: existing.currency
      };
    }

    const product = await tx.product.findFirst({
      where: {
        id: input.productId,
        status: ProductStatus.PUBLISHED,
        priceKsh: { gt: 0 },
        inventoryItem: { is: { status: InventoryItemStatus.AVAILABLE } }
      },
      include: {
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        measurements: true,
        defects: true,
        inventoryItem: true
      }
    });

    if (!product?.inventoryItem || !product.priceKsh) {
      throw new CheckoutConflictError("This item is no longer available.");
    }

    const activeReservations = await tx.checkoutDraft.count({
      where: {
        status: CheckoutDraftStatus.ACTIVE,
        expiresAt: { gt: now },
        customer: { is: { phone } }
      }
    });
    if (activeReservations >= 5) {
      throw new CheckoutConflictError("This phone number already has five active payment reservations.");
    }

    const locked = await tx.inventoryItem.updateMany({
      where: { id: product.inventoryItem.id, status: InventoryItemStatus.AVAILABLE },
      data: { status: InventoryItemStatus.RESERVED }
    });
    if (locked.count !== 1) throw new CheckoutConflictError("Another customer has just reserved this item.");

    const deliveryFeeKsh = input.fulfillmentMethod === FulfillmentMethod.KIKUYU_LOCAL_DELIVERY
      ? KIKUYU_DELIVERY_FEE_KSH
      : 0;
    const amounts = calculateOrderAmounts([{ productId: product.id, unitPriceKsh: product.priceKsh }], deliveryFeeKsh);
    const expiresAt = new Date(now.getTime() + RESERVATION_MINUTES * 60_000);
    const orderNumber = `DL-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(4).toString("hex").toUpperCase()}`;

    await tx.customer.update({
      where: { id: input.customerId },
      data: {
        phone,
        ...(deliveryAddress ? { defaultAddress: deliveryAddress } : {}),
        preferredFulfillmentMethod: input.fulfillmentMethod
      }
    });

    const order = await tx.order.create({
      data: {
        orderNumber,
        customerId: input.customerId,
        status: OrderStatus.PENDING_PAYMENT,
        fulfillmentMethod: input.fulfillmentMethod,
        deliveryAddress,
        deliveryNote,
        itemSubtotalKsh: amounts.itemSubtotalKsh,
        deliveryFeeKsh: amounts.deliveryFeeKsh,
        totalKsh: amounts.totalKsh,
        items: {
          create: {
            productId: product.id,
            unitPriceKsh: product.priceKsh,
            quantity: 1,
            lineTotalKsh: product.priceKsh,
            snapshot: {
              create: {
                productCode: product.productCode,
                barcode: product.barcode,
                title: product.title || "Second-hand item",
                category: product.category,
                subcategory: product.subcategory,
                brand: product.brand,
                color: product.color,
                sizeLabel: product.finalSizeLabel || product.tagSize,
                conditionGrade: product.conditionGrade,
                imageUrl: product.images[0]?.publicUrl || product.images[0]?.originalUrl || null,
                measurements: product.measurements.map((item) => ({
                  type: item.measurementType,
                  valueCm: item.finalValueCm?.toString() || null
                })),
                defects: product.defects.map((item) => ({
                  type: item.defectType,
                  severity: item.severity,
                  description: item.customerSafeDescription || item.description
                })),
                unitPriceKsh: product.priceKsh
              }
            }
          }
        }
      }
    });

    const draft = await tx.checkoutDraft.create({
      data: {
        customerId: input.customerId,
        status: CheckoutDraftStatus.ACTIVE,
        fulfillmentMethod: input.fulfillmentMethod,
        deliveryAddress,
        deliveryNote,
        itemSubtotalKsh: amounts.itemSubtotalKsh,
        deliveryFeeKsh: amounts.deliveryFeeKsh,
        totalKsh: amounts.totalKsh,
        expiresAt,
        convertedOrderId: order.id
      }
    });

    return {
      orderId: order.id,
      orderNumber,
      draftId: draft.id,
      phone,
      expiresAt: expiresAt.toISOString(),
      reservationMinutes: RESERVATION_MINUTES,
      ...amounts
    };
  }, { isolationLevel: "Serializable" });
}

export async function releaseExpiredReservations(now = new Date()) {
  const drafts = await prisma.checkoutDraft.findMany({
    where: { status: CheckoutDraftStatus.ACTIVE, expiresAt: { lte: now } },
    include: { convertedOrder: { include: { items: true } } },
    take: 100
  });

  let released = 0;
  for (const draft of drafts) {
    await prisma.$transaction(async (tx) => {
      const expired = await tx.checkoutDraft.updateMany({
        where: { id: draft.id, status: CheckoutDraftStatus.ACTIVE },
        data: { status: CheckoutDraftStatus.EXPIRED }
      });
      if (expired.count !== 1 || !draft.convertedOrder) return;

      await tx.order.updateMany({
        where: { id: draft.convertedOrder.id, status: { in: [OrderStatus.PENDING_PAYMENT, OrderStatus.PAYMENT_PROCESSING] } },
        data: { status: OrderStatus.EXPIRED }
      });
      await tx.payment.updateMany({
        where: { orderId: draft.convertedOrder.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.EXPIRED, completedAt: now }
      });
      for (const item of draft.convertedOrder.items) {
        const result = await tx.inventoryItem.updateMany({
          where: { productId: item.productId, status: InventoryItemStatus.RESERVED },
          data: { status: InventoryItemStatus.AVAILABLE }
        });
        released += result.count;
      }
    });
  }
  return { expiredDrafts: drafts.length, releasedItems: released };
}
