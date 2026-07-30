"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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

const API_PROXY_URL = "/api-proxy";

export type CustomerServiceView = "customers" | "orders" | "payment" | "pickup" | "delivery" | "after-sales" | "notes";

type Summary = {
  customers: number;
  openCases: number;
  paymentCases: number;
  pickupCases: number;
  deliveryCases: number;
  afterSaleCases: number;
  recentNotes: number;
};

type CustomerRow = {
  id: string;
  email: string;
  displayName?: string | null;
  phone?: string | null;
  status: string;
  createdAt: string;
  _count: {
    orders: number;
    customerServiceCases: number;
    customerServiceNotes: number;
  };
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalKsh: number;
    createdAt: string;
  }>;
};

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  fulfillmentMethod: string;
  deliveryAddress?: string | null;
  totalKsh: number;
  createdAt: string;
  customer: {
    id: string;
    email: string;
    displayName?: string | null;
    phone?: string | null;
  };
  payments: Array<{
    status: string;
    amountKsh: number;
    phone: string;
    providerResultDescription?: string | null;
    requestedAt: string;
  }>;
  fulfillment?: {
    status: string;
    exceptionReason?: string | null;
    exceptionNote?: string | null;
  } | null;
  items: Array<{
    snapshot?: {
      title: string;
      barcode?: string | null;
      imageUrl?: string | null;
    } | null;
  }>;
  customerServiceCases: Array<{
    id: string;
    title: string;
    status: string;
    issueType: string;
  }>;
};

type CaseRow = {
  id: string;
  title: string;
  description?: string | null;
  issueType: string;
  status: string;
  tags?: string[] | null;
  createdAt: string;
  updatedAt: string;
  customer?: {
    id: string;
    email: string;
    displayName?: string | null;
    phone?: string | null;
  } | null;
  order?: {
    id: string;
    orderNumber: string;
    status: string;
    totalKsh: number;
  } | null;
  notes: Array<{
    id: string;
    body: string;
    tags?: string[] | null;
    createdAt: string;
    authorAdminUser?: {
      name: string;
    } | null;
  }>;
};

type NoteRow = {
  id: string;
  body: string;
  tags?: string[] | null;
  createdAt: string;
  customer?: {
    displayName?: string | null;
    email: string;
  } | null;
  order?: {
    orderNumber: string;
  } | null;
  case?: {
    title: string;
    status: string;
  } | null;
  authorAdminUser?: {
    name: string;
  } | null;
};

type CaseForm = {
  customerId: string;
  orderId: string;
  issueType: "PAYMENT" | "PICKUP" | "DELIVERY" | "AFTER_SALE" | "ORDER" | "OTHER";
  title: string;
  description: string;
  tags: string;
};

type NoteForm = {
  caseId: string;
  customerId: string;
  orderId: string;
  body: string;
  tags: string;
};

type RequestOptions = RequestInit & {
  query?: Record<string, string | undefined>;
};

const emptyCaseForm: CaseForm = {
  customerId: "",
  orderId: "",
  issueType: "OTHER",
  title: "",
  description: "",
  tags: ""
};

const emptyNoteForm: NoteForm = {
  caseId: "",
  customerId: "",
  orderId: "",
  body: "",
  tags: ""
};

const issueMeta: Record<CustomerServiceView, { title: string; description: string; queue: string; issueType?: CaseForm["issueType"] }> = {
  customers: { title: "顾客搜索", description: "按姓名、邮箱或手机号查找顾客档案和最近订单。", queue: "all" },
  orders: { title: "订单查询", description: "按订单号、手机号、顾客或商品查询订单。客服只能查看，不能改价格或库存。", queue: "all" },
  payment: { title: "支付问题", description: "查看待付款、支付处理中和支付异常订单，并记录客服跟进。", queue: "payment", issueType: "PAYMENT" },
  pickup: { title: "自提问题", description: "查看自提订单与核对问题，并记录处理过程。", queue: "pickup", issueType: "PICKUP" },
  delivery: { title: "配送问题", description: "查看配送订单、异常配送和地址问题。", queue: "delivery", issueType: "DELIVERY" },
  "after-sales": { title: "售后记录", description: "记录签收后问题、退款咨询和异常说明。", queue: "after-sales", issueType: "AFTER_SALE" },
  notes: { title: "备注与标签", description: "查看全部客服备注，按关键词回溯顾客和订单沟通。", queue: "notes" }
};

