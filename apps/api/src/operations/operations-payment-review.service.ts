import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ActorType,
  CheckoutDraftStatus,
  MpesaCallbackProcessingStatus,
  NotificationAudience,
  OrderStatus,
  PaymentReviewDecision,
  PaymentStatus,
  PaymentSettlementError,
  Prisma,
  SourceApp,
  enqueueNotification,
  lockReservationOrder,
  prisma,
  releaseUnpaidOrderReservation,
  settleSuccessfulPayment
} from "@online-saler/database";
import {
  LAUNCH_AFFILIATE_COMMISSION_RATE_BPS,
  SUPPORT_PHONE_LABEL,
  notificationBody,
  notificationDedupeKey
} from "@online-saler/business-rules";
import { OperationsAccessService } from "./operations-access.service";

/**
 * Payments that M-Pesa left ambiguous. A callback that arrives after the
 * reservation expired, for the wrong amount, with a duplicate receipt, or with
 * no matching STK request at all is parked in MANUAL_REVIEW rather than being
 * guessed at. Until this service existed nothing could take those payments
 * further: the shopper had paid, the order stayed unpaid, and only a direct
 * database edit could finish it.
 */

const PAYMENT_INCLUDE = {
  order: {
    include: {
      customer: true,
      affiliate: true,
      fulfillmentNode: true,
      items: { include: { snapshot: true } },
      refunds: true
    }
  },
  callbacks: { orderBy: { createdAt: "desc" } },
  reviewedByAdminUser: true
} as const;

export type PaymentReviewListInput = {
  adminUserId?: string;
  includeResolved?: boolean;
};

export type PaymentReviewActionInput = {
  adminUserId?: string;
  note?: string;
  /** The M-Pesa receipt the reviewer verified in the merchant statement. */
  receiptNumber?: string;
};

export type CallbackResolutionInput = {
  adminUserId?: string;
  note?: string;
};

@Injectable()
export class OperationsPaymentReviewService {
  constructor(private readonly access: OperationsAccessService) {}

  /** Everything a reviewer has to look at: held payments and orphan callbacks. */
  async queue(input: PaymentReviewListInput) {
    await this.access.requirePermission(input.adminUserId, "orders.payment-review");
    const [payments, callbacks] = await Promise.all([
      prisma.payment.findMany({
        where: input.includeResolved
          ? { OR: [{ status: PaymentStatus.MANUAL_REVIEW }, { reviewedAt: { not: null } }] }
          : { status: PaymentStatus.MANUAL_REVIEW },
        include: PAYMENT_INCLUDE,
        orderBy: { requestedAt: "desc" },
        take: 200
      }),
      prisma.mpesaCallback.findMany({
        where: {
          processingStatus: MpesaCallbackProcessingStatus.MANUAL_REVIEW,
          ...(input.includeResolved ? {} : { resolvedAt: null })
        },
        include: { payment: { select: { id: true, orderId: true } }, resolvedByAdminUser: true },
        orderBy: { createdAt: "desc" },
        take: 200
      })
    ]);

    return {
      payments: payments.map((payment) => ({
        id: payment.id,
        status: payment.status,
        amountKsh: payment.amountKsh,
        phone: payment.phone,
        requestedAt: payment.requestedAt,
        completedAt: payment.completedAt,
        providerReceiptNumber: payment.providerReceiptNumber,
        providerCheckoutRequestId: payment.providerCheckoutRequestId,
        providerResultCode: payment.providerResultCode,
        providerResultDescription: payment.providerResultDescription,
        providerQueryAt: payment.providerQueryAt,
        providerQueryResultCode: payment.providerQueryResultCode,
        providerQueryDescription: payment.providerQueryDescription,
        reviewDecision: payment.reviewDecision,
        reviewedAt: payment.reviewedAt,
        reviewNote: payment.reviewNote,
        reviewedBy: payment.reviewedByAdminUser?.name ?? null,
        callbackCount: payment.callbacks.length,
        order: {
          id: payment.order.id,
          orderNumber: payment.order.orderNumber,
          status: payment.order.status,
          totalKsh: payment.order.totalKsh,
          fulfillmentMethod: payment.order.fulfillmentMethod,
          nodeName: payment.order.fulfillmentNode?.name ?? null,
          customerName: payment.order.customer.displayName,
          customerPhone: payment.order.customer.phone,
          affiliateName: payment.order.affiliate?.displayName ?? null,
          itemTitles: payment.order.items.map((item) => item.snapshot?.title ?? "Item"),
          refundedKsh: payment.order.refunds.reduce((sum, refund) => sum + refund.amountKsh, 0)
        },
        // The single question the reviewer has to answer.
        holdReason: describeHold(payment)
      })),
      callbacks: callbacks.map((callback) => ({
        id: callback.id,
        createdAt: callback.createdAt,
        resultCode: callback.resultCode,
        resultDescription: callback.resultDescription,
        amountKsh: callback.amountKsh,
        mpesaReceiptNumber: callback.mpesaReceiptNumber,
        phone: callback.phone,
        transactionDate: callback.transactionDate,
        providerCheckoutRequestId: callback.providerCheckoutRequestId,
        linkedPaymentId: callback.payment?.id ?? null,
        linkedOrderId: callback.payment?.orderId ?? callback.orderId,
        resolvedAt: callback.resolvedAt,
        resolutionNote: callback.resolutionNote,
        resolvedBy: callback.resolvedByAdminUser?.name ?? null
      }))
    };
  }

