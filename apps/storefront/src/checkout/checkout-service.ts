import { randomBytes } from "node:crypto";
import {
  CheckoutDraftStatus,
  FulfillmentMethod,
  FulfillmentNodeStatus,
  InventoryItemStatus,
  OrderPaymentPlan,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  Prisma,
  lockReservationOrder,
  normalizeNotificationPhone,
  releaseUnpaidOrderReservation,
  prisma,
  releaseExpiredReservations as releaseExpiredReservationsFromDatabase
} from "@online-saler/database";
import {
  KIKUYU_DELIVERY_FEE_KSH,
  MAX_ACTIVE_RESERVATIONS_PER_PHONE,
  MAX_DEPOSIT_HOLDS_PER_PHONE,
  RESERVATION_MINUTES,
  balanceAmountKsh,
  calculateOrderAmounts,
  depositAmountKsh,
  generateCustomerCode,
  orderQualifiesForDeposit
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
  /**
   * The store the shopper collects from. It used to be pasted into the free
   * text delivery note, which meant nothing downstream could route, count or
   * dashboard by store.
   */
  fulfillmentNodeId?: string | null;
  whatsappPhone?: string | null;
  /**
   * FULL charges the whole total now. DEPOSIT_50 charges half and holds the
   * garments for seven days while the shopper finds the rest. Either way the
   * first M-Pesa prompt still has to be answered inside the five-minute
   * reservation window — the seven days only start once money has landed.
   */
  paymentPlan?: OrderPaymentPlan;
  attribution?: CheckoutAttributionInput | null;
};

/** Stores and the warehouse a shopper can be served from. */
export async function activeFulfillmentNodes() {
  return prisma.fulfillmentNode.findMany({
    where: { status: FulfillmentNodeStatus.ACTIVE },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, code: true, name: true, mapsUrl: true, address: true, supportsPickup: true, supportsDelivery: true }
  });
}

export class CheckoutConflictError extends Error {}
export class CheckoutValidationError extends Error {}

export const CHECKOUT_TOO_MANY_PIECES_MESSAGE =
  `You can pay for up to ${MAX_ACTIVE_RESERVATIONS_PER_PHONE} pieces at once.`;
export const CHECKOUT_PREVIOUS_PAYMENT_IN_FLIGHT_MESSAGE =
  "Your previous payment is still being confirmed. Wait a moment or complete it on your phone.";

/**
 * Whether an earlier, still-active checkout attempt could still be paid.
 *
 * Checkout claims a PENDING payment row before the STK prompt leaves for
 * Safaricom, so an attempt with no PENDING row never had a prompt sent and
 * nothing can land on it. MANUAL_REVIEW on a draft that is still open means
 * the prompt went out but its outcome is unknown, and SUCCESS means money has
 * already landed. In any of those cases the earlier attempt is kept: releasing
 * it could leave the shopper's money with no garment behind it.
 */
export function earlierAttemptMayStillBePaid(payments: Array<{ status: PaymentStatus }>): boolean {
  return payments.some((payment) =>
    payment.status === PaymentStatus.PENDING
    || payment.status === PaymentStatus.MANUAL_REVIEW
    || payment.status === PaymentStatus.SUCCESS);
}

/**
 * The per-phone allowance, checked after this phone's unpaid earlier attempts
 * have been released. Whatever is still counted belongs to a payment that may
 * yet succeed, so the message says so instead of quoting a number.
 */
export function reservationAllowanceError(input: { requestedPieces: number; piecesInEarlierPayments: number }): string | null {
  if (input.requestedPieces > MAX_ACTIVE_RESERVATIONS_PER_PHONE) return CHECKOUT_TOO_MANY_PIECES_MESSAGE;
  if (input.requestedPieces + input.piecesInEarlierPayments > MAX_ACTIVE_RESERVATIONS_PER_PHONE) {
    return CHECKOUT_PREVIOUS_PAYMENT_IN_FLIGHT_MESSAGE;
  }
  return null;
}

export function normalizeKenyaPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  throw new CheckoutValidationError("Enter a valid Kenyan M-Pesa phone number.");
}

