"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCwIcon } from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoment, operationsRequester } from "@/lib/operations-request";
import { t } from "@/i18n/runtime";

/**
 * The outbound message queue. It exists so a queue that stops moving — a
 * missing SMS credential, a rejected number — looks like a backlog instead of
 * looking like silence.
 */

type NotificationRow = {
  id: string;
  topic: string;
  audience: string;
  channel: string;
  status: "PENDING" | "SENT" | "FAILED" | "CANCELLED";
  recipientPhone: string;
  recipientLabel: string | null;
  body: string;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  provider: string | null;
  sentAt: string | null;
  createdAt: string;
  orderNumber: string | null;
  nodeName: string | null;
};

type Payload = { counts: Record<string, number>; notifications: NotificationRow[] };

export function NotificationsPage() {
  const { session, hasPermission } = useOperationsSession();
  const accessToken = session?.accessToken ?? "";
  const canRetry = hasPermission("notifications.retry");
  const request = useMemo(() => operationsRequester(accessToken), [accessToken]);

  const [payload, setPayload] = useState<Payload>({ counts: {}, notifications: [] });
  const [filter, setFilter] = useState<"ALL" | NotificationRow["status"]>("ALL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setBusy(true);
    setError("");
    try {
      setPayload(await request<Payload>("/operations/notifications"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("无法读取通知队列。"));
    } finally {
      setBusy(false);
    }
  }, [accessToken, request]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: "retry" | "cancel") {
    setBusy(true);
    try {
      await request(`/operations/notifications/${id}/${action}`, { method: "POST" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("操作失败。"));
    } finally {
      setBusy(false);
    }
  }

  const rows = filter === "ALL"
    ? payload.notifications
    : payload.notifications.filter((row) => row.status === filter);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t("通知队列")}</CardTitle>
            <CardDescription>
              {t("付款成功、待自提、已发货、佣金可提等消息先写进队列，再由每分钟的任务发送。没有配置短信服务商时，消息会停在待发送——这是有意的，不会静默丢掉。")}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
            <RefreshCwIcon className={busy ? "animate-spin" : ""} /> {t("刷新")}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {(["ALL", "PENDING", "SENT", "FAILED", "CANCELLED"] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? "default" : "outline"}
              onClick={() => setFilter(value)}
            >
              {value === "ALL" ? t("全部") : value}
              {value !== "ALL" && payload.counts[value] ? ` (${payload.counts[value]})` : ""}
            </Button>
          ))}
          {error ? <p className="text-destructive text-sm w-full">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("状态")}</TableHead>
                <TableHead>{t("对象")}</TableHead>
                <TableHead>{t("内容")}</TableHead>
                <TableHead>{t("订单")}</TableHead>
                <TableHead>{t("时间")}</TableHead>
                <TableHead>{t("操作")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">{t("没有匹配的通知。")}</TableCell>
                </TableRow>
              ) : null}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={row.status === "FAILED" ? "destructive" : row.status === "SENT" ? "secondary" : "outline"}>
                        {row.status}
                      </Badge>
                      {row.attempts ? <span className="text-xs text-muted-foreground">{t("已尝试")} {row.attempts}</span> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{row.recipientLabel ?? row.audience}</div>
                    <div className="text-xs text-muted-foreground font-mono">{row.recipientPhone}</div>
                    <div className="text-xs text-muted-foreground">{row.topic}</div>
                  </TableCell>
                  <TableCell className="max-w-96">
                    <p className="text-sm">{row.body}</p>
                    {row.lastError ? <p className="text-xs text-destructive mt-1">{row.lastError}</p> : null}
                  </TableCell>
                  <TableCell className="text-sm">{row.orderNumber ?? row.nodeName ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    <div>{t("创建")} {formatMoment(row.createdAt)}</div>
                    {row.sentAt ? <div>{t("发送")} {formatMoment(row.sentAt)}</div> : <div>{t("下次尝试")} {formatMoment(row.nextAttemptAt)}</div>}
                  </TableCell>
                  <TableCell>
                    {canRetry && row.status === "FAILED" ? (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(row.id, "retry")}>{t("重试")}</Button>
                    ) : null}
                    {canRetry && (row.status === "PENDING" || row.status === "FAILED") ? (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(row.id, "cancel")}>{t("取消")}</Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
