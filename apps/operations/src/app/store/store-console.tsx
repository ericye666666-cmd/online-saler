"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  MessageCircle,
  PackageCheckIcon,
  PackageIcon,
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
import { formatMoment, operationsRequester } from "@/lib/operations-request";
import { t } from "@/i18n/runtime";
import { customerWhatsappUrl } from "../orders/customer-whatsapp";
import { storeConsoleNodes } from "./store-console-nodes";
import { boltRiderReady, storeParcelsByTile } from "./store-console-parcels";

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

type StoreRider = {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  canSignIn: boolean;
  openDeliveries: number;
};

export type StoreOrder = {
  id: string;
  orderNumber: string;
  fulfillmentMethod: "PICKUP" | "KIKUYU_LOCAL_DELIVERY";
  deliveryAddress: string | null;
  deliveryNote: string | null;
  whatsappPhone: string | null;
  customer: { displayName: string | null; phone: string | null };
  items: Array<{
    id: string;
    displayImageUrl?: string | null;
    snapshot?: { title?: string | null; sizeLabel?: string | null; barcode?: string | null; imageUrl?: string | null } | null;
    inventoryItem?: { barcode?: string | null } | null;
  }>;
  fulfillment: {
    status: string;
    packageCode: string | null;
    packageCount?: number | null;
    sentToNodeAt?: string | null;
    sentToNodeBy?: { name: string } | null;
    arrivedAtNodeAt?: string | null;
    deliveryRiderName: string | null;
    fulfillmentNode: { id: string; name: string } | null;
  } | null;
};

type Tile = "receive" | "handover" | "notify";
type Act = (orderId: string, path: string, body: Record<string, unknown>) => Promise<boolean>;

const TILES: Array<{ key: Tile; label: string; hint: string; icon: typeof PackageCheckIcon }> = [
  { key: "receive", label: "收货", hint: "扫包裹码，签收从仓库送来的包裹", icon: PackageCheckIcon },
  { key: "handover", label: "发货", hint: "交给顾客，或交给本店骑手 / Bolt 骑手", icon: TruckIcon },
  { key: "notify", label: "发短信", hint: "把订单页链接发给顾客", icon: MessageCircle }
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
  const [riders, setRiders] = useState<StoreRider[]>([]);
  const [tile, setTile] = useState<Tile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // The parcel just handed to a rider: its customer still has to be sent the
  // order page, because the SMS that would carry the code is not live.
  const [justDispatched, setJustDispatched] = useState<StoreOrder | null>(null);

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
      // scope=node lists only the parcels a store works (on the way, at the
      // store, out with a rider). scope=all ran out at 150 rows of old pickup
      // checkouts before it reached the delivery parcel on its way here.
      setOrders(await request<StoreOrder[]>("/operations/orders", { query: { scope: "node", nodeId } }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("无法读取该履约点的订单。"));
    } finally {
      setBusy(false);
    }
  }, [accessToken, nodeId, request]);

  // This store's own riders, for the hand-over picker. A store with no roster
  // still receives parcels and can still use a Bolt rider.
  const loadRiders = useCallback(async () => {
    if (!accessToken || !nodeId || !hasPermission(session, "riders.view")) return;
    try {
      const list = await request<StoreRider[]>("/operations/riders", { query: { nodeId } });
      setRiders(list.filter((rider) => rider.active));
    } catch {
      setRiders([]);
    }
  }, [accessToken, nodeId, request, session]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadRiders(); }, [loadRiders]);

  const { inTransit, toHandOver, toNotify } = storeParcelsByTile(orders);
  const counts: Record<Tile, number> = {
    receive: inTransit.length,
    handover: toHandOver.length,
    notify: toNotify.length
  };

  /** One call. Returns whether it went through; the caller decides what follows. */
  const act: Act = async (orderId, path, body) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(`/operations/orders/${orderId}/${path}`, { method: "POST", body: JSON.stringify(body) });
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("操作失败。"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Runs steps in order and stops at the first refusal, then reloads. */
  async function run(steps: Array<[string, string, Record<string, unknown>]>, success: string, after?: () => void) {
    for (const [orderId, path, body] of steps) {
      if (!await act(orderId, path, body)) {
        await load();
        return false;
      }
    }
    setNotice(success);
    after?.();
    await load();
    await loadRiders();
    return true;
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
          <Button size="sm" variant="ghost" onClick={() => { setTile(null); setNotice(""); setError(""); setJustDispatched(null); }}>
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
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => { void load(); void loadRiders(); }}>
          <RefreshCwIcon />
        </Button>
      </div>

      {error ? <Alert variant="destructive"><AlertTitle>{t("没通过")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {notice ? <Alert><AlertTitle>{notice}</AlertTitle></Alert> : null}
      {justDispatched ? <DispatchedNotice order={justDispatched} onClose={() => setJustDispatched(null)} /> : null}

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
                onClick={() => { setTile(entry.key); setNotice(""); setError(""); setJustDispatched(null); }}
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
        <ReceivePanel
          orders={inTransit}
          busy={busy}
          onReceive={(order, packageCode) => run([[order.id, "receive-at-node", { packageCode }]],
            order.fulfillmentMethod === "PICKUP"
              ? t("已签收包裹。在「发货」里放到自提区。")
              : t("已签收包裹。在「发货」里交给骑手。"))}
        />
      ) : active.key === "handover" ? (
        <HandoverPanel
          orders={toHandOver}
          riders={riders}
          canSeeRiders={hasPermission(session, "riders.view")}
          busy={busy}
          run={run}
          onDispatched={setJustDispatched}
        />
      ) : (
        <NotifyPanel orders={toNotify} />
      )}
    </div>
  );
}