export async function startCheckout(input: StartCheckoutInput) {
  const phone = normalizeKenyaPhone(input.phone);
  const paymentPlan = input.paymentPlan ?? OrderPaymentPlan.FULL;
  const requestedProductIds = normalizeProductIds(input.productIds);
  const deliveryAddress = input.deliveryAddress?.trim() || null;
  const deliveryNote = input.deliveryNote?.trim() || null;

  if (!requestedProductIds.length) {
    throw new CheckoutValidationError("Choose at least one item before payment.");
  }
  if (input.fulfillmentMethod === FulfillmentMethod.KIKUYU_LOCAL_DELIVERY && !deliveryAddress) {
    throw new CheckoutValidationError("Delivery address is required for local delivery.");
  }

  const whatsappPhone = normalizeNotificationPhone(input.whatsappPhone) ?? null;
  const node = input.fulfillmentNodeId
    ? await prisma.fulfillmentNode.findFirst({
        where: { id: input.fulfillmentNodeId, status: FulfillmentNodeStatus.ACTIVE }
      })
    : null;
  if (input.fulfillmentMethod === FulfillmentMethod.PICKUP) {
    if (!node) throw new CheckoutValidationError("Choose a pickup point before payment.");
    if (!node.supportsPickup) throw new CheckoutValidationError("That store does not offer pickup.");
  }
  if (node && input.fulfillmentMethod === FulfillmentMethod.KIKUYU_LOCAL_DELIVERY && !node.supportsDelivery) {
    throw new CheckoutValidationError("That store does not dispatch deliveries.");
  }

  await releaseExpiredReservations();

  return retryCheckoutTransaction(() => prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${input.customerId} FOR UPDATE`;
    const now = new Date();
    const customer = await tx.customer.findUnique({ where: { id: input.customerId }, select: { phone: true } });
    const keepsPhone = !customer?.phone || customer.phone === phone;
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
    if (uniqueProducts.length > MAX_ACTIVE_RESERVATIONS_PER_PHONE) {
      // Refused before anything is released: an oversized request must not
      // cost the shopper an earlier attempt.
      throw new CheckoutValidationError(CHECKOUT_TOO_MANY_PIECES_MESSAGE);
    }

    const productIds = uniqueProducts.map((product) => product.id);
    // A double-tapped Pay button resubmits the same cart; hand back the order
    // it already made. Only on the same phone: an attempt is charged to the
    // phone it was started with.
    const existingDrafts = !keepsPhone ? [] : await tx.checkoutDraft.findMany({
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
      return sameProductSet(existingProductIds, productIds)
        && draft.convertedOrder?.paymentPlan === paymentPlan
        && draft.fulfillmentMethod === input.fulfillmentMethod
        && draft.deliveryAddress === deliveryAddress
        && draft.deliveryNote === deliveryNote
        && draft.fulfillmentNodeId === (node?.id ?? null)
        && (draft.convertedOrder?.status === OrderStatus.PENDING_PAYMENT || draft.convertedOrder?.status === OrderStatus.PAYMENT_PROCESSING);
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
        paymentPlan: existing.convertedOrder.paymentPlan,
        depositKsh: existing.convertedOrder.depositKsh,
        balanceKsh: existing.convertedOrder.balanceKsh,
        amountDueNowKsh: existing.convertedOrder.paymentPlan === OrderPaymentPlan.DEPOSIT_50
          ? existing.convertedOrder.depositKsh
          : existing.convertedOrder.totalKsh,
        items: existing.convertedOrder.items.map((item) => ({ productId: item.productId }))
      };
    }

    // Starting a new checkout replaces this shopper's earlier unfinished ones:
    // the same phone (a shopper on two devices, or staff paying on a shared
    // phone) or the same account. Earlier attempts that could still be paid
    // are kept and counted below. All of it rolls back if this checkout fails.
    await releaseEarlierUnpaidAttempts(tx, { customerId: input.customerId, phone, now });

    if (!keepsPhone) {
      // Customer.phone is the existing draft's phone source. Until a dedicated
      // immutable draft phone exists, do not silently redirect a payment that
      // may still complete on the old phone.
      const activeDrafts = await tx.checkoutDraft.count({
        where: { customerId: input.customerId, status: CheckoutDraftStatus.ACTIVE, expiresAt: { gt: now } }
      });
      if (activeDrafts) throw new CheckoutConflictError(CHECKOUT_PREVIOUS_PAYMENT_IN_FLIGHT_MESSAGE);
    }

    // Read stock again: the release above may just have put pieces back.
    const inventoryNow = new Map((await tx.inventoryItem.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, status: true }
    })).map((item) => [item.productId, item.status]));
    const invalidProducts = uniqueProducts.filter((product) => (
      product.status !== ProductStatus.PUBLISHED ||
      !product.priceKsh ||
      product.priceKsh <= 0 ||
      !product.inventoryItem ||
      inventoryNow.get(product.id) !== InventoryItemStatus.AVAILABLE
    ));
    if (invalidProducts.length) {
      const heldByOwnPayment = await tx.orderItem.count({
        where: {
          productId: { in: invalidProducts.map((product) => product.id) },
          order: { sourceDraft: { is: ownActiveDraftWhere(input.customerId, phone, now) } }
        }
      });
      if (heldByOwnPayment) throw new CheckoutConflictError(CHECKOUT_PREVIOUS_PAYMENT_IN_FLIGHT_MESSAGE);
      throw new CheckoutConflictError("One or more cart items changed before payment. Refresh the cart and try again.");
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
    const allowanceError = reservationAllowanceError({
      requestedPieces: uniqueProducts.length,
      piecesInEarlierPayments: activeReservedItems
    });
    if (allowanceError) throw new CheckoutConflictError(allowanceError);

    // A deposit takes a garment off sale for a week, so the allowance is much
    // tighter than the five-minute cart cap and is counted separately.
    if (paymentPlan === OrderPaymentPlan.DEPOSIT_50) {
      const heldOnDeposit = await tx.orderItem.count({
        where: {
          order: {
            status: OrderStatus.DEPOSIT_PAID,
            customer: { is: { phone } }
          }
        }
      });
      if (heldOnDeposit + uniqueProducts.length > MAX_DEPOSIT_HOLDS_PER_PHONE) {
        throw new CheckoutConflictError(
          `This phone number is already holding ${MAX_DEPOSIT_HOLDS_PER_PHONE} items on deposit. Pay a balance off before reserving another.`
        );
      }
    }

    for (const product of [...uniqueProducts].sort((left, right) => left.id.localeCompare(right.id))) {
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
    if (paymentPlan === OrderPaymentPlan.DEPOSIT_50 && !orderQualifiesForDeposit(amounts.totalKsh)) {
      throw new CheckoutValidationError("This order is too small to split into a deposit and a balance.");
    }
    const depositKsh = paymentPlan === OrderPaymentPlan.DEPOSIT_50 ? depositAmountKsh(amounts.totalKsh) : 0;
    const balanceKsh = paymentPlan === OrderPaymentPlan.DEPOSIT_50 ? balanceAmountKsh(amounts.totalKsh) : 0;
    const expiresAt = new Date(now.getTime() + RESERVATION_MINUTES * 60_000);
    const orderNumber = `DL-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(4).toString("hex").toUpperCase()}`;
    // A short code the shopper reads out at the counter. It is minted by the
    // same generator as the delivery code, and that is not cosmetic: the
    // counter verifies both through verifyCustomerCode, which accepts four
    // digits and nothing else. A six-character alphanumeric code -- which this
    // was until 2026-09-23 -- normalised down to whatever digits it happened to
    // contain and could never match, so no pickup could be confirmed at all.
    const pickupCode = input.fulfillmentMethod === FulfillmentMethod.PICKUP ? generateCustomerCode() : null;
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
        pickupCode,
        deliveryAddress,
        deliveryNote,
        itemSubtotalKsh: amounts.itemSubtotalKsh,
        deliveryFeeKsh: amounts.deliveryFeeKsh,
        totalKsh: amounts.totalKsh,
        paymentPlan,
        // Frozen here so a later price edit cannot move what the shopper still
        // owes on a hold they already paid half of.
        depositKsh,
        balanceKsh,
        fulfillmentNodeId: node?.id ?? null,
        whatsappPhone,
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
        fulfillmentNodeId: node?.id ?? null,
        whatsappPhone,
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
      paymentPlan,
      depositKsh,
      balanceKsh,
      amountDueNowKsh: paymentPlan === OrderPaymentPlan.DEPOSIT_50 ? depositKsh : amounts.totalKsh,
      items: uniqueProducts.map((product) => ({
        productId: product.id,
        title: product.title || "Second-hand item",
        unitPriceKsh: product.priceKsh!
      }))
    };
  }, { isolationLevel: "Serializable" }));
}

async function retryCheckoutTransaction<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      // P2034 is a serialization conflict; P2002 is the once-in-a-blue-moon
      // pickup code collision. Both are retried with fresh values.
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError
        && (error.code === "P2034" || error.code === "P2002");
      if (!retryable) throw error;
      if (attempt >= 2) throw new CheckoutConflictError("These items changed during checkout. Please try again.");
    }
  }
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

function ownActiveDraftWhere(customerId: string, phone: string, now: Date): Prisma.CheckoutDraftWhereInput {
  return {
    status: CheckoutDraftStatus.ACTIVE,
    expiresAt: { gt: now },
    OR: [{ customerId }, { customer: { is: { phone } } }]
  };
}

/**
 * Releases this shopper's earlier checkout attempts that can no longer be
 * paid, through the same path the expiry sweep and the bag's "release my
 * lock" button use: the order lock is taken first, the draft and order close,
 * and every garment the attempt owned goes back to AVAILABLE. Attempts whose
 * payment may still land are left untouched (see earlierAttemptMayStillBePaid).
 */
async function releaseEarlierUnpaidAttempts(
  tx: Prisma.TransactionClient,
  input: { customerId: string; phone: string; now: Date }
) {
  const drafts = await tx.checkoutDraft.findMany({
    where: { ...ownActiveDraftWhere(input.customerId, input.phone, input.now), convertedOrderId: { not: null } },
    select: { convertedOrderId: true },
    orderBy: { createdAt: "asc" }
  });
  let releasedItems = 0;
  for (const draft of drafts) {
    const orderId = draft.convertedOrderId!;
    // Decide under the order lock, the same lock payment initiation takes
    // before it claims a PENDING row and sends a prompt.
    await lockReservationOrder(tx, orderId);
    const payments = await tx.payment.findMany({ where: { orderId }, select: { status: true } });
    if (earlierAttemptMayStillBePaid(payments)) continue;
    const released = await releaseUnpaidOrderReservation(
      tx, orderId, CheckoutDraftStatus.ABANDONED, OrderStatus.CANCELLED, input.now
    );
    releasedItems += released.releasedItems;
  }
  return { releasedItems };
}

export async function releaseExpiredReservations(now = new Date()) {
  return releaseExpiredReservationsFromDatabase(now);
}

export async function releaseCustomerCheckoutReservations(customerId: string, productIds: string[]) {
  const requestedProductIds = normalizeProductIds(productIds);
  if (!requestedProductIds.length) {
    throw new CheckoutValidationError("Choose at least one reserved item to release.");
  }

  await releaseExpiredReservations();
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { id: { in: requestedProductIds } },
        { productCode: { in: requestedProductIds } },
        { barcode: { in: requestedProductIds } }
      ]
    },
    select: { id: true }
  });
  const resolvedProductIds = products.map((product) => product.id);
  if (!resolvedProductIds.length) return { cancelledOrders: 0, releasedItems: 0 };

  const drafts = await prisma.checkoutDraft.findMany({
    where: {
      customerId,
      status: CheckoutDraftStatus.ACTIVE,
      convertedOrder: {
        is: {
          status: { in: [OrderStatus.PENDING_PAYMENT, OrderStatus.PAYMENT_PROCESSING] },
          items: {
            some: {
              productId: { in: resolvedProductIds }
            }
          }
        }
      }
    },
    include: { convertedOrder: { include: { items: true, payments: true } } },
    take: 10
  });

  let releasedItems = 0;
  let cancelledOrders = 0;
  for (const draft of drafts) {
    const order = draft.convertedOrder;
    if (!order) continue;
    const released = await prisma.$transaction(async (tx) => {
      const result = await releaseUnpaidOrderReservation(tx, order.id, CheckoutDraftStatus.ABANDONED, OrderStatus.CANCELLED);
      if (result.changed) {
        await tx.payment.updateMany({
          where: { orderId: order.id, status: PaymentStatus.PENDING },
          data: {
            status: PaymentStatus.CANCELLED,
            providerResultDescription: "Customer released unpaid payment reservation.",
            completedAt: new Date()
          }
        });
      }
      return result;
    });
    if (released.changed) cancelledOrders += 1;
    releasedItems += released.releasedItems;
  }

  return { cancelledOrders, releasedItems };
}