export function CustomerServiceWorkbenchPage({ view }: { view: CustomerServiceView }) {
  const { session, hasPermission } = useOperationsSession();
  const adminUserId = session?.adminUser?.id ?? "";
  const canCreate = hasPermission("action.customer-service.create");
  const canEdit = hasPermission("action.customer-service.edit");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [search, setSearch] = useState("");
  const [caseForm, setCaseForm] = useState<CaseForm>(() => ({ ...emptyCaseForm, issueType: issueMeta[view].issueType ?? "OTHER" }));
  const [noteForm, setNoteForm] = useState<NoteForm>(emptyNoteForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const meta = issueMeta[view];

  const load = useCallback(async () => {
    if (!adminUserId) return;
    setBusy(true);
    setError("");
    try {
      const [nextSummary] = await Promise.all([
        request<Summary>("/operations/customer-service/summary", { query: { adminUserId } }),
        loadViewData()
      ]);
      setSummary(nextSummary);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取客服工作台。");
    } finally {
      setBusy(false);
    }

    async function loadViewData() {
      if (view === "customers") {
        setCustomers(await request<CustomerRow[]>("/operations/customer-service/customers", { query: { adminUserId, search } }));
        return;
      }
      if (view === "notes") {
        setNotes(await request<NoteRow[]>("/operations/customer-service/notes", { query: { adminUserId, search } }));
        return;
      }
      const queue = meta.queue;
      const [nextOrders, nextCases] = await Promise.all([
        request<OrderRow[]>("/operations/customer-service/orders", { query: { adminUserId, search, queue } }),
        request<CaseRow[]>("/operations/customer-service/cases", { query: { adminUserId, search, queue } })
      ]);
      setOrders(nextOrders);
      setCases(nextCases);
    }
  }, [adminUserId, meta.queue, search, view]);

  useEffect(() => {
    setCaseForm((current) => ({ ...current, issueType: meta.issueType ?? current.issueType }));
  }, [meta.issueType]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCase() {
    if (!adminUserId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request("/operations/customer-service/cases", {
        method: "POST",
        body: JSON.stringify({ adminUserId, ...caseForm })
      });
      setCaseForm({ ...emptyCaseForm, issueType: meta.issueType ?? "OTHER" });
      setMessage("客服记录已创建。");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建客服记录失败。");
    } finally {
      setBusy(false);
    }
  }

  async function createNote() {
    if (!adminUserId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request("/operations/customer-service/notes", {
        method: "POST",
        body: JSON.stringify({ adminUserId, ...noteForm })
      });
      setNoteForm(emptyNoteForm);
      setMessage("备注已保存。");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存备注失败。");
    } finally {
      setBusy(false);
    }
  }

  async function updateCaseStatus(caseId: string, status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED") {
    if (!adminUserId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request(`/operations/customer-service/cases/${caseId}`, {
        method: "PATCH",
        body: JSON.stringify({ adminUserId, status })
      });
      setMessage("客服记录状态已更新。");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "更新客服记录失败。");
    } finally {
      setBusy(false);
    }
  }

  const metrics = [
    { label: "顾客档案", value: summary?.customers ?? 0 },
    { label: "未结案", value: summary?.openCases ?? 0 },
    { label: "支付问题", value: summary?.paymentCases ?? 0 },
    { label: "自提问题", value: summary?.pickupCases ?? 0 },
    { label: "配送问题", value: summary?.deliveryCases ?? 0 },
    { label: "售后记录", value: summary?.afterSaleCases ?? 0 }
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="客户服务"
        title={meta.title}
        description={meta.description}
        action={
          <Button variant="outline" disabled={busy} onClick={() => void load()}>
            <RefreshCwIcon data-icon="inline-start" />
            刷新
          </Button>
        }
      />

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader>
              <CardDescription>{metric.label}</CardDescription>
              <CardTitle>{metric.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </section>

      <Card>
        <CardContent className="pt-6">
          <FieldGroup>
            <Field>
              <FieldLabel>搜索</FieldLabel>
              <div className="flex gap-2">
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="姓名、手机号、邮箱、订单号或商品" />
                <Button type="button" disabled={busy} onClick={() => void load()}>
                  <SearchIcon data-icon="inline-start" />
                  搜索
                </Button>
              </div>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {message ? <StatusMessage>{message}</StatusMessage> : null}
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}

      {view === "customers" ? <CustomersTable rows={customers} /> : null}
      {view === "orders" || view === "payment" || view === "pickup" || view === "delivery" || view === "after-sales" ? <OrdersTable rows={orders} /> : null}
      {view === "payment" || view === "pickup" || view === "delivery" || view === "after-sales" ? (
        <CasesPanel cases={cases} canEdit={canEdit} onStatus={updateCaseStatus} />
      ) : null}
      {view === "notes" ? <NotesTable rows={notes} /> : null}

      {canCreate ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <CreateCaseCard form={caseForm} busy={busy} onChange={setCaseForm} onSubmit={createCase} />
          <CreateNoteCard form={noteForm} busy={busy} onChange={setNoteForm} onSubmit={createNote} />
        </section>
      ) : null}
    </div>
  );
}