/** Everything the counter needs to know about one parcel, without opening it. */
function ParcelDetails({ order }: { order: StoreOrder }) {
  const delivery = order.fulfillmentMethod === "KIKUYU_LOCAL_DELIVERY";
  const phone = order.customer.phone ?? order.whatsappPhone;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-semibold">{order.fulfillment?.packageCode ?? t("无包裹号")}</span>
        <Badge variant={delivery ? "default" : "secondary"}>{delivery ? t("送货上门") : t("到店自提")}</Badge>
      </div>
      <p className="text-muted-foreground text-sm">{t("订单")} {order.orderNumber}</p>
      <div className="text-sm">
        <p className="font-medium">{order.customer.displayName ?? t("访客顾客")}</p>
        {phone ? <a className="underline" href={`tel:${phone}`}>{phone}</a> : <span className="text-destructive">{t("没有手机号")}</span>}
      </div>
      {delivery ? (
        <div className="text-sm">
          <span className="text-muted-foreground">{t("配送地址")}：</span>
          <span className="break-words">{order.deliveryAddress ?? "—"}</span>
          {order.deliveryNote ? <p className="text-muted-foreground">{order.deliveryNote}</p> : null}
        </div>
      ) : null}
      <p className="text-muted-foreground text-sm">
        {t("{count} 件", { count: order.items.length })}
        {order.fulfillment?.sentToNodeAt
          ? ` · ${t("{time} 由 {name} 从仓库发出", {
              time: formatMoment(order.fulfillment.sentToNodeAt),
              name: order.fulfillment.sentToNodeBy?.name ?? "—"
            })}`
          : ""}
      </p>
      <ul className="flex flex-col gap-2">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            <ItemThumb src={item.displayImageUrl ?? item.snapshot?.imageUrl} alt={item.snapshot?.title ?? t("商品图片")} />
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">{item.snapshot?.title ?? t("未命名商品")}</p>
              <p className="truncate text-muted-foreground">
                {item.snapshot?.sizeLabel ? `${t("尺码")} ${item.snapshot.sizeLabel} · ` : ""}
                <span className="font-mono">{item.snapshot?.barcode ?? item.inventoryItem?.barcode ?? t("无Barcode")}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemThumb({ src, alt }: { src?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <div className="flex size-14 shrink-0 items-center justify-center rounded-md border text-muted-foreground">
        <PackageIcon className="size-6" />
      </div>
    );
  }
  // Relative product image paths are API routes and go through the proxy, as on the picking screen.
  const url = src.startsWith("/") && !src.startsWith("/api-proxy/") ? `/api-proxy${src}` : src;
  return <img src={url} alt={alt} loading="lazy" decoding="async" className="size-14 shrink-0 rounded-md border object-cover" onError={() => setFailed(true)} />;
}

/** Scan a code, or tap the parcel. Both end in the same confirmation. */
function ReceivePanel({ orders, busy, onReceive }: {
  orders: StoreOrder[];
  busy: boolean;
  onReceive: (order: StoreOrder, packageCode: string) => Promise<boolean>;
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
          if (match) void onReceive(match, scan.trim()).then((ok) => { if (ok) setScan(""); });
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
        <div key={order.id} className="flex flex-col gap-3 rounded-xl border p-4">
          <ParcelDetails order={order} />
          <Button className="h-12" disabled={busy} onClick={() => void onReceive(order, order.fulfillment?.packageCode ?? "")}>
            {t("签收")}
          </Button>
        </div>
      ))}
    </div>
  );
}

