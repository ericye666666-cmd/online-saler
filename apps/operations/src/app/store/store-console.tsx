"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  MessageCircle,
  PackageCheckIcon,
  RefreshCwIcon,
  TruckIcon
} from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { hasPermission } from "@/components/admin/operations-access";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { operationsRequester } from "@/lib/operations-request";
import { t } from "@/i18n/runtime";
import { customerWhatsappUrl } from "../orders/customer-whatsapp";
import { storeConsoleNodes } from "./store-console-nodes";

/**
 * The store's phone screen, as one icon with three icons inside it.
 *
 * Store staff live in the shop's own ERP all day; this system is one tile in it.
 * So it opens on three things and nothing else — receive, hand over, tell the
 * customer — because a screen a clerk visits between serving people has to be
 * readable in the two seconds before the next person reaches the counter.
 *
 * Everything else a store can do lives on the full desk at /orders/node. This is
 * not a cut-down copy of it; it is the same endpoints, arranged around the three
 * things that actually happen at a counter.
 */

type StoreNode = { id: string; code: string; name: string; type: "WAREHOUSE" | "STORE" };

type StoreOrder = {
  id: string;
  orderNumber: string;
  fulfillmentMethod: "PICKUP" | "KIKUYU_LOCAL_DELIVERY";
  whatsappPhone: string | null;
  customer: { displayName: string | null; phone: string | null };
  items: Array<{ id: string; snapshot?: { title?: string | null } | null }>;
  fulfillment: {
    status: string;
    packageCode: string | null;
    deliveryRiderName: string | null;
    fulfillmentNode: { id: string; name: string } | null;
  } | null;
};

type Tile = "receive" | "handover" | "notify";

const TILES: Array<{ key: Tile; label: string; hint: string; icon: typeof PackageCheckIcon }> = [
  { key: "receive", label: "收货", hint: "扫包裹码，签收从仓库送来的包裹", icon: PackageCheckIcon },
  { key: "handover", label: "发货", hint: "交给顾客，或交给 Bolt 骑手", icon: TruckIcon },
  { key: "notify", label: "发短信", hint: "把取件链接发给顾客", icon: MessageCircle }
];

