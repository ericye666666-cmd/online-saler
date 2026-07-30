import { OrderStatus, PaymentStatus, prisma } from "@online-saler/database";

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
