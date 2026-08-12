import {
  FulfillmentMethod,
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
  prisma
} from "@online-saler/database";

export type CustomerOrderDetail = Awaited<ReturnType<typeof getCustomerOrderByNumber>>;

export async function getCustomerOrderByNumber(orderNumber: string, customerId: string) {
  return prisma.order.findFirst({
    where: {
      orderNumber,
      customerId
    },
    include: {
      sourceDraft: true,
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
          completedAt: true
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

export function orderStatusLabel(status: OrderStatus): string {
  if (status === OrderStatus.PAID) return "Paid";
  if (status === OrderStatus.PAYMENT_PROCESSING) return "Waiting for M-Pesa";
  if (status === OrderStatus.PENDING_PAYMENT) return "Payment pending";
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
  else if (status === FulfillmentStatus.READY_FOR_PICKUP || status === FulfillmentStatus.OUT_FOR_DELIVERY) currentIndex = 2;
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
