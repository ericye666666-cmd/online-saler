import { Injectable } from "@nestjs/common";
import {
  CommissionStatus,
  FulfillmentMethod,
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
  prisma
} from "@online-saler/database";
import { summariseDeliveryEconomics } from "@online-saler/business-rules";
import { OperationsAccessService } from "./operations-access.service";

/**
 * The money view. Order counts already existed; what was missing was every
 * figure finance actually reconciles against the M-Pesa statement — what came
 * in, what went back out, what the affiliates are owed, and how much of each
 * KSh 50 delivery fee the company covered itself.
 */

export type FinanceSummaryInput = {
  adminUserId?: string;
  dateFrom?: string;
  dateTo?: string;
};

const PAID_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.FULFILLING,
  OrderStatus.COMPLETED
];

@Injectable()
export class OperationsFinanceService {
  constructor(private readonly access: OperationsAccessService) {}

  async summary(input: FinanceSummaryInput) {
    await this.access.requirePermission(input.adminUserId, "orders.view");
    const range = dateRange(input);
    const orderWhere = range ? { createdAt: range } : {};

    const [
      paidOrders,
      completedOrders,
      grossSales,
      refunds,
      commissionTotals,
      deliveryRows,
      openPaymentReviews,
      openCallbackReviews,
      openExceptions,
      unrefundedClosures
    ] = await Promise.all([
      prisma.order.count({ where: { ...orderWhere, status: { in: [...PAID_ORDER_STATUSES, OrderStatus.REFUNDED] } } }),
      prisma.order.count({ where: { ...orderWhere, status: OrderStatus.COMPLETED } }),
      prisma.order.aggregate({
        where: { ...orderWhere, status: { in: [...PAID_ORDER_STATUSES, OrderStatus.REFUNDED] } },
        _sum: { itemSubtotalKsh: true, deliveryFeeKsh: true, totalKsh: true }
      }),
      prisma.refundRecord.aggregate({
        where: range ? { recordedAt: range } : {},
        _sum: { amountKsh: true },
        _count: true
      }),
      prisma.commission.groupBy({
        by: ["status"],
        where: range ? { createdAt: range } : {},
        _sum: { commissionAmountKsh: true },
        _count: true
      }),
      prisma.orderFulfillment.findMany({
        where: {
          ...(range ? { createdAt: range } : {}),
          order: { is: { fulfillmentMethod: FulfillmentMethod.KIKUYU_LOCAL_DELIVERY, status: { in: PAID_ORDER_STATUSES } } }
        },
        select: {
          actualDeliveryCostKsh: true,
          fulfillmentNodeId: true,
          fulfillmentNode: { select: { name: true } },
          order: { select: { deliveryFeeKsh: true } }
        }
      }),
      prisma.payment.count({ where: { status: PaymentStatus.MANUAL_REVIEW } }),
      prisma.mpesaCallback.count({ where: { processingStatus: "MANUAL_REVIEW", resolvedAt: null } }),
      prisma.orderFulfillment.count({ where: { status: FulfillmentStatus.EXCEPTION } }),
      this.outstandingRefunds()
    ]);

    const delivery = summariseDeliveryEconomics(deliveryRows.map((row) => ({
      customerDeliveryFeeKsh: row.order.deliveryFeeKsh,
      actualDeliveryCostKsh: row.actualDeliveryCostKsh
    })));

    const commission = commissionSummary(commissionTotals);
    const gmvKsh = grossSales._sum.itemSubtotalKsh ?? 0;
    const collectedKsh = grossSales._sum.totalKsh ?? 0;
    const refundedKsh = refunds._sum.amountKsh ?? 0;

    return {
      range: { from: input.dateFrom ?? null, to: input.dateTo ?? null },
      sales: {
        paidOrders,
        completedOrders,
        gmvKsh,
        deliveryRevenueKsh: grossSales._sum.deliveryFeeKsh ?? 0,
        collectedKsh,
        averageOrderValueKsh: paidOrders ? Math.round(gmvKsh / paidOrders) : 0
      },
      refunds: { count: refunds._count, refundedKsh, outstanding: unrefundedClosures },
      commission,
      delivery,
      // GMV minus everything the business gives back or pays out. Delivery
      // subsidy is the part of the Bolt fare the KSh 50 did not cover.
      net: {
        netRevenueKsh: gmvKsh - refundedKsh - commission.owedKsh - Math.max(delivery.subsidyKsh, 0),
        formula: "GMV - refunds - affiliate commission (pending + confirmed + paid) - delivery subsidy"
      },
      attention: {
        paymentsInReview: openPaymentReviews,
        callbacksInReview: openCallbackReviews,
        fulfillmentExceptions: openExceptions
      }
    };
  }

  /** Orders closed with money still held: the refund queue, in plain numbers. */
  private async outstandingRefunds() {
    const orders = await prisma.order.findMany({
      where: { status: OrderStatus.CANCELLED, payments: { some: { status: PaymentStatus.SUCCESS } } },
      select: {
        id: true,
        orderNumber: true,
        totalKsh: true,
        createdAt: true,
        customer: { select: { displayName: true, phone: true } },
        payments: { where: { status: PaymentStatus.SUCCESS }, select: { amountKsh: true } },
        refunds: { select: { amountKsh: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 100
    });
    return orders
      .map((order) => {
        const paidKsh = order.payments.reduce((sum, payment) => sum + payment.amountKsh, 0);
        const refundedKsh = order.refunds.reduce((sum, refund) => sum + refund.amountKsh, 0);
        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customer.displayName,
          customerPhone: order.customer.phone,
          paidKsh,
          refundedKsh,
          outstandingKsh: paidKsh - refundedKsh,
          createdAt: order.createdAt
        };
      })
      .filter((row) => row.outstandingKsh > 0);
  }
}

function commissionSummary(rows: Array<{ status: CommissionStatus; _sum: { commissionAmountKsh: number | null }; _count: number }>) {
  const byStatus = (status: CommissionStatus) => rows.find((row) => row.status === status);
  const amount = (status: CommissionStatus) => byStatus(status)?._sum.commissionAmountKsh ?? 0;
  const count = (status: CommissionStatus) => byStatus(status)?._count ?? 0;
  const pendingKsh = amount(CommissionStatus.PENDING);
  const availableKsh = amount(CommissionStatus.CONFIRMED);
  const paidKsh = amount(CommissionStatus.PAID);
  return {
    pendingKsh,
    availableKsh,
    paidKsh,
    reversedKsh: amount(CommissionStatus.REJECTED),
    pendingCount: count(CommissionStatus.PENDING),
    availableCount: count(CommissionStatus.CONFIRMED),
    paidCount: count(CommissionStatus.PAID),
    reversedCount: count(CommissionStatus.REJECTED),
    /** Everything not reversed: what the affiliate programme actually costs. */
    owedKsh: pendingKsh + availableKsh + paidKsh
  };
}

function dateRange(input: FinanceSummaryInput) {
  const from = input.dateFrom ? new Date(input.dateFrom) : null;
  const to = input.dateTo ? new Date(input.dateTo) : null;
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(input.dateTo ?? "")) to.setUTCDate(to.getUTCDate() + 1);
  const gte = from && Number.isFinite(from.getTime()) ? from : undefined;
  const lt = to && Number.isFinite(to.getTime()) ? to : undefined;
  if (!gte && !lt) return undefined;
  return { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) };
}