  /**
   * The money really did arrive. Finishes the order exactly as a clean callback
   * would have: stock becomes PAID, a picking task appears, the affiliate earns
   * a pending commission, and the shopper is told.
   */
  async settle(paymentId: string, input: PaymentReviewActionInput) {
    const actor = await this.actor(input.adminUserId);
    const note = input.note?.trim();
    if (!note) throw new BadRequestException("Say how the payment was verified before settling it.");
    const receiptNumber = input.receiptNumber?.trim().toUpperCase() || null;

    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
      if (!payment) throw new NotFoundException("Payment was not found.");
      await lockReservationOrder(tx, payment.orderId);
      const current = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      if (current.status === PaymentStatus.SUCCESS) return;
      if (current.status !== PaymentStatus.MANUAL_REVIEW) {
        throw new ConflictException("This payment is no longer waiting for review. Refresh the queue.");
      }
      if (receiptNumber) {
        const owner = await tx.payment.findUnique({ where: { providerReceiptNumber: receiptNumber }, select: { id: true } });
        if (owner && owner.id !== paymentId) {
          throw new ConflictException("That M-Pesa receipt is already recorded against a different payment.");
        }
      }

      try {
        await settleSuccessfulPayment(tx, {
          paymentId,
          commissionRateBps: LAUNCH_AFFILIATE_COMMISSION_RATE_BPS,
          requireActiveReservation: false
        });
      } catch (error) {
        if (error instanceof PaymentSettlementError) throw new ConflictException(error.message);
        throw error;
      }

      await tx.payment.update({
        where: { id: paymentId },
        data: {
          reviewDecision: PaymentReviewDecision.SETTLED,
          reviewedByAdminUserId: actor.actorAdminUserId,
          reviewedAt: new Date(),
          reviewNote: note,
          ...(receiptNumber ? { providerReceiptNumber: receiptNumber } : {})
        }
      });
      await tx.mpesaCallback.updateMany({
        where: { paymentId, resolvedAt: null },
        data: { resolvedByAdminUserId: actor.actorAdminUserId, resolvedAt: new Date(), resolutionNote: note }
      });
      await this.audit(tx, actor, paymentId, "PAYMENT_REVIEW_SETTLE", { status: current.status }, { status: PaymentStatus.SUCCESS, receiptNumber }, note);
      await this.queuePaidNotifications(tx, payment.orderId);
    });

    return this.detail(paymentId, input.adminUserId);
  }

  /**
   * The money never arrived. Closes the payment and hands the garments back to
   * the shop floor.
   */
  async reject(paymentId: string, input: PaymentReviewActionInput) {
    const actor = await this.actor(input.adminUserId);
    const note = input.note?.trim();
    if (!note) throw new BadRequestException("Say why the payment was not received.");

    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) throw new NotFoundException("Payment was not found.");
      await lockReservationOrder(tx, payment.orderId);
      const current = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      if (current.status === PaymentStatus.SUCCESS) {
        throw new ConflictException("This payment has already been settled. Record a refund instead.");
      }
      if (current.status !== PaymentStatus.MANUAL_REVIEW) {
        throw new ConflictException("This payment is no longer waiting for review. Refresh the queue.");
      }
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.FAILED,
          reviewDecision: PaymentReviewDecision.NOT_RECEIVED,
          reviewedByAdminUserId: actor.actorAdminUserId,
          reviewedAt: new Date(),
          reviewNote: note,
          completedAt: current.completedAt ?? new Date()
        }
      });
      await releaseUnpaidOrderReservation(tx, payment.orderId, CheckoutDraftStatus.ABANDONED, OrderStatus.CANCELLED);
      await tx.mpesaCallback.updateMany({
        where: { paymentId, resolvedAt: null },
        data: { resolvedByAdminUserId: actor.actorAdminUserId, resolvedAt: new Date(), resolutionNote: note }
      });
      await this.audit(tx, actor, paymentId, "PAYMENT_REVIEW_REJECT", { status: current.status }, { status: PaymentStatus.FAILED }, note);
    });

    return this.detail(paymentId, input.adminUserId);
  }

  /**
   * Closes an orphan callback — one with no matching STK request, usually a
   * customer paying the till directly. Settling the money is a separate finance
   * action; this records that a human looked at it and what they concluded.
   */
  async resolveCallback(callbackId: string, input: CallbackResolutionInput) {
    const actor = await this.actor(input.adminUserId);
    const note = input.note?.trim();
    if (!note) throw new BadRequestException("Say what was done with this callback.");
    const callback = await prisma.mpesaCallback.findUnique({ where: { id: callbackId } });
    if (!callback) throw new NotFoundException("Callback was not found.");
    if (callback.resolvedAt) throw new ConflictException("This callback was already resolved.");

    await prisma.$transaction(async (tx) => {
      const changed = await tx.mpesaCallback.updateMany({
        where: { id: callbackId, resolvedAt: null },
        data: { resolvedByAdminUserId: actor.actorAdminUserId, resolvedAt: new Date(), resolutionNote: note }
      });
      if (changed.count !== 1) throw new ConflictException("This callback was already resolved.");
      await tx.auditLog.create({
        data: {
          actorType: ActorType.EMPLOYEE,
          actorId: actor.actorEmployeeId,
          actorAdminUserId: actor.actorAdminUserId,
          sourceApp: SourceApp.OPERATIONS,
          module: "PAYMENT",
          entityType: "MpesaCallback",
          entityId: callbackId,
          action: "RESOLVE_ORPHAN_CALLBACK",
          beforeJson: { resolvedAt: null },
          afterJson: { resolvedAt: new Date().toISOString() },
          reason: note
        }
      });
    });
    return { ok: true };
  }

  async detail(paymentId: string, adminUserId?: string) {
    await this.access.requirePermission(adminUserId, "orders.payment-review");
    const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: PAYMENT_INCLUDE });
    if (!payment) throw new NotFoundException("Payment was not found.");
    return payment;
  }

  /** Tells the shopper the payment landed, and the affiliate that they earned. */
  private async queuePaidNotifications(tx: Prisma.TransactionClient, orderId: string) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { customer: true, affiliate: true, commission: true, items: { select: { id: true } } }
    });
    if (!order) return;
    await enqueueNotification(tx, {
      topic: "CUSTOMER_PAYMENT_SUCCESS",
      audience: NotificationAudience.CUSTOMER,
      dedupeKey: notificationDedupeKey("CUSTOMER_PAYMENT_SUCCESS", orderId),
      recipientPhone: order.whatsappPhone || order.customer.phone,
      recipientLabel: order.customer.displayName,
      orderId,
      body: notificationBody("CUSTOMER_PAYMENT_SUCCESS", {
        orderNumber: order.orderNumber,
        amountKsh: order.totalKsh,
        itemCount: order.items.length,
        supportPhone: SUPPORT_PHONE_LABEL
      })
    });
    if (order.affiliate && order.commission) {
      await enqueueNotification(tx, {
        topic: "AFFILIATE_NEW_ORDER",
        audience: NotificationAudience.AFFILIATE,
        dedupeKey: notificationDedupeKey("AFFILIATE_NEW_ORDER", orderId),
        recipientPhone: order.affiliate.phone,
        recipientLabel: order.affiliate.displayName,
        orderId,
        affiliateId: order.affiliateId,
        body: notificationBody("AFFILIATE_NEW_ORDER", {
          orderNumber: order.orderNumber,
          amountKsh: order.commission.commissionAmountKsh,
          affiliateName: order.affiliate.displayName
        })
      });
    }
  }

  private async actor(adminUserId?: string) {
    const session = await this.access.requirePermission(adminUserId, "orders.payment-review");
    const adminUser = session.adminUser;
    if (!adminUser) throw new ForbiddenException("This action requires an admin account.");
    return { actorAdminUserId: adminUser.id, actorEmployeeId: adminUser.linkedEmployee?.id ?? null };
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actor: { actorAdminUserId: string; actorEmployeeId: string | null },
    paymentId: string,
    action: string,
    beforeJson: Prisma.InputJsonValue,
    afterJson: Prisma.InputJsonValue,
    reason: string
  ) {
    await tx.auditLog.create({
      data: {
        actorType: ActorType.EMPLOYEE,
        actorId: actor.actorEmployeeId,
        actorAdminUserId: actor.actorAdminUserId,
        sourceApp: SourceApp.OPERATIONS,
        module: "PAYMENT",
        entityType: "Payment",
        entityId: paymentId,
        action,
        beforeJson,
        afterJson,
        reason
      }
    });
  }
}

/** Plain-language reason a payment is sitting in the queue. */
export function describeHold(payment: {
  amountKsh: number;
  providerReceiptNumber: string | null;
  providerResultCode: number | null;
  expiresAt: Date | null;
  order: { totalKsh: number; status: OrderStatus };
}): string {
  if (payment.providerResultCode !== null && payment.providerResultCode !== 0) {
    return "M-Pesa initiation could not be confirmed; check the merchant statement before settling.";
  }
  if (!payment.providerReceiptNumber) return "Callback arrived without an M-Pesa receipt number.";
  if (payment.amountKsh !== payment.order.totalKsh) {
    return `Paid amount KSh ${payment.amountKsh} does not match the order total KSh ${payment.order.totalKsh}.`;
  }
  if (payment.expiresAt && payment.expiresAt.getTime() <= Date.now()) {
    return "Callback arrived after the reservation window closed.";
  }
  return "Callback did not match this order cleanly.";
}
