import {
  FulfillmentMethod,
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
  prisma
} from "@online-saler/database";

export type CustomerOrderDetail = Awaited<ReturnType<typeof getCustomerOrderByNumber>>;

/** Looks the order up across every identity this browser holds (account, guest). */
export async function getCustomerOrderByNumber(orderNumber: string, customerIds: string[]) {
  if (!customerIds.length) return null;
  return prisma.order.findFirst({
    where: {
      orderNumber,
      customerId: { in: customerIds }
    },
    include: {
      sourceDraft: true,
      fulfillmentNode: { select: { name: true, mapsUrl: true, address: true, phone: true } },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 3
      },
      fulfillment: {
        select: {
          status: true,
          updatedAt: true,
          readyForPickupAt: true,
          outForDeliveryAt: true,
          completedAt: true,
          // The customer's own copy of the delivery code. This query is already
          // gated on the order belonging to one of this browser's identities,
          // which is the same gate the pickup code sits behind.
          deliveryCode: true,
          deliveryRiderName: true,
          deliveryRiderPhone: true
        }
      },
      items: {
        include: {
          snapshot: true
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });
}

/**
 * Every order this browser may open, newest first, with deposit holds pinned to
 * the top. Until this existed an order was only reachable from the payment
 * confirmation screen — fine for a paid order with nothing left to do, useless
 * for a deposit whose balance has to be paid days later from a closed tab.
 */
export async function listCustomerOrders(viewers: ReadonlyArray<{
  customerId: string;
  ownsOrder: (orderId: string) => boolean;
}>) {
  if (!viewers.length) return [];
  const orders = await prisma.order.findMany({
    where: { customerId: { in: viewers.map((viewer) => viewer.customerId) } },
    select: {
      id: true,
      customerId: true,
      orderNumber: true,
      status: true,
      totalKsh: true,
      balanceKsh: true,
      balanceDueAt: true,
      paymentPlan: true,
      fulfillmentMethod: true,
      createdAt: true,
      fulfillment: { select: { status: true } },
      items: {
        select: { snapshot: { select: { title: true, imageUrl: true } } },
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  // A guest reaches only the orders their own device started, so the ownership
  // check is applied per row rather than trusted from the customer id alone.
  const visible = orders.filter((order) => {
    const viewer = viewers.find((candidate) => candidate.customerId === order.customerId);
    return viewer ? viewer.ownsOrder(order.id) : false;
  });

  // A hold with a deadline outranks a finished order, however old it is: it is
  // the only row on this page the shopper still has to act on.
  return visible.sort((left, right) => {
    const leftHeld = left.status === OrderStatus.DEPOSIT_PAID ? 0 : 1;
    const rightHeld = right.status === OrderStatus.DEPOSIT_PAID ? 0 : 1;
    if (leftHeld !== rightHeld) return leftHeld - rightHeld;
    return right.createdAt.getTime() - left.createdAt.getTime();
  });
}

export function orderStatusLabel(status: OrderStatus): string {
  if (status === OrderStatus.PAID) return "Paid";
  if (status === OrderStatus.PAYMENT_PROCESSING) return "Waiting for M-Pesa";
  if (status === OrderStatus.PENDING_PAYMENT) return "Payment pending";
  if (status === OrderStatus.DEPOSIT_PAID) return "Deposit paid — balance due";
  if (status === OrderStatus.DEPOSIT_EXPIRED) return "Deposit hold expired";
  if (status === OrderStatus.EXPIRED) return "Expired";
  if (status === OrderStatus.CANCELLED) return "Cancelled";
  if (status === OrderStatus.FULFILLING) return "Being prepared";
  if (status === OrderStatus.COMPLETED) return "Completed";
  if (status === OrderStatus.REFUNDED) return "Refunded";
  return "Draft";
}

export function paymentStatusLabel(status: PaymentStatus | null | undefined): string {
  if (status === PaymentStatus.SUCCESS) return "Paid";
  if (status === PaymentStatus.PENDING) return "Waiting";
  if (status === PaymentStatus.CANCELLED) return "Cancelled";
  if (status === PaymentStatus.TIMEOUT) return "Timed out";
  if (status === PaymentStatus.EXPIRED) return "Expired";
  if (status === PaymentStatus.MANUAL_REVIEW) return "Checking";
  if (status === PaymentStatus.FAILED) return "Failed";
  return "Not started";
}

export type CustomerFulfillmentStep = {
  key: "paid" | "preparing" | "handoff" | "completed";
  label: string;
  state: "complete" | "current" | "upcoming";
};

export function customerFulfillmentProgress(input: {
  orderStatus: OrderStatus;
  fulfillmentMethod: FulfillmentMethod;
  fulfillmentStatus?: FulfillmentStatus | null;
}): CustomerFulfillmentStep[] {
  if (
    input.orderStatus !== OrderStatus.PAID
    && input.orderStatus !== OrderStatus.FULFILLING
    && input.orderStatus !== OrderStatus.COMPLETED
  ) return [];

  const pickup = input.fulfillmentMethod === FulfillmentMethod.PICKUP;
  const labels = [
    ["paid", "Paid"],
    ["preparing", "Preparing"],
    ["handoff", pickup ? "Ready for pickup" : "Out for delivery"],
    ["completed", "Completed"]
  ] as const;
  const status = input.fulfillmentStatus;
  let currentIndex = 0;

  if (status === FulfillmentStatus.COMPLETED || input.orderStatus === OrderStatus.COMPLETED) currentIndex = 3;
  // A failed attempt, and the ride back to the store, stay on the handover step.
  // The customer has had an SMS explaining it; showing the tracker fall back to
  // "Preparing" would read as though the order had been un-shipped.
  else if (
    status === FulfillmentStatus.READY_FOR_PICKUP
    || status === FulfillmentStatus.OUT_FOR_DELIVERY
    || status === FulfillmentStatus.DELIVERY_FAILED
    || status === FulfillmentStatus.RETURNING_TO_NODE
  ) currentIndex = 2;
  else if (
    status === FulfillmentStatus.PICKING
    || status === FulfillmentStatus.READY_TO_PACK
    || status === FulfillmentStatus.PACKED
    || status === FulfillmentStatus.READY_FOR_DISPATCH
    || input.orderStatus === OrderStatus.FULFILLING
  ) currentIndex = 1;

  return labels.map(([key, label], index) => ({
    key,
    label,
    state: currentIndex === 3 || index < currentIndex
      ? "complete"
      : index === currentIndex
        ? "current"
        : "upcoming"
  }));
}

export function customerOrderStatusLabel(input: {
  orderStatus: OrderStatus;
  fulfillmentMethod: FulfillmentMethod;
  fulfillmentStatus?: FulfillmentStatus | null;
}): string {
  const progress = customerFulfillmentProgress(input);
  return progress.find((step) => step.state === "current")?.label
    ?? progress.at(-1)?.label
    ?? orderStatusLabel(input.orderStatus);
}

export function customerOrderStatusMessage(label: string): string {
  if (label === "Paid") return "Payment is confirmed. The warehouse team can prepare your order next.";
  if (label === "Preparing") return "The warehouse team is picking and packing your order.";
  if (label === "Ready for pickup") return "Your order is ready at the Kikuyu pickup point.";
  if (label === "Out for delivery") return "Your order has left the warehouse for local delivery.";
  if (label === "Completed") return "Your order has been handed over successfully.";
  return "Keep this page open while payment is being confirmed.";
}
