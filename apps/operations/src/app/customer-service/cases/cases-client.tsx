"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { RefreshCwIcon, SearchIcon } from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { t } from "@/i18n/runtime";

import {
  CASE_GROUP_LABELS,
  CASE_STATUS_LABELS,
  CASE_TYPE_LABELS,
  ESCALATION_LABELS,
  PRIORITY_LABELS,
  money,
  serviceDeskRequest,
  slaLabel,
  when,
  type Assignee,
  type CaseOptions,
  type CasePriority,
  type CaseRow,
  type CaseStatus,
  type EscalationTarget
} from "../service-desk-api";

/**
 * The case queue: everything support still owes somebody an answer for.
 *
 * Sorted the way an agent should work it -- unfinished first, nearest deadline
 * next -- so picking up the top row is always the right thing to do.
 */
export function CustomerServiceCasesPage() {
  const { session, hasPermission } = useOperationsSession();
  const accessToken = session?.accessToken ?? "";
  const myAdminUserId = session?.adminUser?.id ?? "";

  const canCreate = hasPermission("action.customer-service.create");
  const canEdit = hasPermission("action.customer-service.edit");
  const canAssign = hasPermission("customer-service.assign");
  const canEscalate = hasPermission("customer-service.escalate");
  const canRequestRefund = hasPermission("customer-service.refund-request");

  const [cases, setCases] = useState<CaseRow[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [options, setOptions] = useState<CaseOptions | null>(null);
  const [filters, setFilters] = useState({
    search: "", status: "", priority: "", caseType: "", assignedAdminUserId: "", escalatedTo: "", overdue: "", unassigned: ""
  });
  const [form, setForm] = useState({ caseType: "OTHER", priority: "", title: "", description: "", orderId: "", customerId: "" });
  const [refundForm, setRefundForm] = useState({ caseId: "", orderId: "", amountKsh: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setBusy(true);
    setError("");
    try {
      const [nextCases, nextAssignees, nextOptions] = await Promise.all([
        serviceDeskRequest<CaseRow[]>(accessToken, "/operations/customer-service/cases", {
          query: {
            search: filters.search || undefined,
            status: filters.status || undefined,
            priority: filters.priority || undefined,
            caseType: filters.caseType || undefined,
            assignedAdminUserId: filters.assignedAdminUserId || undefined,
            escalatedTo: filters.escalatedTo || undefined,
            overdue: filters.overdue || undefined,
            unassigned: filters.unassigned || undefined
          }
        }),
        serviceDeskRequest<Assignee[]>(accessToken, "/operations/customer-service/assignees"),
        serviceDeskRequest<CaseOptions>(accessToken, "/operations/customer-service/case-options")
      ]);
      setCases(nextCases);
      setAssignees(nextAssignees);
      setOptions(nextOptions);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("无法读取客服记录。"));
    } finally {
      setBusy(false);
    }
  }, [accessToken, filters]);

  useEffect(() => { void load(); }, [load]);

  async function act(path: string, body: unknown, success: string, method: "POST" | "PATCH" = "POST") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await serviceDeskRequest(accessToken, path, { method, body: JSON.stringify(body) });
      setMessage(success);
      await load();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("操作失败。"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createCase() {
    const ok = await act("/operations/customer-service/cases", {
      caseType: form.caseType,
      ...(form.priority ? { priority: form.priority } : {}),
      title: form.title,
      description: form.description || undefined,
      orderId: form.orderId || undefined,
      customerId: form.customerId || undefined
    }, t("客服记录已创建。"));
    if (ok) setForm({ caseType: "OTHER", priority: "", title: "", description: "", orderId: "", customerId: "" });
  }

  async function createRefundRequest() {
    const ok = await act("/operations/customer-service/refund-requests", {
      orderId: refundForm.orderId,
      serviceCaseId: refundForm.caseId || undefined,
      amountKsh: Number(refundForm.amountKsh),
      reason: refundForm.reason
    }, t("退款申请已提交给财务审批。"));
    if (ok) setRefundForm({ caseId: "", orderId: "", amountKsh: "", reason: "" });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">{t("客户服务")}</p>
          <h1 className="font-semibold text-2xl tracking-tight">{t("客服工单")}</h1>
          <p className="max-w-3xl text-muted-foreground text-sm">
            {t("每个工单都有明确类型、负责人、优先级和处理时限。未处理的排在最前，最快到期的排在最上。")}
          </p>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => void load()}>
          <RefreshCwIcon data-icon="inline-start" />
          {t("刷新")}
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-3 xl:grid-cols-4">
          <Field>
            <FieldLabel>{t("搜索")}</FieldLabel>
            <div className="flex gap-2">
              <Input
                value={filters.search}
                placeholder={t("标题、顾客或订单号")}
                onChange={(event) => setFilters({ ...filters, search: event.target.value })}
              />
              <Button type="button" disabled={busy} onClick={() => void load()}><SearchIcon /></Button>
            </div>
          </Field>
          <Field>
            <FieldLabel>{t("状态")}</FieldLabel>
            <NativeSelect value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <NativeSelectOption value="">{t("全部")}</NativeSelectOption>
              {(Object.keys(CASE_STATUS_LABELS) as CaseStatus[]).map((status) => (
                <NativeSelectOption key={status} value={status}>{t(CASE_STATUS_LABELS[status])}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{t("优先级")}</FieldLabel>
            <NativeSelect value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}>
              <NativeSelectOption value="">{t("全部")}</NativeSelectOption>
              {(Object.keys(PRIORITY_LABELS) as CasePriority[]).map((priority) => (
                <NativeSelectOption key={priority} value={priority}>{t(PRIORITY_LABELS[priority])}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{t("负责人")}</FieldLabel>
            <NativeSelect value={filters.assignedAdminUserId} onChange={(event) => setFilters({ ...filters, assignedAdminUserId: event.target.value, unassigned: "" })}>
              <NativeSelectOption value="">{t("全部")}</NativeSelectOption>
              {myAdminUserId ? <NativeSelectOption value={myAdminUserId}>{t("我的工单")}</NativeSelectOption> : null}
              {assignees.map((assignee) => (
                <NativeSelectOption key={assignee.id} value={assignee.id}>{assignee.name} ({assignee.openCases})</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{t("问题类型")}</FieldLabel>
            <NativeSelect value={filters.caseType} onChange={(event) => setFilters({ ...filters, caseType: event.target.value })}>
              <NativeSelectOption value="">{t("全部")}</NativeSelectOption>
              {options?.groups.map((group) => (
                <optgroup key={group.group} label={t(CASE_GROUP_LABELS[group.group] ?? group.group)}>
                  {group.caseTypes.map((caseType) => (
                    <NativeSelectOption key={caseType} value={caseType}>{t(CASE_TYPE_LABELS[caseType] ?? caseType)}</NativeSelectOption>
                  ))}
                </optgroup>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{t("已升级到")}</FieldLabel>
            <NativeSelect value={filters.escalatedTo} onChange={(event) => setFilters({ ...filters, escalatedTo: event.target.value })}>
              <NativeSelectOption value="">{t("全部")}</NativeSelectOption>
              {(Object.keys(ESCALATION_LABELS) as EscalationTarget[]).map((target) => (
                <NativeSelectOption key={target} value={target}>{t(ESCALATION_LABELS[target])}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{t("快捷筛选")}</FieldLabel>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={filters.overdue === "1" ? "default" : "outline"}
                onClick={() => setFilters({ ...filters, overdue: filters.overdue === "1" ? "" : "1" })}
              >
                {t("已逾期")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filters.unassigned === "1" ? "default" : "outline"}
                onClick={() => setFilters({ ...filters, unassigned: filters.unassigned === "1" ? "" : "1", assignedAdminUserId: "" })}
              >
                {t("未分配")}
              </Button>
            </div>
          </Field>
        </CardContent>
      </Card>

      {message ? <StatusMessage>{message}</StatusMessage> : null}
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}

      <Card>
        <CardHeader><CardTitle>{t("客服工单")} ({cases.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {[t("工单"), t("类型"), t("优先级"), t("状态"), t("时限"), t("负责人"), t("顾客/订单"), t("操作")].map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">{t("没有符合条件的工单。")}</TableCell>
                </TableRow>
              ) : cases.map((serviceCase) => (
                <TableRow key={serviceCase.id} className={cn(serviceCase.overdue && "bg-destructive/5")}>
                  <TableCell className="max-w-64">
                    <div className="font-medium">{serviceCase.title}</div>
                    <div className="truncate text-muted-foreground text-xs">{serviceCase.description || "-"}</div>
                    {serviceCase.escalated ? (
                      <Badge variant="destructive" className="mt-1">
                        {t("已升级")} · {t(ESCALATION_LABELS[serviceCase.escalatedTo as EscalationTarget] ?? serviceCase.escalatedTo ?? "")}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">{t(CASE_TYPE_LABELS[serviceCase.caseType] ?? serviceCase.caseType)}</TableCell>
                  <TableCell>
                    <Badge variant={serviceCase.priority === "URGENT" || serviceCase.priority === "HIGH" ? "destructive" : "secondary"}>
                      {t(PRIORITY_LABELS[serviceCase.priority] ?? serviceCase.priority)}
                    </Badge>
                  </TableCell>
                  <TableCell><Badge variant="outline">{t(CASE_STATUS_LABELS[serviceCase.status] ?? serviceCase.status)}</Badge></TableCell>
                  <TableCell className={cn("text-xs", serviceCase.overdue && "font-medium text-destructive")}>
                    {slaLabel(serviceCase.slaDueAt, serviceCase.overdue)}
                    <div className="text-muted-foreground">{when(serviceCase.slaDueAt)}</div>
                  </TableCell>
                  <TableCell>
                    {canAssign ? (
                      <NativeSelect
                        value={serviceCase.assignedAdminUser?.id ?? ""}
                        disabled={busy}
                        onChange={(event) => void act(
                          `/operations/customer-service/cases/${serviceCase.id}/assign`,
                          { assignedAdminUserId: event.target.value || null },
                          t("负责人已更新。")
                        )}
                      >
                        <NativeSelectOption value="">{t("未分配")}</NativeSelectOption>
                        {assignees.map((assignee) => (
                          <NativeSelectOption key={assignee.id} value={assignee.id}>{assignee.name}</NativeSelectOption>
                        ))}
                      </NativeSelect>
                    ) : (serviceCase.assignedAdminUser?.name ?? t("未分配"))}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div>{serviceCase.customer?.displayName || serviceCase.customer?.phone || "-"}</div>
                    {serviceCase.order ? (
                      <Link href={`/customer-service/orders/${serviceCase.order.id}`} className="font-mono underline">
                        {serviceCase.order.orderNumber}
                      </Link>
                    ) : null}
                    {serviceCase.order ? <div className="text-muted-foreground">{money(serviceCase.order.totalKsh)}</div> : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {canEdit && !serviceCase.afterSaleReturn && serviceCase.status !== "CLOSED" ? (
                        <>
                          {serviceCase.status !== "RESOLVED" ? (
                            <Button size="sm" disabled={busy} onClick={() => void act(
                              `/operations/customer-service/cases/${serviceCase.id}`, { status: "RESOLVED" }, t("工单已解决。"), "PATCH"
                            )}>{t("解决")}</Button>
                          ) : (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(
                              `/operations/customer-service/cases/${serviceCase.id}`, { status: "CLOSED" }, t("工单已关闭。"), "PATCH"
                            )}>{t("关闭")}</Button>
                          )}
                        </>
                      ) : null}
                      {canEscalate && serviceCase.status !== "CLOSED" ? (
                        <Button
                          size="sm"
                          variant={serviceCase.escalated ? "outline" : "secondary"}
                          disabled={busy}
                          onClick={() => {
                            const note = window.prompt(serviceCase.escalated ? t("撤销升级的原因？") : t("升级原因？"));
                            if (!note) return;
                            void act(
                              `/operations/customer-service/cases/${serviceCase.id}/escalate`,
                              { escalated: !serviceCase.escalated, note },
                              serviceCase.escalated ? t("已撤销升级。") : t("工单已升级。")
                            );
                          }}
                        >
                          {serviceCase.escalated ? t("撤销升级") : t("升级")}
                        </Button>
                      ) : null}
                      {serviceCase.order ? (
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/customer-service/orders/${serviceCase.order.id}`}>{t("订单 360")}</Link>
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        {canCreate ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("新建客服工单")}</CardTitle>
              <CardDescription>{t("选了问题类型，系统会自动决定队列、默认优先级和处理时限。")}</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel>{t("问题类型")}</FieldLabel>
                  <NativeSelect value={form.caseType} onChange={(event) => setForm({ ...form, caseType: event.target.value })}>
                    {options?.groups.map((group) => (
                      <optgroup key={group.group} label={t(CASE_GROUP_LABELS[group.group] ?? group.group)}>
                        {group.caseTypes.map((caseType) => (
                          <NativeSelectOption key={caseType} value={caseType}>{t(CASE_TYPE_LABELS[caseType] ?? caseType)}</NativeSelectOption>
                        ))}
                      </optgroup>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>{t("优先级")}</FieldLabel>
                  <NativeSelect value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                    <NativeSelectOption value="">{t("按问题类型默认")}</NativeSelectOption>
                    {(Object.keys(PRIORITY_LABELS) as CasePriority[]).map((priority) => (
                      <NativeSelectOption key={priority} value={priority}>
                        {t(PRIORITY_LABELS[priority])}{options ? ` · ${options.slaHours[priority]}h` : ""}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>{t("标题")}</FieldLabel>
                  <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
                </Field>
                <Field>
                  <FieldLabel>{t("订单 ID")}</FieldLabel>
                  <Input value={form.orderId} onChange={(event) => setForm({ ...form, orderId: event.target.value })} />
                </Field>
                <Field>
                  <FieldLabel>{t("说明")}</FieldLabel>
                  <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
                </Field>
                <Button type="button" disabled={busy || !form.title.trim()} onClick={() => void createCase()}>{t("创建")}</Button>
              </FieldGroup>
            </CardContent>
          </Card>
        ) : null}

        {canRequestRefund ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("申请退款")}</CardTitle>
              <CardDescription>{t("客服只能发起申请。钱要等财务批准并在 M-Pesa 打款后才会动。")}</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel>{t("订单 ID")}</FieldLabel>
                  <Input value={refundForm.orderId} onChange={(event) => setRefundForm({ ...refundForm, orderId: event.target.value })} />
                </Field>
                <Field>
                  <FieldLabel>{t("关联工单 ID")}</FieldLabel>
                  <Input value={refundForm.caseId} onChange={(event) => setRefundForm({ ...refundForm, caseId: event.target.value })} />
                </Field>
                <Field>
                  <FieldLabel>{t("退款金额 (KSh)")}</FieldLabel>
                  <Input
                    value={refundForm.amountKsh}
                    inputMode="numeric"
                    onChange={(event) => setRefundForm({ ...refundForm, amountKsh: event.target.value.replace(/\D/g, "") })}
                  />
                </Field>
                <Field>
                  <FieldLabel>{t("退款原因")}</FieldLabel>
                  <Textarea value={refundForm.reason} onChange={(event) => setRefundForm({ ...refundForm, reason: event.target.value })} />
                </Field>
                <Button
                  type="button"
                  disabled={busy || !refundForm.orderId.trim() || !refundForm.amountKsh || !refundForm.reason.trim()}
                  onClick={() => void createRefundRequest()}
                >
                  {t("提交给财务审批")}
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>
        ) : null}
      </section>
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
