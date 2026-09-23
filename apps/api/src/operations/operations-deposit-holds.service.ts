import { Injectable } from "@nestjs/common";
import { OrderStatus, PaymentKind, PaymentStatus, RefundKind, prisma } from "@online-saler/database";
import { depositHoldDaysLeft } from "@online-saler/business-rules";
import { summariseLapsedDeposits } from "./deposit-ledger";
import { OperationsAccessService } from "./operations-access.service";

/**
 * The deposit board. Every garment currently off sale against half-paid money,
 * soonest deadline first.
 *
 * This exists because a deposit hold is the only order state where doing
 * nothing costs the shop a sale twice over: the piece is unsellable all week,
 * and when the deadline passes the shop owes a refund out of money it already
 * counted. A list ordered by "who do I ring today" is the whole point — the
 * order centre's mixed "waiting for payment" tab cannot answer that.
 */

export type DepositHoldRow = {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  itemCount: number;
  itemTitle: string | null;
  totalKsh: number;
  depositPaidKsh: number;
  balanceKsh: number;
  depositPaidAt: string | null;
  balanceDueAt: string | null;
  daysLeft: number;
  /** True once the balance prompt is out but unanswered — do not ring yet. */
  balanceAttemptPending: boolean;
};

export type DepositBoard = {
  rows: DepositHoldRow[];
  summary: {
    heldOrders: number;
    heldItems: number;
    /** Money already collected and sitting against unfinished sales. */
    depositHeldKsh: number;
    /** What the shop is still waiting to be paid. */
    balanceOutstandingKsh: number;
    /** Holds whose deadline is inside the next 24 hours. */
    dueToday: number;
    /** Holds with two days or less left. */
    dueSoon: number;
  };
  lapsed: {
    orders: number;
    /** Deposit money kept on holds that ran out. */
    forfeitKsh: number;
    /** Refunds raised and not yet executed, so someone can chase them. */
    refundOwedKsh: number;
  };
};

@Injectable()
export class OperationsDepositHoldsService {
  constructor(private readonly access: OperationsAccessService) {}

  async board(adminUserId: string | undefined, now = new Date()): Promise<DepositBoard> {
    await this.access.requirePermission(adminUserId, "page.orders.deposits");

    const held = await prisma.order.findMany({
      where: { status: OrderStatus.DEPOSIT_PAID },
      select: {
        id: true,
        orderNumber: true,
        totalKsh: true,
        depositKsh: true,
        balanceKsh: true,
        depositPaidAt: true,
        balanceDueAt: true,
        customer: { select: { displayName: true, phone: true } },
        items: { select: { snapshot: { select: { title: true } } }, orderBy: { createdAt: "asc" } },
        payments: {
          where: { OR: [
            { kind: PaymentKind.DEPOSIT, status: PaymentStatus.SUCCESS },
            { kind: PaymentKind.BALANCE, status: PaymentStatus.PENDING }
          ] },
          select: { kind: true, status: true, amountKsh: true }
        }
      },
      orderBy: { balanceDueAt: "asc" },
      take: 500
    });

    const rows: DepositHoldRow[] = held.map((order) => {
      const depositPaidKsh = order.payments
        .filter((payment) => payment.kind === PaymentKind.DEPOSIT && payment.status === PaymentStatus.SUCCESS)
        .reduce((sum, payment) => sum + payment.amountKsh, 0);
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customer.displayName,
        customerPhone: order.customer.phone,
        itemCount: order.items.length,
        itemTitle: order.items[0]?.snapshot?.title ?? null,
        totalKsh: order.totalKsh,
        depositPaidKsh: depositPaidKsh || order.depositKsh,
        balanceKsh: order.balanceKsh,
        depositPaidAt: order.depositPaidAt?.toISOString() ?? null,
        balanceDueAt: order.balanceDueAt?.toISOString() ?? null,
        daysLeft: order.balanceDueAt ? depositHoldDaysLeft(order.balanceDueAt, now) : 0,
        balanceAttemptPending: order.payments.some(
          (payment) => payment.kind === PaymentKind.BALANCE && payment.status === PaymentStatus.PENDING
        )
      };
    });

    const dayMs = 24 * 60 * 60 * 1000;
    const summary = {
      heldOrders: rows.length,
      heldItems: rows.reduce((sum, row) => sum + row.itemCount, 0),
      depositHeldKsh: rows.reduce((sum, row) => sum + row.depositPaidKsh, 0),
      balanceOutstandingKsh: rows.reduce((sum, row) => sum + row.balanceKsh, 0),
      dueToday: held.filter((order) => order.balanceDueAt && order.balanceDueAt.getTime() - now.getTime() <= dayMs).length,
      dueSoon: held.filter((order) => order.balanceDueAt && order.balanceDueAt.getTime() - now.getTime() <= 2 * dayMs).length
    };

    return { rows, summary, lapsed: await this.lapsedPosition() };
  }

  /**
   * What the lapses have kept and what they still owe. The arithmetic lives in
   * `deposit-ledger` so this board and the finance summary can never disagree
   * about what a forfeit is worth.
   */
  private async lapsedPosition() {
    const lapsed = await prisma.order.findMany({
      where: { status: OrderStatus.DEPOSIT_EXPIRED },
      select: {
        totalKsh: true,
        payments: {
          where: { kind: PaymentKind.DEPOSIT, status: PaymentStatus.SUCCESS },
          select: { amountKsh: true }
        },
        refundRequests: {
          where: { kind: RefundKind.LAPSED_DEPOSIT },
          select: { amountKsh: true, status: true, completedAt: true }
        }
      },
      take: 2000
    });
    const ledger = summariseLapsedDeposits(lapsed);
    return { orders: ledger.lapsedOrders, forfeitKsh: ledger.forfeitKsh, refundOwedKsh: ledger.refundOwedKsh };
  }
}
