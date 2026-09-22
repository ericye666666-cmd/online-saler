"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PackageCheckIcon, RefreshCwIcon, TruckIcon } from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatKsh, formatMoment, operationsRequester } from "@/lib/operations-request";
import { t } from "@/i18n/runtime";

/**
 * The store's own screen. A package arrives from the warehouse, the store scans
 * it in, hands it to the customer or to a Bolt rider, and records what the ride
 * actually cost. Before this existed none of those steps had anywhere to go.
 */

type NodeOption = {
  id: string;
  code: string;
  name: string;
  type: "WAREHOUSE" | "STORE";
  supportsPickup: boolean;
  supportsDelivery: boolean;
};

type NodeOrder = {
  id: string;
  orderNumber: string;
  status: string;
  fulfillmentMethod: "PICKUP" | "KIKUYU_LOCAL_DELIVERY";
  totalKsh: number;
  deliveryFeeKsh: number;
  deliveryAddress: string | null;
  deliveryNote: string | null;
  whatsappPhone: string | null;
  createdAt: string;
  customer: { displayName: string | null; phone: string | null };
  items: Array<{ id: string; snapshot?: { title?: string | null; barcode?: string | null } | null }>;
  fulfillment: {
    id: string;
    status: string;
    packageCode: string | null;
    sentToNodeAt: string | null;
    arrivedAtNodeAt: string | null;
    actualDeliveryCostKsh: number | null;
    deliveryRiderName: string | null;
    exceptionReason: string | null;
    exceptionNote: string | null;
    fulfillmentNode: { id: string; name: string } | null;
  } | null;
};

const NODE_STAGES = [
  { key: "in-transit-to-node", label: "在途" },
  { key: "at-node", label: "已到店" },
  { key: "ready-for-pickup", label: "待自提" },
  { key: "ready-for-dispatch", label: "待发车" },
  { key: "out-for-delivery", label: "配送中" }
] as const;

