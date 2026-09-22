"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlusIcon, RefreshCwIcon } from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { operationsRequester } from "@/lib/operations-request";
import { t } from "@/i18n/runtime";

/**
 * Fulfillment node configuration. Opening a sixth store, correcting a store's
 * phone number or moving a staff member between stores used to need a deploy.
 */

type NodeRow = {
  id: string;
  code: string;
  name: string;
  type: "WAREHOUSE" | "STORE";
  status: "ACTIVE" | "INACTIVE";
  supportsPickup: boolean;
  supportsDelivery: boolean;
  mapsUrl: string | null;
  address: string | null;
  phone: string | null;
  sortOrder: number;
  openPackages: number;
  reachable: boolean;
  staff: Array<{ id: string; name: string; employeeCode: string }>;
};

type StaffRow = {
  id: string;
  name: string;
  employeeCode: string;
  homeNodeId: string | null;
  homeNode: { name: string } | null;
};

export function NodesPage() {
  const { session, hasPermission } = useOperationsSession();
  const accessToken = session?.accessToken ?? "";
  const canManage = hasPermission("nodes.manage");
  const request = useMemo(() => operationsRequester(accessToken), [accessToken]);

  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Partial<NodeRow>>>({});
  const [newNode, setNewNode] = useState({ code: "", name: "", phone: "", address: "", mapsUrl: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setBusy(true);
    setError("");
    try {
      const [nextNodes, nextStaff] = await Promise.all([
        request<NodeRow[]>("/operations/nodes"),
        request<StaffRow[]>("/operations/nodes/staff")
      ]);
      setNodes(nextNodes);
      setStaff(nextStaff);
      setDrafts({});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("无法读取履约点。"));
    } finally {
      setBusy(false);
    }
  }, [accessToken, request]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(path: string, body: unknown, success: string, method: "POST" | "PATCH" = "POST") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request(path, { method, body: JSON.stringify(body) });
      setMessage(success);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("保存失败。"));
    } finally {
      setBusy(false);
    }
  }

  function draft(node: NodeRow): NodeRow {
    return { ...node, ...drafts[node.id] };
  }

  function edit(nodeId: string, patch: Partial<NodeRow>) {
    setDrafts((current) => ({ ...current, [nodeId]: { ...current[nodeId], ...patch } }));
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t("履约点配置")}</CardTitle>
            <CardDescription>
              {t("中央仓 + 各门店。门店没有填手机号就收不到「有包裹发来了」的短信。关闭一个履约点前必须先清空它手上的包裹。")}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
            <RefreshCwIcon className={busy ? "animate-spin" : ""} /> {t("刷新")}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
        </CardContent>
      </Card>

      {nodes.map((node) => {
        const row = draft(node);
        return (
          <Card key={node.id}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                {node.name}
                <Badge variant="outline" className="font-mono">{node.code}</Badge>
                <Badge variant={node.type === "WAREHOUSE" ? "secondary" : "outline"}>
                  {node.type === "WAREHOUSE" ? t("中央仓") : t("门店")}
                </Badge>
                {node.status === "INACTIVE" ? <Badge variant="destructive">{t("已关闭")}</Badge> : null}
                {!node.reachable ? <Badge variant="destructive">{t("缺手机号")}</Badge> : null}
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                {t("在手包裹")} {node.openPackages} · {t("门店员工")} {node.staff.length}
              </span>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Labelled label={t("名称")}>
                  <Input value={row.name} disabled={!canManage} onChange={(event) => edit(node.id, { name: event.target.value })} />
                </Labelled>
                <Labelled label={t("门店手机号（接收包裹通知）")}>
                  <Input
                    value={row.phone ?? ""}
                    placeholder="0712345678"
                    disabled={!canManage}
                    onChange={(event) => edit(node.id, { phone: event.target.value })}
                  />
                </Labelled>
                <Labelled label={t("地址")}>
                  <Input value={row.address ?? ""} disabled={!canManage} onChange={(event) => edit(node.id, { address: event.target.value })} />
                </Labelled>
                <Labelled label={t("Google Maps 链接")}>
                  <Input value={row.mapsUrl ?? ""} disabled={!canManage} onChange={(event) => edit(node.id, { mapsUrl: event.target.value })} />
                </Labelled>
                <Labelled label={t("接受自提")}>
                  <NativeSelect
                    value={String(row.supportsPickup)}
                    disabled={!canManage}
                    onChange={(event) => edit(node.id, { supportsPickup: event.target.value === "true" })}
                  >
                    <NativeSelectOption value="true">{t("是")}</NativeSelectOption>
                    <NativeSelectOption value="false">{t("否")}</NativeSelectOption>
                  </NativeSelect>
                </Labelled>
                <Labelled label={t("发出配送")}>
                  <NativeSelect
                    value={String(row.supportsDelivery)}
                    disabled={!canManage}
                    onChange={(event) => edit(node.id, { supportsDelivery: event.target.value === "true" })}
                  >
                    <NativeSelectOption value="true">{t("是")}</NativeSelectOption>
                    <NativeSelectOption value="false">{t("否")}</NativeSelectOption>
                  </NativeSelect>
                </Labelled>
                <Labelled label={t("状态")}>
                  <NativeSelect
                    value={row.status}
                    disabled={!canManage}
                    onChange={(event) => edit(node.id, { status: event.target.value as NodeRow["status"] })}
                  >
                    <NativeSelectOption value="ACTIVE">{t("启用")}</NativeSelectOption>
                    <NativeSelectOption value="INACTIVE">{t("关闭")}</NativeSelectOption>
                  </NativeSelect>
                </Labelled>
                <Labelled label={t("排序")}>
                  <Input
                    type="number"
                    value={String(row.sortOrder)}
                    disabled={!canManage}
                    onChange={(event) => edit(node.id, { sortOrder: Number(event.target.value) })}
                  />
                </Labelled>
              </div>
              {canManage ? (
                <div>
                  <Button
                    size="sm"
                    disabled={busy || !drafts[node.id]}
                    onClick={() => void save(`/operations/nodes/${node.id}`, {
                      name: row.name,
                      phone: row.phone ?? "",
                      address: row.address ?? "",
                      mapsUrl: row.mapsUrl ?? "",
                      supportsPickup: row.supportsPickup,
                      supportsDelivery: row.supportsDelivery,
                      status: row.status,
                      sortOrder: row.sortOrder
                    }, t("履约点已更新。"), "PATCH")}
                  >
                    {t("保存")}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><PlusIcon size={18} /> {t("新增履约点")}</CardTitle>
            <CardDescription>{t("代号只能用小写字母、数字和短横线，一旦创建不可更改。")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Labelled label={t("代号")}>
                <Input value={newNode.code} placeholder="ruaka" onChange={(event) => setNewNode({ ...newNode, code: event.target.value })} />
              </Labelled>
              <Labelled label={t("名称")}>
                <Input value={newNode.name} placeholder="Ruaka" onChange={(event) => setNewNode({ ...newNode, name: event.target.value })} />
              </Labelled>
              <Labelled label={t("门店手机号")}>
                <Input value={newNode.phone} placeholder="0712345678" onChange={(event) => setNewNode({ ...newNode, phone: event.target.value })} />
              </Labelled>
              <Labelled label={t("地址")}>
                <Input value={newNode.address} onChange={(event) => setNewNode({ ...newNode, address: event.target.value })} />
              </Labelled>
              <Labelled label={t("Google Maps 链接")}>
                <Input value={newNode.mapsUrl} onChange={(event) => setNewNode({ ...newNode, mapsUrl: event.target.value })} />
              </Labelled>
            </div>
            <div>
              <Button
                size="sm"
                disabled={busy || !newNode.code.trim() || !newNode.name.trim()}
                onClick={() => void save("/operations/nodes", { ...newNode, type: "STORE" }, t("履约点已创建。")).then(() =>
                  setNewNode({ code: "", name: "", phone: "", address: "", mapsUrl: "" })
                )}
              >
                {t("创建")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("员工归属门店")}</CardTitle>
          <CardDescription>
            {t("门店员工只能签收发给自己门店的包裹。仓库和总部员工不设归属，可以在任何履约点操作。")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("员工")}</TableHead>
                <TableHead>{t("工号")}</TableHead>
                <TableHead>{t("归属履约点")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell>{employee.name}</TableCell>
                  <TableCell className="font-mono text-xs">{employee.employeeCode}</TableCell>
                  <TableCell>
                    <NativeSelect
                      value={employee.homeNodeId ?? ""}
                      disabled={!canManage || busy}
                      onChange={(event) => void save("/operations/nodes/staff", {
                        employeeId: employee.id,
                        nodeId: event.target.value || null
                      }, t("员工归属已更新。"))}
                    >
                      <NativeSelectOption value="">{t("不限（仓库 / 总部）")}</NativeSelectOption>
                      {nodes.map((node) => (
                        <NativeSelectOption key={node.id} value={node.id}>{node.name}</NativeSelectOption>
                      ))}
                    </NativeSelect>
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

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