function CustomersTable({ rows }: { rows: CustomerRow[] }) {
  return (
    <DataTableCard title="顾客搜索结果" empty="没有找到顾客。" headers={["顾客", "电话", "订单", "客服记录", "最近订单"]}>
      {rows.map((customer) => (
        <TableRow key={customer.id}>
          <TableCell>
            <div className="font-medium">{customer.displayName || customer.email}</div>
            <div className="text-muted-foreground text-xs">{customer.email}</div>
          </TableCell>
          <TableCell>{customer.phone || "未填写"}</TableCell>
          <TableCell>{customer._count.orders}</TableCell>
          <TableCell>{customer._count.customerServiceCases} / 备注 {customer._count.customerServiceNotes}</TableCell>
          <TableCell>
            <div className="flex flex-col gap-1">
              {customer.orders.map((order) => (
                <span key={order.id} className="font-mono text-xs">{order.orderNumber} · {statusLabel(order.status)} · {money(order.totalKsh)}</span>
              ))}
            </div>
          </TableCell>
        </TableRow>
      ))}
    </DataTableCard>
  );
}

function OrdersTable({ rows }: { rows: OrderRow[] }) {
  return (
    <DataTableCard title="订单查询结果" empty="没有找到订单。" headers={["订单", "顾客", "商品", "支付", "履约", "金额", "客服记录"]}>
      {rows.map((order) => (
        <TableRow key={order.id}>
          <TableCell className="font-mono text-xs">{order.orderNumber}</TableCell>
          <TableCell>
            <div>{order.customer.displayName || order.customer.email}</div>
            <div className="text-muted-foreground text-xs">{order.customer.phone || "未填写电话"}</div>
          </TableCell>
          <TableCell>
            <div className="flex min-w-60 flex-col gap-1">
              {order.items.map((item, index) => (
                <span key={`${order.id}-${index}`} className="text-sm">
                  {item.snapshot?.title ?? "未命名商品"}
                  <span className="text-muted-foreground"> · {item.snapshot?.barcode ?? "无Barcode"}</span>
                </span>
              ))}
            </div>
          </TableCell>
          <TableCell>
            <div className="flex flex-col gap-1">
              {order.payments.map((payment, index) => (
                <span key={`${order.id}-payment-${index}`} className="text-xs">
                  {payment.status} · {payment.phone}
                  {payment.providerResultDescription ? <span className="text-muted-foreground"> · {payment.providerResultDescription}</span> : null}
                </span>
              ))}
            </div>
          </TableCell>
          <TableCell>
            <Badge variant="outline">{methodLabel(order.fulfillmentMethod)}</Badge>
            <div className="mt-1 text-muted-foreground text-xs">{order.fulfillment?.status ?? "未进入履约"}</div>
          </TableCell>
          <TableCell>{money(order.totalKsh)}</TableCell>
          <TableCell>{order.customerServiceCases.length}</TableCell>
        </TableRow>
      ))}
    </DataTableCard>
  );
}