export function NodeWorkbenchPage() {
  const { session, hasPermission } = useOperationsSession();
  const accessToken = session?.accessToken ?? "";
  const canReceive = hasPermission("orders.node-receive");
  const canDispatch = hasPermission("orders.dispatch");
  const canComplete = hasPermission("orders.complete");
  const canRecordCost = hasPermission("orders.delivery-cost");

  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [nodeId, setNodeId] = useState("");
  const [orders, setOrders] = useState<NodeOrder[]>([]);
  const [scan, setScan] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const request = useMemo(() => operationsRequester(accessToken), [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    void (async () => {
      try {
        const list = await request<NodeOption[]>("/operations/orders/nodes");
        setNodes(list);
        setNodeId((current) => current || list.find((node) => node.type === "STORE")?.id || list[0]?.id || "");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : t("无法读取履约点。"));
      }
    })();
  }, [accessToken, request]);

  const load = useCallback(async () => {
    if (!accessToken || !nodeId) return;
    setLoading(true);
    setError("");
    try {
      setOrders(await request<NodeOrder[]>("/operations/orders", { query: { scope: "all", nodeId } }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("无法读取该履约点的订单。"));
    } finally {
      setLoading(false);
    }
  }, [accessToken, nodeId, request]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(orderId: string, path: string, body: Record<string, unknown>, success: string) {
    setBusyId(orderId);
    setError("");
    setMessage("");
    try {
      await request(`/operations/orders/${orderId}/${path}`, { method: "POST", body: JSON.stringify(body) });
      setMessage(success);
      setFields((current) => ({ ...current, [`${orderId}:note`]: "", [`${orderId}:cost`]: "" }));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("操作失败。"));
    } finally {
      setBusyId("");
    }
  }

  const byStage = useMemo(() => {
    const map = new Map<string, NodeOrder[]>();
    for (const stage of NODE_STAGES) map.set(stage.key, []);
    for (const order of orders) {
      const status = order.fulfillment?.status;
      const key = status === "IN_TRANSIT_TO_NODE" ? "in-transit-to-node"
        : status === "ARRIVED_AT_NODE" ? "at-node"
          : status === "READY_FOR_PICKUP" ? "ready-for-pickup"
            : status === "READY_FOR_DISPATCH" ? "ready-for-dispatch"
              : status === "OUT_FOR_DELIVERY" ? "out-for-delivery" : null;
      if (key) map.get(key)!.push(order);
    }
    return map;
  }, [orders]);

  const scanned = scan.trim()
    ? orders.find((order) => order.fulfillment?.packageCode?.toUpperCase() === scan.trim().toUpperCase())
    : null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t("门店履约台")}</CardTitle>
            <CardDescription>
              {t("中央仓发出的包裹到店后，先扫码签收，再交给顾客或 Bolt 骑手，最后记录真实车费。线上订单不进门店普通库存。")}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCwIcon className={loading ? "animate-spin" : ""} /> {t("刷新")}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t("履约点")}</span>
              <NativeSelect value={nodeId} onChange={(event) => setNodeId(event.target.value)}>
                {nodes.map((node) => (
                  <NativeSelectOption key={node.id} value={node.id}>
                    {node.name}{node.type === "WAREHOUSE" ? t("（中央仓）") : ""}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t("扫描包裹号")}</span>
              <Input
                placeholder="PKG-KINOO-1A2B3C4D"
                value={scan}
                onChange={(event) => setScan(event.target.value)}
              />
            </label>
          </div>
          {scan.trim() && !scanned ? (
            <p className="text-sm text-destructive">{t("这个包裹号不在当前履约点的待处理列表里，请核对标签。")}</p>
          ) : null}
          {scanned ? (
            <p className="text-sm">
              {t("包裹属于订单")} <Link className="underline" href={`/orders/${scanned.id}`}>{scanned.orderNumber}</Link>
              {" · "}{scanned.fulfillment?.status}
            </p>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
        </CardContent>
      </Card>

      {NODE_STAGES.map((stage) => {
        const rows = byStage.get(stage.key) ?? [];
        return (
          <Card key={stage.key}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {stage.key === "out-for-delivery" ? <TruckIcon size={18} /> : <PackageCheckIcon size={18} />}
                {t(stage.label)} ({rows.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("暂无订单。")}</p> : null}
              {rows.map((order) => (
                <div key={order.id} className="rounded-lg border p-4 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link className="font-semibold underline" href={`/orders/${order.id}`}>{order.orderNumber}</Link>
                      <Badge variant="outline">{order.fulfillmentMethod === "PICKUP" ? t("自提") : t("配送")}</Badge>
                      {order.fulfillment?.packageCode ? (
                        <Badge variant="secondary" className="font-mono">{order.fulfillment.packageCode}</Badge>
                      ) : null}
                    </div>
                    <span className="text-sm text-muted-foreground">{formatKsh(order.totalKsh)}</span>
                  </div>

                  <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <Fact label={t("顾客")} value={`${order.customer.displayName ?? t("访客")} · ${order.customer.phone ?? "—"}`} />
                    <Fact label={t("WhatsApp")} value={order.whatsappPhone ?? "—"} />
                    <Fact label={t("商品")} value={order.items.map((item) => item.snapshot?.title ?? "—").join("、")} />
                    {order.fulfillmentMethod === "KIKUYU_LOCAL_DELIVERY" ? (
                      <Fact label={t("配送地址")} value={order.deliveryAddress ?? "—"} />
                    ) : null}
                    <Fact label={t("发出时间")} value={formatMoment(order.fulfillment?.sentToNodeAt)} />
                    <Fact label={t("到店时间")} value={formatMoment(order.fulfillment?.arrivedAtNodeAt)} />
                    {order.fulfillment?.deliveryRiderName ? (
                      <Fact label={t("骑手")} value={order.fulfillment.deliveryRiderName} />
                    ) : null}
                    {order.fulfillmentMethod === "KIKUYU_LOCAL_DELIVERY" ? (
                      <Fact
                        label={t("顾客付 / 实际车费")}
                        value={`${formatKsh(order.deliveryFeeKsh)} / ${formatKsh(order.fulfillment?.actualDeliveryCostKsh)}`}
                      />
                    ) : null}
                  </div>

                  {order.deliveryNote ? <p className="text-sm text-muted-foreground">{order.deliveryNote}</p> : null}

                  <Textarea
                    className="min-h-16"
                    placeholder={t("备注（可选）")}
                    value={fields[`${order.id}:note`] ?? ""}
                    onChange={(event) => setFields((current) => ({ ...current, [`${order.id}:note`]: event.target.value }))}
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    {stage.key === "in-transit-to-node" && canReceive ? (
                      <Button
                        size="sm"
                        disabled={busyId === order.id}
                        onClick={() => void act(order.id, "receive-at-node", {
                          note: fields[`${order.id}:note`] ?? "",
                          packageCode: order.fulfillment?.packageCode ?? ""
                        }, t("已签收包裹。"))}
                      >
                        {t("确认收到包裹")}
                      </Button>
                    ) : null}

                    {stage.key === "at-node" && order.fulfillmentMethod === "PICKUP" ? (
                      <Button
                        size="sm"
                        disabled={busyId === order.id || !canComplete}
                        onClick={() => void act(order.id, "ready-for-pickup", { note: fields[`${order.id}:note`] ?? "" }, t("已通知顾客可以来取。"))}
                      >
                        {t("放到自提区并通知顾客")}
                      </Button>
                    ) : null}

                    {stage.key === "at-node" && order.fulfillmentMethod === "KIKUYU_LOCAL_DELIVERY" ? (
                      <Button
                        size="sm"
                        disabled={busyId === order.id || !canDispatch}
                        onClick={() => void act(order.id, "ready-for-dispatch", { note: fields[`${order.id}:note`] ?? "" }, t("已进入待发车队列。"))}
                      >
                        {t("准备叫 Bolt")}
                      </Button>
                    ) : null}

                    {stage.key === "ready-for-pickup" && canComplete ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          className="w-56"
                          placeholder={t("顾客报的订单号或手机号")}
                          value={fields[`${order.id}:verify`] ?? ""}
                          onChange={(event) => setFields((current) => ({ ...current, [`${order.id}:verify`]: event.target.value }))}
                        />
                        <Button
                          size="sm"
                          disabled={busyId === order.id || !(fields[`${order.id}:verify`] ?? "").trim()}
                          onClick={() => {
                            const value = (fields[`${order.id}:verify`] ?? "").trim();
                            const method = /^\d{7,}$/.test(value.replace(/\D/g, "")) && !value.toUpperCase().startsWith("DL-")
                              ? "PHONE"
                              : "ORDER_NUMBER";
                            void act(order.id, "confirm-pickup", {
                              verificationMethod: method,
                              verificationValue: value,
                              note: fields[`${order.id}:note`] ?? ""
                            }, t("自提完成。"));
                          }}
                        >
                          {t("核对并交付")}
                        </Button>
                      </div>
                    ) : null}

                    {stage.key === "ready-for-dispatch" && canDispatch ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          className="w-40"
                          placeholder={t("骑手姓名")}
                          value={fields[`${order.id}:rider`] ?? ""}
                          onChange={(event) => setFields((current) => ({ ...current, [`${order.id}:rider`]: event.target.value }))}
                        />
                        <Input
                          className="w-40"
                          placeholder={t("骑手电话")}
                          value={fields[`${order.id}:riderPhone`] ?? ""}
                          onChange={(event) => setFields((current) => ({ ...current, [`${order.id}:riderPhone`]: event.target.value }))}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === order.id || !(fields[`${order.id}:rider`] ?? "").trim()}
                          onClick={() => void act(order.id, "assign-rider", {
                            riderType: "EXTERNAL",
                            name: fields[`${order.id}:rider`] ?? "",
                            phone: fields[`${order.id}:riderPhone`] ?? "",
                            company: "Bolt",
                            note: fields[`${order.id}:note`] ?? ""
                          }, t("已记录骑手。"))}
                        >
                          {t("登记 Bolt 骑手")}
                        </Button>
                        <Button
                          size="sm"
                          disabled={busyId === order.id}
                          onClick={() => void act(order.id, "dispatch", { note: fields[`${order.id}:note`] ?? "" }, t("包裹已交给骑手。"))}
                        >
                          {t("交给骑手")}
                        </Button>
                      </div>
                    ) : null}

                    {stage.key === "out-for-delivery" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {canRecordCost ? (
                          <>
                            <Input
                              className="w-40"
                              inputMode="numeric"
                              placeholder={t("实际 Bolt 车费 KSh")}
                              value={fields[`${order.id}:cost`] ?? ""}
                              onChange={(event) => setFields((current) => ({ ...current, [`${order.id}:cost`]: event.target.value }))}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === order.id || !(fields[`${order.id}:cost`] ?? "").trim()}
                              onClick={() => void act(order.id, "delivery-cost", {
                                actualDeliveryCostKsh: Number(fields[`${order.id}:cost`]),
                                note: fields[`${order.id}:note`] ?? ""
                              }, t("车费已记录。"))}
                            >
                              {t("记录车费")}
                            </Button>
                          </>
                        ) : null}
                        {canComplete ? (
                          <Button
                            size="sm"
                            disabled={busyId === order.id}
                            onClick={() => void act(order.id, "complete-delivery", { note: fields[`${order.id}:note`] ?? "" }, t("配送完成。"))}
                          >
                            {t("确认已送达")}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground text-xs block">{label}</span>
      <span className="font-medium break-words">{value}</span>
    </div>
  );
}