const BOLT = "__bolt__";

/** Hand over: to the customer with their code, or to one of this store's riders, or to Bolt. */
function HandoverPanel({ orders, riders, canSeeRiders, busy, run, onDispatched }: {
  orders: StoreOrder[];
  riders: StoreRider[];
  canSeeRiders: boolean;
  busy: boolean;
  run: (steps: Array<[string, string, Record<string, unknown>]>, success: string, after?: () => void) => Promise<boolean>;
  onDispatched: (order: StoreOrder) => void;
}) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const set = (key: string, value: string) => setFields((current) => ({ ...current, [key]: value }));

  if (!orders.length) return <Empty text={t("没有要交付的包裹。")} />;

  return (
    <div className="flex flex-col gap-3">
      {orders.map((order) => {
        const status = order.fulfillment?.status;
        const pickup = order.fulfillmentMethod === "PICKUP";
        const choice = fields[`${order.id}:rider`] ?? "";
        const boltName = fields[`${order.id}:boltName`] ?? "";
        const boltPhone = fields[`${order.id}:boltPhone`] ?? "";
        return (
          <div key={order.id} className="flex flex-col gap-3 rounded-xl border p-4">
            <ParcelDetails order={order} />

            {pickup && status === "ARRIVED_AT_NODE" ? (
              <Button className="h-12" disabled={busy} onClick={() => void run([[order.id, "ready-for-pickup", {}]], t("已放到自提区。顾客凭自提码来取。"))}>
                {t("放到自提区")}
              </Button>
            ) : null}

            {pickup && status === "READY_FOR_PICKUP" ? (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-sm">{t("待顾客自提。请顾客报出自己订单页上的 4 位自提码。")}</p>
                <div className="flex gap-2">
                  <Input
                    className="h-12 text-center font-mono text-lg"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="••••"
                    value={fields[order.id] ?? ""}
                    onChange={(event) => set(order.id, event.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                  <Button className="h-12" disabled={busy || (fields[order.id] ?? "").length !== 4} onClick={() => void run([[order.id, "confirm-pickup", { verificationMethod: "PICKUP_CODE", verificationValue: fields[order.id] ?? "" }]], t("自提完成。"))}>
                    {t("交付")}
                  </Button>
                </div>
                <NotifyButton order={order} />
              </div>
            ) : null}

            {!pickup && (status === "ARRIVED_AT_NODE" || status === "READY_FOR_DISPATCH") ? (
              <div className="flex flex-col gap-2">
                <p className="font-medium text-sm">{t("交给哪位骑手？")}</p>
                {canSeeRiders && riders.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("本店还没有自己的骑手。可以先交给 Bolt 骑手；要加本店骑手，到「门店骑手」里添加。")}</p>
                ) : null}
                {riders.map((rider) => (
                  <label key={rider.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <input type="radio" name={`rider-${order.id}`} checked={choice === rider.id} onChange={() => set(`${order.id}:rider`, rider.id)} />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-medium">{rider.name}</span>
                      <span className="block text-muted-foreground">
                        {rider.phone ?? t("没有手机号")}
                        {rider.openDeliveries ? ` · ${t("手上 {count} 单", { count: rider.openDeliveries })}` : ` · ${t("空闲")}`}
                      </span>
                      {!rider.canSignIn ? <span className="block text-destructive text-xs">{t("没有骑手登录账号，骑手 App 里看不到这单")}</span> : null}
                    </span>
                  </label>
                ))}
                <label className="flex items-center gap-3 rounded-lg border p-3">
                  <input type="radio" name={`rider-${order.id}`} checked={choice === BOLT} onChange={() => set(`${order.id}:rider`, BOLT)} />
                  <span className="font-medium text-sm">{t("外部 Bolt 骑手")}</span>
                </label>
                {choice === BOLT ? (
                  <>
                    <Input className="h-12" placeholder={t("骑手姓名")} value={boltName} onChange={(event) => set(`${order.id}:boltName`, event.target.value)} />
                    <Input className="h-12" inputMode="tel" placeholder={t("骑手电话")} value={boltPhone} onChange={(event) => set(`${order.id}:boltPhone`, event.target.value)} />
                    {!boltRiderReady(boltName, boltPhone) ? (
                      <p className="text-muted-foreground text-xs">{t("姓名和电话都要填，电话至少 9 位数字。")}</p>
                    ) : null}
                  </>
                ) : null}
                <Button
                  className="h-12"
                  disabled={busy || !choice || (choice === BOLT && !boltRiderReady(boltName, boltPhone))}
                  onClick={() => {
                    const done = () => onDispatched(order);
                    if (choice === BOLT) {
                      // assign-rider only accepts a parcel that is ready to go out.
                      const steps: Array<[string, string, Record<string, unknown>]> = [];
                      if (status === "ARRIVED_AT_NODE") steps.push([order.id, "ready-for-dispatch", {}]);
                      steps.push([order.id, "assign-rider", { riderType: "EXTERNAL", name: boltName.trim(), phone: boltPhone.trim(), company: "Bolt" }]);
                      steps.push([order.id, "dispatch", {}]);
                      void run(steps, t("包裹已交给 Bolt 骑手。配送码在顾客自己的订单页上。"), done);
                    } else {
                      // The same one-step hand-off as the desktop desk's 交给骑手并发送配送码:
                      // rider assigned, code minted, parcel out for delivery, all together.
                      void run([[order.id, "dispatch-to-rider", { deliveryRiderId: choice }]], t("已交给骑手，骑手 App 里能看到这单。配送码在顾客自己的订单页上。"), done);
                    }
                  }}
                >
                  {t("交给骑手并发送配送码")}
                </Button>
              </div>
            ) : null}

            {status === "OUT_FOR_DELIVERY" ? (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-sm">
                  {t("配送中")}{order.fulfillment?.deliveryRiderName ? ` · ${order.fulfillment.deliveryRiderName}` : ""}
                </p>
                <NotifyButton order={order} />
                <div className="flex gap-2">
                  <Input
                    className="h-12 text-center font-mono text-lg"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="••••"
                    value={fields[order.id] ?? ""}
                    onChange={(event) => set(order.id, event.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                  <Button className="h-12" disabled={busy || (fields[order.id] ?? "").length !== 4} onClick={() => void run([[order.id, "complete-delivery", { code: fields[order.id] ?? "" }]], t("配送完成。"))}>
                    {t("确认送达")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Right after a hand-off: the one thing still to do is tell the customer. */
function DispatchedNotice({ order, onClose }: { order: StoreOrder; onClose: () => void }) {
  return (
    <Alert>
      <AlertTitle>{t("下一步：把订单页发给顾客")}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <span>{t("短信还没开通。顾客要在自己的订单页上看配送码，骑手到了再报给骑手。")}</span>
        <div className="flex gap-2">
          <NotifyButton order={order} kind="DELIVERY" />
          <Button size="sm" variant="ghost" onClick={onClose}>{t("关闭")}</Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function NotifyButton({ order, kind }: { order: StoreOrder; kind?: "DELIVERY" | "PICKUP" }) {
  const url = customerWhatsappUrl({
    orderNumber: order.orderNumber,
    phone: order.whatsappPhone ?? order.customer.phone,
    kind: kind ?? (order.fulfillmentMethod === "PICKUP" ? "PICKUP" : "DELIVERY"),
    nodeName: order.fulfillment?.fulfillmentNode?.name ?? null
  });
  if (!url) return <span className="text-destructive text-xs">{t("没有手机号")}</span>;
  return (
    <Button size="sm" variant="outline" asChild>
      <a href={url} target="_blank" rel="noreferrer"><MessageCircle data-icon="inline-start" />{t("用 WhatsApp 发给顾客")}</a>
    </Button>
  );
}

/** One tap per customer. The message carries a link, never the code. */
function NotifyPanel({ orders }: { orders: StoreOrder[] }) {
  if (!orders.length) return <Empty text={t("没有需要通知的顾客。")} />;
  return (
    <div className="flex flex-col gap-3">
      {orders.map((order) => (
        <div key={order.id} className="flex items-center justify-between gap-3 rounded-xl border p-4">
          <div className="min-w-0">
            <p className="truncate font-semibold">{order.customer.displayName ?? order.orderNumber}</p>
            <p className="truncate text-muted-foreground text-sm">
              {order.orderNumber} · {order.fulfillmentMethod === "PICKUP" ? t("自提") : t("配送")}
            </p>
          </div>
          <NotifyButton order={order} />
        </div>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border p-6 text-center text-muted-foreground">{text}</p>;
}
