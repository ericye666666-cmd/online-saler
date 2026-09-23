"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BikeIcon, RefreshCwIcon } from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { operationsRequester } from "@/lib/operations-request";
import { t } from "@/i18n/runtime";

/**
 * A store's rider list. These are the two or three people who ride out of this
 * one shop, not a fleet: name, phone, and whether they are on duty today.
 *
 * A rider only appears in the dispatch dropdown when they are active, and a
 * rider can only be stood down once their packages are back.
 */

type Rider = {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  nodeId: string | null;
  nodeName: string | null;
  loginAccount: string | null;
  canSignIn: boolean;
  openDeliveries: number;
};

type NodeOption = { id: string; name: string; type: "WAREHOUSE" | "STORE" };

export function RiderRosterPage() {
  const { session, hasPermission } = useOperationsSession();
  const accessToken = session?.accessToken ?? "";
  const canManage = hasPermission("riders.manage");

  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [nodeId, setNodeId] = useState("");
  const [riders, setRiders] = useState<Rider[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loginAccount, setLoginAccount] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const request = useMemo(() => operationsRequester(accessToken), [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    void (async () => {
      try {
        const list = await request<NodeOption[]>("/operations/orders/nodes");
        setNodes(list.filter((node) => node.type === "STORE"));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : t("无法读取门店列表。"));
      }
    })();
  }, [accessToken, request]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      setRiders(await request<Rider[]>("/operations/riders", { query: { nodeId: nodeId || undefined } }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("无法读取骑手名单。"));
    } finally {
      setLoading(false);
    }
  }, [accessToken, nodeId, request]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addRider() {
    setBusyId("new");
    setError("");
    setMessage("");
    try {
      await request("/operations/riders", {
        method: "POST",
        body: JSON.stringify({ name, phone, nodeId: nodeId || undefined, loginAccount: loginAccount || undefined })
      });
      setMessage(t("骑手已加入名单。"));
      setName("");
      setPhone("");
      setLoginAccount("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("添加失败。"));
    } finally {
      setBusyId("");
    }
  }

  async function setActive(rider: Rider, active: boolean) {
    setBusyId(rider.id);
    setError("");
    setMessage("");
    try {
      await request(`/operations/riders/${rider.id}`, { method: "PATCH", body: JSON.stringify({ active }) });
      setMessage(active ? t("骑手已上班。") : t("骑手已下班，不会再收到派单。"));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("操作失败。"));
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2"><BikeIcon size={18} /> {t("门店骑手")}</CardTitle>
            <CardDescription>
              {t("这些是从本店骑车出去送货的人。派单时只会出现在上班状态的骑手。骑手要自己登录手机端，需要先在「系统 / 账号」里给他建一个登录账号，再填在下面。")}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCwIcon className={loading ? "animate-spin" : ""} /> {t("刷新")}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {nodes.length > 1 ? (
            <label className="flex flex-col gap-1 text-sm max-w-xs">
              <span className="text-muted-foreground">{t("门店")}</span>
              <NativeSelect value={nodeId} onChange={(event) => setNodeId(event.target.value)}>
                <NativeSelectOption value="">{t("全部门店")}</NativeSelectOption>
                {nodes.map((node) => (
                  <NativeSelectOption key={node.id} value={node.id}>{node.name}</NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("添加骑手")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t("姓名")}</span>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Peter" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t("电话")}</span>
              <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0712345678" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t("登录账号（可选）")}</span>
              <Input value={loginAccount} onChange={(event) => setLoginAccount(event.target.value)} placeholder="peter.kinoo" />
            </label>
            <Button disabled={busyId === "new" || !name.trim()} onClick={() => void addRider()}>
              {t("加入名单")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("名单")} ({riders.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {riders.length === 0 ? <p className="text-sm text-muted-foreground">{t("还没有骑手。")}</p> : null}
          {riders.map((rider) => (
            <div key={rider.id} className="rounded-lg border p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{rider.name}</span>
                  <Badge variant={rider.active ? "secondary" : "outline"}>
                    {rider.active ? t("上班") : t("下班")}
                  </Badge>
                  {rider.nodeName ? <Badge variant="outline">{rider.nodeName}</Badge> : null}
                  {rider.openDeliveries > 0 ? (
                    <Badge variant="destructive">{t("手上")} {rider.openDeliveries} {t("单")}</Badge>
                  ) : null}
                </div>
                <span className="text-sm text-muted-foreground">
                  {rider.phone ?? t("没有电话")}
                  {" · "}
                  {rider.canSignIn ? `${t("可登录")}: ${rider.loginAccount}` : t("还不能登录手机端")}
                </span>
              </div>
              {canManage ? (
                <Button
                  variant={rider.active ? "outline" : "default"}
                  size="sm"
                  disabled={busyId === rider.id}
                  onClick={() => void setActive(rider, !rider.active)}
                >
                  {rider.active ? t("设为下班") : t("设为上班")}
                </Button>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
