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
import {
  KIKUYU_DELIVERY_FEE_KSH,
  MAX_ACTIVE_RESERVATIONS_PER_PHONE,
  RESERVATION_MINUTES,
  calculateOrderAmounts
} from "@online-saler/business-rules";
import {
  createAttributionForOrder,
  resolveCheckoutAttribution,
  type CheckoutAttributionInput
} from "../affiliate/affiliate-service";

export type StartCheckoutInput = {
  customerId: string;
  productIds: string[];
  phone: string;
  fulfillmentMethod: FulfillmentMethod;
  deliveryAddress?: string | null;
  deliveryNote?: string | null;
  attribution?: CheckoutAttributionInput | null;
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
  const requestedProductIds = normalizeProductIds(input.productIds);
  const deliveryAddress = input.deliveryAddress?.trim() || null;
  const deliveryNote = input.deliveryNote?.trim() || null;

  if (!requestedProductIds.length) {
    throw new CheckoutValidationError("Choose at least one item before payment.");
  }
  if (input.fulfillmentMethod === FulfillmentMethod.KIKUYU_LOCAL_DELIVERY && !deliveryAddress) {
    throw new CheckoutValidationError("Delivery address is required for local delivery.");
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const products = await tx.product.findMany({
      where: {
        OR: [
          { id: { in: requestedProductIds } },
          { productCode: { in: requestedProductIds } },
          { barcode: { in: requestedProductIds } }
        ]
      },
      include: {
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        measurements: true,
        defects: true,
        inventoryItem: true
      }
    });

    const resolvedProducts = requestedProductIds.map((productId) =>
      products.find((product) => product.id === productId || product.productCode === productId || product.barcode === productId)
    );
    if (resolvedProducts.some((product) => !product)) {
      throw new CheckoutConflictError("One or more cart items are no longer available.");
    }
    const uniqueProducts = dedupeProducts(resolvedProducts.filter(Boolean) as typeof products);
    if (uniqueProducts.length !== resolvedProducts.length) {
      throw new CheckoutValidationError("A one-of-one item cannot appear twice in the same order.");
    }

    const invalidProducts = uniqueProducts.filter((product) => (
      product.status !== ProductStatus.PUBLISHED ||
      !product.priceKsh ||
      product.priceKsh <= 0 ||
      !product.inventoryItem ||
      product.inventoryItem.status !== InventoryItemStatus.AVAILABLE
    ));
    if (invalidProducts.length) {
      throw new CheckoutConflictError("One or more cart items changed before payment. Refresh the cart and try again.");
    }

    const productIds = uniqueProducts.map((product) => product.id);
    const existingDrafts = await tx.checkoutDraft.findMany({
      where: {
        customerId: input.customerId,
        status: CheckoutDraftStatus.ACTIVE,
        expiresAt: { gt: now }
      },
      include: { convertedOrder: { include: { items: true } } },
      orderBy: { createdAt: "desc" },
      take: 5
    });
    const existing = existingDrafts.find((draft) => {
      const existingProductIds = draft.convertedOrder?.items.map((item) => item.productId) ?? [];
      return sameProductSet(existingProductIds, productIds);
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
        currency: existing.currency,
        items: existing.convertedOrder.items.map((item) => ({ productId: item.productId }))
      };
    }

    const activeReservedItems = await tx.orderItem.count({
      where: {
        order: {
          sourceDraft: {
            is: {
              status: CheckoutDraftStatus.ACTIVE,
              expiresAt: { gt: now },
              customer: { is: { phone } }
            }
          }
        }
      }
    });
    if (activeReservedItems + uniqueProducts.length > MAX_ACTIVE_RESERVATIONS_PER_PHONE) {
      throw new CheckoutConflictError("This phone number already has five active payment reservations.");
    }

    for (const product of uniqueProducts) {
      const locked = await tx.inventoryItem.updateMany({
        where: { id: product.inventoryItem!.id, status: InventoryItemStatus.AVAILABLE },
        data: { status: InventoryItemStatus.RESERVED }
      });
      if (locked.count !== 1) {
        throw new CheckoutConflictError("Another customer has just reserved one of these items.");
      }
    }

    const deliveryFeeKsh = input.fulfillmentMethod === FulfillmentMethod.KIKUYU_LOCAL_DELIVERY
      ? KIKUYU_DELIVERY_FEE_KSH
      : 0;
    const amounts = calculateOrderAmounts(
      uniqueProducts.map((product) => ({ productId: product.id, unitPriceKsh: product.priceKsh! })),
      deliveryFeeKsh
    );
    const expiresAt = new Date(now.getTime() + RESERVATION_MINUTES * 60_000);
    const orderNumber = `DL-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(4).toString("hex").toUpperCase()}`;
    const attribution = await resolveCheckoutAttribution(tx, input.customerId, input.attribution, now);

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
        affiliateId: attribution?.affiliateId ?? null,
        affiliateSource: attribution?.source ?? null,
        affiliatePlacement: attribution?.placement ?? null,
        affiliateCampaign: attribution?.campaign ?? null,
        items: {
          create: uniqueProducts.map((product) => ({
            productId: product.id,
            unitPriceKsh: product.priceKsh!,
            quantity: 1,
            lineTotalKsh: product.priceKsh!,
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
                unitPriceKsh: product.priceKsh!
              }
            }
          }))
        }
      }
    });

    if (attribution) {
      await createAttributionForOrder(tx, {
        ...attribution,
        customerId: input.customerId,
        orderId: order.id
      });
    }

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
      ...amounts,
      items: uniqueProducts.map((product) => ({
        productId: product.id,
        title: product.title || "Second-hand item",
        unitPriceKsh: product.priceKsh!
      }))
    };
  }, { isolationLevel: "Serializable" });
}

function normalizeProductIds(productIds: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of productIds) {
    const productId = raw.trim();
    if (!productId || seen.has(productId)) continue;
    seen.add(productId);
    normalized.push(productId);
  }
  return normalized;
}

function dedupeProducts<T extends { id: string }>(products: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const product of products) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    deduped.push(product);
  }
  return deduped;
}

function sameProductSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
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