function CasesPanel({ cases, canEdit, onStatus }: { cases: CaseRow[]; canEdit: boolean; onStatus: (caseId: string, status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED") => void }) {
  return (
    <DataTableCard title="客服记录" empty="当前没有客服记录。" headers={["标题", "类型", "状态", "顾客/订单", "标签", "备注", "操作"]}>
      {cases.map((serviceCase) => (
        <TableRow key={serviceCase.id}>
          <TableCell>
            <div className="font-medium">{serviceCase.title}</div>
            <div className="text-muted-foreground text-xs">{serviceCase.description || "-"}</div>
          </TableCell>
          <TableCell>{issueLabel(serviceCase.issueType)}</TableCell>
          <TableCell><StatusBadge status={serviceCase.status} /></TableCell>
          <TableCell>
            <div>{serviceCase.customer?.displayName || serviceCase.customer?.email || "-"}</div>
            <div className="font-mono text-muted-foreground text-xs">{serviceCase.order?.orderNumber ?? "-"}</div>
          </TableCell>
          <TableCell><Tags tags={serviceCase.tags} /></TableCell>
          <TableCell className="max-w-72">
            <div className="flex flex-col gap-1">
              {serviceCase.notes.slice(0, 2).map((note) => (
                <span key={note.id} className="truncate text-xs">{note.body}</span>
              ))}
            </div>
          </TableCell>
          <TableCell>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                {serviceCase.status === "OPEN" ? <Button size="sm" variant="outline" onClick={() => onStatus(serviceCase.id, "IN_PROGRESS")}>处理中</Button> : null}
                {serviceCase.status !== "RESOLVED" && serviceCase.status !== "CLOSED" ? <Button size="sm" onClick={() => onStatus(serviceCase.id, "RESOLVED")}>解决</Button> : null}
                {serviceCase.status === "RESOLVED" ? <Button size="sm" variant="outline" onClick={() => onStatus(serviceCase.id, "CLOSED")}>关闭</Button> : null}
              </div>
            ) : "-"}
          </TableCell>
        </TableRow>
      ))}
    </DataTableCard>
  );
}

function NotesTable({ rows }: { rows: NoteRow[] }) {
  return (
    <DataTableCard title="备注与标签" empty="当前没有备注。" headers={["备注", "顾客", "订单", "客服记录", "标签", "作者"]}>
      {rows.map((note) => (
        <TableRow key={note.id}>
          <TableCell className="max-w-lg">{note.body}</TableCell>
          <TableCell>{note.customer?.displayName || note.customer?.email || "-"}</TableCell>
          <TableCell className="font-mono text-xs">{note.order?.orderNumber ?? "-"}</TableCell>
          <TableCell>{note.case?.title ?? "-"}</TableCell>
          <TableCell><Tags tags={note.tags} /></TableCell>
          <TableCell>{note.authorAdminUser?.name ?? "-"}</TableCell>
        </TableRow>
      ))}
    </DataTableCard>
  );
}

