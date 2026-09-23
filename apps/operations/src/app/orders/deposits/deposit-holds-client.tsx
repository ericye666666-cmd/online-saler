"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClockIcon, PhoneIcon, RefreshCwIcon } from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatKsh, formatMoment, operationsRequester } from "@/lib/operations-request";
import { t } from "@/i18n/runtime";

/**
 * The deposit board: every garment off sale against half-paid money, soonest
 * deadline first.
 *
 * Read it as a call list. A shopper who paid a deposit wants the piece — they
 * were short of cash, not uninterested — so a phone call on the last day turns
 * a lapsed hold back into a sale. Nothing here changes an order: paying is
 * something only the shopper can do, from their own M-Pesa handset.
 */

type DepositRow = {
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
  balanceAttemptPending: boolean;
};

type Board = {
  rows: DepositRow[];
  summary: {
    heldOrders: number;
    heldItems: number;
    depositHeldKsh: number;
    balanceOutstandingKsh: number;
    dueToday: number;
    dueSoon: number;
  };
  lapsed: { orders: number; forfeitKsh: number; refundOwedKsh: number };
};

const EMPTY: Board = {
  rows: [],
  summary: { heldOrders: 0, heldItems: 0, depositHeldKsh: 0, balanceOutstandingKsh: 0, dueToday: 0, dueSoon: 0 },
  lapsed: { orders: 0, forfeitKsh: 0, refundOwedKsh: 0 }
};

export function DepositHoldsPage() {
  const { session } = useOperationsSession();
  const accessToken = session?.accessToken ?? "";
  const [board, setBoard] = useState<Board>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      setBoard(await operationsRequester(accessToken)<Board>("/operations/deposit-holds"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("无法读取定金看板。"));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const metrics: Array<[string, string]> = [
    [t("持有中订单"), String(board.summary.heldOrders)],
    [t("锁定件数"), String(board.summary.heldItems)],
    [t("定金在途"), formatKsh(board.summary.depositHeldKsh)],
    [t("待收尾款"), formatKsh(board.summary.balanceOutstandingKsh)],
    [t("24 小时内到期"), String(board.summary.dueToday)],
    [t("2 天内到期"), String(board.summary.dueSoon)]
  ];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t("定金看板")}</CardTitle>
            <CardDescription>
              {t("已付 50% 定金、货已锁定、等尾款的订单。按到期时间从近到远排，最上面的今天就该打电话。")}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
            <RefreshCwIcon className="size-4" /> {loading ? t("读取中…") : t("刷新")}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {metrics.map(([label, value]) => (
            <div key={label} className="rounded-md border p-3">
              <div className="text-muted-foreground text-xs">{label}</div>
              <div className="text-lg font-semibold">{value}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("待收尾款")}</CardTitle>
          <CardDescription>
            {t("尾款只能由顾客本人在自己的 M-Pesa 手机上付，这里不提供代收操作。到期未付会自动释放库存并生成退款工单。")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {board.rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("剩余")}</TableHead>
                  <TableHead>{t("订单")}</TableHead>
                  <TableHead>{t("顾客")}</TableHead>
                  <TableHead>{t("商品")}</TableHead>
                  <TableHead>{t("订单总额")}</TableHead>
                  <TableHead>{t("已付定金")}</TableHead>
                  <TableHead>{t("待收尾款")}</TableHead>
                  <TableHead>{t("到期时间")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {board.rows.map((row) => (
                  <TableRow key={row.orderId}>
                    <TableCell>
                      {/* The only column that decides what a person does next,
                          so it leads the row rather than sitting at the end. */}
                      <Badge variant={row.daysLeft <= 1 ? "destructive" : row.daysLeft <= 2 ? "secondary" : "outline"}>
                        <ClockIcon className="size-3" />
                        {row.daysLeft <= 0 ? t("今天到期") : row.daysLeft === 1 ? t("剩 1 天") : t("剩 {days} 天", { days: String(row.daysLeft) })}
                      </Badge>
                      {row.balanceAttemptPending ? (
                        <div className="text-muted-foreground mt-1 text-xs">{t("尾款支付进行中，先别打扰")}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/customer-service/orders/${row.orderId}`} className="underline">{row.orderNumber}</Link>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{row.customerName || t("访客顾客")}</div>
                      {row.customerPhone ? (
                        <a className="text-muted-foreground font-mono inline-flex items-center gap-1" href={`tel:+${row.customerPhone}`}>
                          <PhoneIcon className="size-3" />+{row.customerPhone}
                        </a>
                      ) : <div className="text-muted-foreground">—</div>}
                    </TableCell>
                    <TableCell className="max-w-56 text-xs">
                      {row.itemTitle ?? "—"}
                      {row.itemCount > 1 ? <span className="text-muted-foreground"> +{row.itemCount - 1}</span> : null}
                    </TableCell>
                    <TableCell className="text-xs">{formatKsh(row.totalKsh)}</TableCell>
                    <TableCell className="text-xs">{formatKsh(row.depositPaidKsh)}</TableCell>
                    <TableCell className="font-medium">{formatKsh(row.balanceKsh)}</TableCell>
                    <TableCell className="text-xs">
                      {formatMoment(row.balanceDueAt)}
                      <div className="text-muted-foreground">{t("定金付于")} {formatMoment(row.depositPaidAt)}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><ClockIcon /></EmptyMedia>
                <EmptyTitle>{t("当前没有定金持有的订单")}</EmptyTitle>
                <EmptyDescription>{t("顾客在结账时选择「先付 50%」后，订单会出现在这里。")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("已逾期的定金")}</CardTitle>
          <CardDescription>
            {t("到期未付尾款、库存已经放回去的订单。违约金是实收定金减去应退金额，退款仍需财务在 M-Pesa 手工执行。")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground text-xs">{t("逾期订单")}</div>
            <div className="text-lg font-semibold">{board.lapsed.orders}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground text-xs">{t("违约金收入")}</div>
            <div className="text-lg font-semibold">{formatKsh(board.lapsed.forfeitKsh)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground text-xs">{t("待退顾客")}</div>
            <div className="text-lg font-semibold">{formatKsh(board.lapsed.refundOwedKsh)}</div>
            <Link href="/customer-service/refunds" className="text-xs underline">{t("去退款审批")}</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
