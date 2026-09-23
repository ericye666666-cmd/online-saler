"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { MessageCircleIcon, RefreshCwIcon, SearchIcon } from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { t } from "@/i18n/runtime";

import { money, serviceDeskRequest, when, type Dashboard, type GlobalSearchResult } from "./service-desk-api";

/**
 * The customer service front door.
 *
 * A customer calls; the agent types the number they are calling from and gets
 * their orders. The counters above the box are what a supervisor reads to
 * decide who to chase, and each one links to the queue it counts.
 */
export function CustomerServiceDeskPage() {
  const { session } = useOperationsSession();
  const accessToken = session?.accessToken ?? "";
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [result, setResult] = useState<GlobalSearchResult | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    if (!accessToken) return;
    try {
      setDashboard(await serviceDeskRequest<Dashboard>(accessToken, "/operations/customer-service/dashboard"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("无法读取客服看板。"));
    }
  }, [accessToken]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  async function runSearch() {
    if (!accessToken || !search.trim()) return;
    setBusy(true);
    setError("");
    try {
      setResult(await serviceDeskRequest<GlobalSearchResult>(accessToken, "/operations/customer-service/search", {
        query: { search: search.trim() }
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("搜索失败。"));
    } finally {
      setBusy(false);
    }
  }

  const metrics: Array<{ label: string; value: number; href?: string; alert?: boolean }> = [
    { label: t("未结案"), value: dashboard?.openCases ?? 0, href: "/customer-service/cases?status=OPEN" },
    { label: t("今日新增"), value: dashboard?.newToday ?? 0, href: "/customer-service/cases" },
    { label: t("处理中"), value: dashboard?.inProgress ?? 0, href: "/customer-service/cases?status=IN_PROGRESS" },
    { label: t("今日已解决"), value: dashboard?.resolvedToday ?? 0 },
    { label: t("已逾期"), value: dashboard?.overdue ?? 0, href: "/customer-service/cases", alert: true },
    { label: t("已升级"), value: dashboard?.escalated ?? 0, href: "/customer-service/cases", alert: true },
    { label: t("未分配"), value: dashboard?.unassigned ?? 0, href: "/customer-service/cases" },
    { label: t("支付问题"), value: dashboard?.paymentIssues ?? 0, href: "/customer-service/payments" },
    { label: t("配送问题"), value: dashboard?.deliveryIssues ?? 0, href: "/customer-service/delivery" },
    { label: t("售后"), value: dashboard?.afterSales ?? 0, href: "/customer-service/after-sales" },
    { label: t("待审批退款"), value: dashboard?.pendingRefundRequests ?? 0, href: "/customer-service/refunds", alert: true }
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">{t("客户服务")}</p>
          <h1 className="font-semibold text-2xl tracking-tight">{t("客服看板")}</h1>
          <p className="max-w-3xl text-muted-foreground text-sm">
            {t("用手机号、订单号或姓名找到顾客。手机号是最可靠的一种——大部分顾客是访客下单，没有账号也没有邮箱。")}
          </p>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => void loadDashboard()}>
          <RefreshCwIcon data-icon="inline-start" />
          {t("刷新")}
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {metrics.map((metric) => {
          const card = (
            <Card className={cn("h-full", metric.alert && metric.value > 0 && "border-destructive/40 bg-destructive/5")}>
              <CardHeader>
                <CardDescription>{metric.label}</CardDescription>
                <CardTitle className="tabular-nums">{metric.value}</CardTitle>
              </CardHeader>
            </Card>
          );
          return metric.href ? <Link key={metric.label} href={metric.href}>{card}</Link> : <div key={metric.label}>{card}</div>;
        })}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("全局搜索")}</CardTitle>
          <CardDescription>{t("0712… 和 254712… 两种写法都能搜到同一个人。")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={search}
              placeholder={t("手机号、订单号或姓名")}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void runSearch(); }}
            />
            <Button type="button" disabled={busy || !search.trim()} onClick={() => void runSearch()}>
              <SearchIcon data-icon="inline-start" />
              {t("搜索")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}

      {result ? (
        <>
          <Card>
            <CardHeader><CardTitle>{t("顾客")} ({result.customers.length})</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {[t("顾客"), t("电话"), t("订单数"), t("客服记录"), t("历史订单"), t("操作")].map((header) => (
                      <TableHead key={header}>{header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.customers.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">{t("没有找到顾客。")}</TableCell></TableRow>
                  ) : result.customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <div className="font-medium">{customer.displayName || t("访客顾客")}</div>
                        <div className="text-muted-foreground text-xs">{customer.email || "-"}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{customer.phone || "-"}</TableCell>
                      <TableCell>{customer._count.orders}</TableCell>
                      <TableCell>{customer._count.customerServiceCases}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {customer.orders.map((order) => (
                            <Link key={order.id} href={`/customer-service/orders/${order.id}`} className="font-mono text-xs underline">
                              {order.orderNumber} · {order.status} · {money(order.totalKsh)} · {when(order.createdAt)}
                            </Link>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {customer.whatsAppUrl ? (
                          <Button size="sm" variant="outline" asChild>
                            <a href={customer.whatsAppUrl} target="_blank" rel="noreferrer noopener">
                              <MessageCircleIcon data-icon="inline-start" />
                              {t("WhatsApp")}
                            </a>
                          </Button>
                        ) : <span className="text-muted-foreground text-xs">{t("没有可用号码")}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("订单")} ({result.orders.length})</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {[t("订单"), t("顾客"), t("订单状态"), t("履约状态"), t("当前持有人"), t("金额"), t("客服记录")].map((header) => (
                      <TableHead key={header}>{header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.orders.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">{t("没有找到订单。")}</TableCell></TableRow>
                  ) : result.orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Link href={`/customer-service/orders/${order.id}`} className="font-mono text-xs underline">{order.orderNumber}</Link>
                        <div className="text-muted-foreground text-xs">{when(order.createdAt)}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{order.customer.displayName || t("访客顾客")}</div>
                        <div className="font-mono text-muted-foreground">{order.customer.phone ?? "-"}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{order.status}</Badge></TableCell>
                      <TableCell className="text-xs">{order.fulfillment?.status ?? t("未进入履约")}</TableCell>
                      <TableCell className="text-xs">{order.fulfillment?.currentHolderLabel ?? "-"}</TableCell>
                      <TableCell>{money(order.totalKsh)}</TableCell>
                      <TableCell>{order._count.customerServiceCases}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function StatusMessage({ children, tone }: { children: ReactNode; tone?: "danger" }) {
  return (
    <div className={cn("rounded-lg border p-3 text-sm", tone === "danger" ? "border-destructive/30 bg-destructive/10 text-destructive" : "bg-muted")}>
      {children}
    </div>
  );
}