export function StoreConsole() {
  const { session } = useOperationsSession();
  const accessToken = session?.accessToken ?? "";
  const request = useMemo(() => operationsRequester(accessToken), [accessToken]);

  const [nodes, setNodes] = useState<StoreNode[]>([]);
  const [lockedNode, setLockedNode] = useState<StoreNode | null>(null);
  const [nodeId, setNodeId] = useState("");
  const homeNodeId = session?.adminUser?.linkedEmployee?.homeNodeId ?? null;
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [tile, setTile] = useState<Tile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    void (async () => {
      try {
        // The server already sends a store account its own store and nothing
        // else; this decides whether to show a picker at all.
        const { options, locked } = storeConsoleNodes(await request<StoreNode[]>("/operations/orders/nodes"), homeNodeId);
        setNodes(options);
        setLockedNode(locked);
        setNodeId((current) => locked?.id || current || options[0]?.id || "");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : t("无法读取履约点。"));
      }
    })();
  }, [accessToken, homeNodeId, request]);

  const load = useCallback(async () => {
    if (!accessToken || !nodeId) return;
    setBusy(true);
    setError("");
    try {
      setOrders(await request<StoreOrder[]>("/operations/orders", { query: { scope: "all", nodeId } }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("无法读取该履约点的订单。"));
    } finally {
      setBusy(false);
    }
  }, [accessToken, nodeId, request]);

  useEffect(() => { void load(); }, [load]);

  const inTransit = orders.filter((order) => order.fulfillment?.status === "IN_TRANSIT_TO_NODE");
  const toHandOver = orders.filter((order) =>
    ["ARRIVED_AT_NODE", "READY_FOR_PICKUP", "READY_FOR_DISPATCH", "OUT_FOR_DELIVERY"].includes(order.fulfillment?.status ?? ""));
  const toNotify = orders.filter((order) =>
    ["READY_FOR_PICKUP", "OUT_FOR_DELIVERY"].includes(order.fulfillment?.status ?? ""));
  const counts: Record<Tile, number> = {
    receive: inTransit.length,
    handover: toHandOver.length,
    notify: toNotify.length
  };

  async function act(orderId: string, path: string, body: Record<string, unknown>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(`/operations/orders/${orderId}/${path}`, { method: "POST", body: JSON.stringify(body) });
      setNotice(success);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("操作失败。"));
    } finally {
      setBusy(false);
    }
  }

  if (!hasPermission(session, "page.orders.node")) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("这个账号不能操作门店包裹")}</AlertTitle>
        <AlertDescription>{t("要门店履约权限。找管理员在角色里加上，并把你的归属门店设好。")}</AlertDescription>
      </Alert>
    );
  }

  const active = TILES.find((entry) => entry.key === tile) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div className="flex items-center gap-2">
        {active ? (
          <Button size="sm" variant="ghost" onClick={() => { setTile(null); setNotice(""); setError(""); }}>
            <ArrowLeftIcon data-icon="inline-start" />{t("返回")}
          </Button>
        ) : null}
        {lockedNode ? (
          // A store account works its own store. There is nothing to choose.
          <p className="flex h-10 flex-1 items-center font-semibold text-lg">{lockedNode.name}</p>
        ) : (
          <NativeSelect className="h-10 flex-1" value={nodeId} onChange={(event) => setNodeId(event.target.value)}>
            {nodes.map((node) => <NativeSelectOption key={node.id} value={node.id}>{node.name}</NativeSelectOption>)}
          </NativeSelect>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void load()}>
          <RefreshCwIcon />
        </Button>
      </div>

      {error ? <Alert variant="destructive"><AlertTitle>{t("没通过")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {notice ? <Alert><AlertTitle>{notice}</AlertTitle></Alert> : null}

      {!active ? (
        // The whole screen when nothing is open: three things, nothing else.
        <div className="grid grid-cols-1 gap-3">
          {TILES.map((entry) => {
            const Icon = entry.icon;
            return (
              <button
                key={entry.key}
                type="button"
                className="flex items-center gap-4 rounded-2xl border p-5 text-left active:scale-[0.99]"
                onClick={() => { setTile(entry.key); setNotice(""); setError(""); }}
              >
                <Icon className="size-10 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-lg">{t(entry.label)}</span>
                  <span className="block text-muted-foreground text-sm">{t(entry.hint)}</span>
                </span>
                <Badge variant={counts[entry.key] ? "default" : "secondary"} className="shrink-0 text-base">
                  {counts[entry.key]}
                </Badge>
              </button>
            );
          })}
        </div>
      ) : active.key === "receive" ? (
        <ReceivePanel orders={inTransit} busy={busy} onAct={act} />
      ) : active.key === "handover" ? (
        <HandoverPanel orders={toHandOver} busy={busy} onAct={act} />
      ) : (
        <NotifyPanel orders={toNotify} />
      )}
    </div>
  );
}

/** Scan a code, or tap the parcel. Both end in the same confirmation. */
function ReceivePanel({ orders, busy, onAct }: {
  orders: StoreOrder[];
  busy: boolean;
  onAct: (orderId: string, path: string, body: Record<string, unknown>, success: string) => Promise<void>;
}) {
  const [scan, setScan] = useState("");
  const match = orders.find((order) =>
    (order.fulfillment?.packageCode ?? "").toUpperCase() === scan.trim().toUpperCase());

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (match) void onAct(match.id, "receive-at-node", { packageCode: scan.trim() }, t("已签收包裹。")).then(() => setScan(""));
        }}
      >
        <Input
          className="h-14 font-mono"
          autoComplete="off"
          placeholder={t("扫描包裹号")}
          value={scan}
          onChange={(event) => setScan(event.target.value)}
        />
        <Button type="submit" className="h-14 px-5" disabled={busy || !match}>{t("签收")}</Button>
      </form>
      {scan.trim() && !match ? (
        <p className="text-destructive text-sm">{t("这个包裹号不在当前履约点的待处理列表里，请核对标签。")}</p>
      ) : null}

      {orders.length === 0 ? (
        <Empty text={t("没有在途的包裹。")} />
      ) : orders.map((order) => (
        <div key={order.id} className="flex items-center justify-between gap-3 rounded-xl border p-4">
          <div className="min-w-0">
            <p className="font-mono font-semibold">{order.fulfillment?.packageCode ?? order.orderNumber}</p>
            <p className="truncate text-muted-foreground text-sm">
              {order.orderNumber} · {t("{count} 件", { count: order.items.length })}
            </p>
          </div>
          <Button size="sm" disabled={busy} onClick={() => void onAct(order.id, "receive-at-node", { packageCode: order.fulfillment?.packageCode ?? "" }, t("已签收包裹。"))}>
            {t("签收")}
          </Button>
        </div>
      ))}
    </div>
  );
}

