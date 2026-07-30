"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { PlusIcon, RefreshCwIcon, ShieldCheckIcon } from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { accessRequest, adminQuery, type AdminUserAccount, type RoleRecord } from "../access-client";

type AdminStatus = "ACTIVE" | "DISABLED" | "LOCKED";

export default function AccountsPage() {
  const { session, hasPermission } = useOperationsSession();
  const adminUserId = session?.adminUser?.id ?? "";
  const canManage = hasPermission("action.system.manage-users");
  const [accounts, setAccounts] = useState<AdminUserAccount[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [roleSelections, setRoleSelections] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    loginAccount: "",
    email: "",
    phone: "",
    initialPassword: "",
    roleCode: "PRODUCT_DIGITIZATION"
  });

  const load = useCallback(async () => {
    if (!adminUserId) return;
    setBusy("load");
    setError("");
    try {
      const query = adminQuery(adminUserId);
      const [nextAccounts, nextRoles] = await Promise.all([
        accessRequest<AdminUserAccount[]>(`/operations/access/accounts?${query}`),
        accessRequest<RoleRecord[]>(`/operations/access/roles?${query}`)
      ]);
      setAccounts(nextAccounts);
      setRoles(nextRoles);
      setRoleSelections(
        Object.fromEntries(
          nextAccounts
            .filter((account) => account.adminUser)
            .map((account) => [account.adminUser!.id, account.roles[0]?.code ?? ""])
        )
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取账号。");
    } finally {
      setBusy("");
    }
  }, [adminUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const roleOptions = useMemo(() => roles.map((role) => role.code), [roles]);

  async function createAccount() {
    if (!canManage) return;
    setBusy("create");
    setError("");
    try {
      await accessRequest("/operations/access/accounts", {
        method: "POST",
        body: JSON.stringify({
          requesterAdminUserId: adminUserId,
          name: form.name,
          loginAccount: form.loginAccount,
          email: form.email || undefined,
          phone: form.phone || undefined,
          initialPassword: form.initialPassword || undefined,
          roleCodes: [form.roleCode]
        })
      });
      setOpen(false);
      setForm({
        name: "",
        loginAccount: "",
        email: "",
        phone: "",
        initialPassword: "",
        roleCode: roleOptions[0] ?? "PRODUCT_DIGITIZATION"
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法创建账号。");
    } finally {
      setBusy("");
    }
  }

  async function setStatus(id: string, status: AdminStatus) {
    if (!canManage) return;
    setBusy(id);
    setError("");
    try {
      await accessRequest(`/operations/access/accounts/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ requesterAdminUserId: adminUserId, status })
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法更新账号状态。");
    } finally {
      setBusy("");
    }
  }

  async function saveRole(id: string) {
    if (!canManage) return;
    const roleCode = roleSelections[id];
    if (!roleCode) return;
    setBusy(`role-${id}`);
    setError("");
    try {
      await accessRequest(`/operations/access/accounts/${id}/roles`, {
        method: "PATCH",
        body: JSON.stringify({ requesterAdminUserId: adminUserId, roleCodes: [roleCode] })
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法更新账号角色。");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">系统管理</p>
          <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">账号管理</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
            管理后台账号、账号状态和角色。顾客 Google 登录不在这里管理。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={Boolean(busy)} onClick={() => void load()}>
            <RefreshCwIcon data-icon="inline-start" />
            刷新
          </Button>
          {canManage ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <PlusIcon data-icon="inline-start" />
                  新建账号
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>创建后台账号</DialogTitle>
                </DialogHeader>
                <FieldGroup>
                  <FormField label="姓名">
                    <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                  </FormField>
                  <FormField label="登录账号">
                    <Input value={form.loginAccount} onChange={(event) => setForm((current) => ({ ...current, loginAccount: event.target.value }))} />
                  </FormField>
                  <FormField label="邮箱">
                    <Input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
                  </FormField>
                  <FormField label="手机号">
                    <Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
                  </FormField>
                  <FormField label="初始密码">
                    <Input type="password" value={form.initialPassword} onChange={(event) => setForm((current) => ({ ...current, initialPassword: event.target.value }))} />
                  </FormField>
                  <FormField label="角色">
                    <NativeSelect className="w-full" value={form.roleCode} onChange={(event) => setForm((current) => ({ ...current, roleCode: event.target.value }))}>
                      {roleOptions.map((roleCode) => <NativeSelectOption key={roleCode} value={roleCode}>{roleCode}</NativeSelectOption>)}
                    </NativeSelect>
                  </FormField>
                </FieldGroup>
                <DialogFooter>
                  <Button disabled={busy === "create"} onClick={() => void createAccount()}>
                    创建账号
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </section>

      {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">{error}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>后台账号</CardTitle>
          <CardDescription>账号状态支持 ACTIVE、DISABLED 和 LOCKED。</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>姓名</TableHead>
                <TableHead>账号</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>关联员工</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => {
                const adminUser = account.adminUser;
                if (!adminUser) return null;
                return (
                  <TableRow key={adminUser.id}>
                    <TableCell className="font-medium">{adminUser.name}</TableCell>
                    <TableCell>{adminUser.loginAccount}</TableCell>
                    <TableCell>
                      {canManage ? (
                        <div className="flex min-w-56 items-center gap-2">
                          <NativeSelect
                            className="min-w-44"
                            value={roleSelections[adminUser.id] ?? account.roles[0]?.code ?? roleOptions[0] ?? ""}
                            onChange={(event) => setRoleSelections((current) => ({ ...current, [adminUser.id]: event.target.value }))}
                          >
                            {roleOptions.map((roleCode) => <NativeSelectOption key={roleCode} value={roleCode}>{roleCode}</NativeSelectOption>)}
                          </NativeSelect>
                          <Button size="sm" variant="outline" disabled={busy === `role-${adminUser.id}`} onClick={() => void saveRole(adminUser.id)}>
                            保存
                          </Button>
                        </div>
                      ) : (
                        account.roles.map((role) => role.name).join(", ") || "-"
                      )}
                    </TableCell>
                    <TableCell><Badge variant={adminUser.status === "ACTIVE" ? "default" : "secondary"}>{adminUser.status}</Badge></TableCell>
                    <TableCell>{adminUser.linkedEmployee?.employeeCode ?? "-"}</TableCell>
                    <TableCell className="text-right">
                      {canManage ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" disabled={busy === adminUser.id} onClick={() => void setStatus(adminUser.id, "ACTIVE")}>解锁</Button>
                          <Button size="sm" variant="outline" disabled={busy === adminUser.id} onClick={() => void setStatus(adminUser.id, "LOCKED")}>锁定</Button>
                          <Button size="sm" variant="outline" disabled={busy === adminUser.id} onClick={() => void setStatus(adminUser.id, "DISABLED")}>停用</Button>
                        </div>
                      ) : (
                        <ShieldCheckIcon className="ml-auto text-muted-foreground" />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function FormField(props: { label: string; children: ReactNode }) {
  return (
    <Field>
      <FieldLabel>{props.label}</FieldLabel>
      {props.children}
    </Field>
  );
}