function CreateCaseCard({ form, busy, onChange, onSubmit }: { form: CaseForm; busy: boolean; onChange: (form: CaseForm) => void; onSubmit: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>新增客服记录</CardTitle>
        <CardDescription>只记录问题和跟进，不修改价格或库存。</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel>问题类型</FieldLabel>
            <NativeSelect value={form.issueType} onChange={(event) => onChange({ ...form, issueType: event.target.value as CaseForm["issueType"] })}>
              <NativeSelectOption value="PAYMENT">支付问题</NativeSelectOption>
              <NativeSelectOption value="PICKUP">自提问题</NativeSelectOption>
              <NativeSelectOption value="DELIVERY">配送问题</NativeSelectOption>
              <NativeSelectOption value="AFTER_SALE">售后记录</NativeSelectOption>
              <NativeSelectOption value="ORDER">订单问题</NativeSelectOption>
              <NativeSelectOption value="OTHER">其他</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>标题</FieldLabel>
            <Input value={form.title} onChange={(event) => onChange({ ...form, title: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel>顾客 ID</FieldLabel>
            <Input value={form.customerId} onChange={(event) => onChange({ ...form, customerId: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel>订单 ID</FieldLabel>
            <Input value={form.orderId} onChange={(event) => onChange({ ...form, orderId: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel>说明</FieldLabel>
            <Textarea value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel>标签</FieldLabel>
            <div className="flex gap-2">
              <Input value={form.tags} placeholder="urgent, mpesa" onChange={(event) => onChange({ ...form, tags: event.target.value })} />
              <Button type="button" disabled={busy || !form.title.trim()} onClick={() => void onSubmit()}>
                创建
              </Button>
            </div>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function CreateNoteCard({ form, busy, onChange, onSubmit }: { form: NoteForm; busy: boolean; onChange: (form: NoteForm) => void; onSubmit: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>新增备注</CardTitle>
        <CardDescription>备注可以挂到 Case、顾客或订单，便于客服回溯。</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel>Case ID</FieldLabel>
            <Input value={form.caseId} onChange={(event) => onChange({ ...form, caseId: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel>顾客 ID</FieldLabel>
            <Input value={form.customerId} onChange={(event) => onChange({ ...form, customerId: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel>订单 ID</FieldLabel>
            <Input value={form.orderId} onChange={(event) => onChange({ ...form, orderId: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel>备注</FieldLabel>
            <Textarea value={form.body} onChange={(event) => onChange({ ...form, body: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel>标签</FieldLabel>
            <div className="flex gap-2">
              <Input value={form.tags} placeholder="delivery, follow-up" onChange={(event) => onChange({ ...form, tags: event.target.value })} />
              <Button type="button" disabled={busy || !form.body.trim()} onClick={() => void onSubmit()}>
                保存
              </Button>
            </div>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function DataTableCard({ title, empty, headers, children }: { title: string; empty: string; headers: string[]; children: ReactNode }) {
  const rows = Array.isArray(children) ? children : [children];
  const hasRows = rows.some(Boolean);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((header) => <TableHead key={header}>{header}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {hasRows ? children : (
              <TableRow>
                <TableCell colSpan={headers.length} className="h-28 text-center text-muted-foreground">
                  {empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Tags({ tags }: { tags?: string[] | null }) {
  if (!tags?.length) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
    </div>
  );
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">{eyebrow}</p>
        <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
        <p className="max-w-3xl text-muted-foreground text-sm">{description}</p>
      </div>
      {action}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "OPEN" || status === "IN_PROGRESS" ? "secondary" : status === "RESOLVED" || status === "CLOSED" ? "outline" : "default";
  return <Badge variant={variant}>{statusLabel(status)}</Badge>;
}

function StatusMessage({ children, tone }: { children: ReactNode; tone?: "danger" }) {
  return (
    <div className={cn("rounded-lg border p-3 text-sm", tone === "danger" ? "border-destructive/30 bg-destructive/10 text-destructive" : "bg-muted")}>
      {children}
    </div>
  );
}

async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  const url = new URL(`${API_PROXY_URL}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(options?.query ?? {})) {
    if (value) url.searchParams.set(key, value);
  }
  const response = await fetch(url.toString(), {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) }
  });
  const text = await response.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text || `Request failed: ${response.status}` };
  }
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body ? String((body as { message?: unknown }).message) : `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    OPEN: "未处理",
    IN_PROGRESS: "处理中",
    RESOLVED: "已解决",
    CLOSED: "已关闭",
    PENDING_PAYMENT: "待付款",
    PAYMENT_PROCESSING: "支付处理中",
    PAID: "已付款",
    CANCELLED: "已取消",
    EXPIRED: "已过期",
    FULFILLING: "履约中",
    COMPLETED: "已完成",
    REFUNDED: "已退款"
  };
  return labels[status] ?? status;
}

function issueLabel(issueType: string): string {
  const labels: Record<string, string> = {
    PAYMENT: "支付问题",
    PICKUP: "自提问题",
    DELIVERY: "配送问题",
    AFTER_SALE: "售后记录",
    ORDER: "订单问题",
    OTHER: "其他"
  };
  return labels[issueType] ?? issueType;
}

function methodLabel(method: string): string {
  return method === "KIKUYU_LOCAL_DELIVERY" ? "Kikuyu配送" : "仓库自提";
}

function money(value: number): string {
  return `${Math.round(value).toLocaleString("en-KE")} KSh`;
}