/** Hand over: to the customer with their code, or to a Bolt rider. */
function HandoverPanel({ orders, busy, onAct }: {
  orders: StoreOrder[];
  busy: boolean;
  onAct: (orderId: string, path: string, body: Record<string, unknown>, success: string) => Promise<void>;
}) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const set = (key: string, value: string) => setFields((current) => ({ ...current, [key]: value }));

  if (!orders.length) return <Empty text={t("没有要交付的包裹。")} />;

  return (
    <div className="flex flex-col gap-3">
      {orders.map((order) => {
        const status = order.fulfillment?.status;
        const pickup = order.fulfillmentMethod === "PICKUP";
        return (
          <div key={order.id} className="flex flex-col gap-3 rounded-xl border p-4">
            <div>
              <p className="font-semibold">{order.customer.displayName ?? order.orderNumber}</p>
              <p className="font-mono text-muted-foreground text-sm">{order.fulfillment?.packageCode ?? order.orderNumber}</p>
            </div>

            {status === "ARRIVED_AT_NODE" ? (
              <Button className="h-12" disabled={busy} onClick={() => void onAct(order.id, pickup ? "ready-for-pickup" : "ready-for-dispatch", {}, pickup ? t("已通知顾客可以来取。") : t("已标记为待发车。"))}>
                {pickup ? t("放到自提区") : t("准备发车")}
              </Button>
            ) : null}

            {status === "READY_FOR_PICKUP" ? (
              <div className="flex gap-2">
                <Input
                  className="h-12 text-center font-mono text-lg"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  value={fields[order.id] ?? ""}
                  onChange={(event) => set(order.id, event.target.value.replace(/\D/g, "").slice(0, 4))}
                />
                <Button className="h-12" disabled={busy || (fields[order.id] ?? "").length !== 4} onClick={() => void onAct(order.id, "confirm-pickup", { verificationMethod: "PICKUP_CODE", verificationValue: fields[order.id] ?? "" }, t("自提完成。"))}>
                  {t("交付")}
                </Button>
              </div>
            ) : null}

            {status === "READY_FOR_DISPATCH" ? (
              <div className="flex flex-col gap-2">
                <Input className="h-12" placeholder={t("骑手姓名")} value={fields[`${order.id}:rider`] ?? ""} onChange={(event) => set(`${order.id}:rider`, event.target.value)} />
                <Input className="h-12" placeholder={t("骑手电话")} value={fields[`${order.id}:phone`] ?? ""} onChange={(event) => set(`${order.id}:phone`, event.target.value)} />
                <Button
                  className="h-12"
                  disabled={busy || !(fields[`${order.id}:rider`] ?? "").trim()}
                  onClick={async () => {
                    await onAct(order.id, "assign-rider", {
                      riderType: "EXTERNAL",
                      name: fields[`${order.id}:rider`] ?? "",
                      phone: fields[`${order.id}:phone`] ?? "",
                      company: "Bolt"
                    }, t("已记录骑手。"));
                    await onAct(order.id, "dispatch", {}, t("包裹已交给 Bolt 骑手。配送码在顾客自己的订单页上。"));
                  }}
                >
                  {t("交给 Bolt 骑手")}
                </Button>
              </div>
            ) : null}

            {status === "OUT_FOR_DELIVERY" ? (
              <div className="flex gap-2">
                <Input
                  className="h-12 text-center font-mono text-lg"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  value={fields[order.id] ?? ""}
                  onChange={(event) => set(order.id, event.target.value.replace(/\D/g, "").slice(0, 4))}
                />
                <Button className="h-12" disabled={busy || (fields[order.id] ?? "").length !== 4} onClick={() => void onAct(order.id, "complete-delivery", { code: fields[order.id] ?? "" }, t("配送完成。"))}>
                  {t("确认送达")}
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** One tap per customer. The message carries a link, never the code. */
function NotifyPanel({ orders }: { orders: StoreOrder[] }) {
  if (!orders.length) return <Empty text={t("没有需要通知的顾客。")} />;
  return (
    <div className="flex flex-col gap-3">
      {orders.map((order) => {
        const url = customerWhatsappUrl({
          orderNumber: order.orderNumber,
          phone: order.whatsappPhone ?? order.customer.phone,
          kind: order.fulfillmentMethod === "PICKUP" ? "PICKUP" : "DELIVERY",
          nodeName: order.fulfillment?.fulfillmentNode?.name ?? null
        });
        return (
          <div key={order.id} className="flex items-center justify-between gap-3 rounded-xl border p-4">
            <div className="min-w-0">
              <p className="truncate font-semibold">{order.customer.displayName ?? order.orderNumber}</p>
              <p className="truncate text-muted-foreground text-sm">
                {order.orderNumber} · {order.fulfillmentMethod === "PICKUP" ? t("自提") : t("配送")}
              </p>
            </div>
            {url ? (
              <Button size="sm" variant="outline" asChild>
                <a href={url} target="_blank" rel="noreferrer"><MessageCircle data-icon="inline-start" />{t("发送")}</a>
              </Button>
            ) : (
              <span className="shrink-0 text-destructive text-xs">{t("没有手机号")}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border p-6 text-center text-muted-foreground">{text}</p>;
}
