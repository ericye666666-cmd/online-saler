"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { PencilIcon, PlusIcon, RefreshCwIcon } from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { accessRequest, adminQuery, type RoleRecord } from "../access-client";

type RoleForm = {
  code: string;
  name: string;
  description: string;
  permissionCodes: string;
};

const emptyRoleForm: RoleForm = { code: "", name: "", description: "", permissionCodes: "" };

export default function RolesPage() {
  const { session, hasPermission } = useOperationsSession();
  const adminUserId = session?.adminUser?.id ?? "";
  const canManage = hasPermission("action.system.manage-roles");
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRecord | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState<RoleForm>(emptyRoleForm);
  const [editForm, setEditForm] = useState<RoleForm>(emptyRoleForm);

  const load = useCallback(async () => {
    if (!adminUserId) return;
    setBusy("load");
    setError("");
    try {
      setRoles(await accessRequest<RoleRecord[]>(`/operations/access/roles?${adminQuery(adminUserId)}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取角色。");
    } finally {
      setBusy("");
    }
  }, [adminUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createRole() {
    if (!canManage) return;
    setBusy("create");
    setError("");
    try {
      await accessRequest("/operations/access/roles", {
        method: "POST",
        body: JSON.stringify({
          requesterAdminUserId: adminUserId,
          code: form.code,
          name: form.name,
          description: form.description,
          permissionCodes: parsePermissionCodes(form.permissionCodes)
        })
      });
      setForm(emptyRoleForm);
      setCreateOpen(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法创建角色。");
    } finally {
      setBusy("");
    }
  }

  function openEditor(role: RoleRecord) {
    setEditingRole(role);
    setEditForm({
      code: role.code,
      name: role.name,
      description: role.description ?? "",
      permissionCodes: role.permissions.map((permission) => permission.code).join(", ")
    });
  }

  async function updateRole() {
    if (!canManage || !editingRole) return;
    setBusy(`edit-${editingRole.id}`);
    setError("");
    try {
      await accessRequest(`/operations/access/roles/${editingRole.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          requesterAdminUserId: adminUserId,
          name: editForm.name,
          description: editForm.description,
          permissionCodes: parsePermissionCodes(editForm.permissionCodes)
        })
      });
      setEditingRole(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法更新角色。");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">系统管理</p>
          <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">角色管理</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
            角色由模块、页面和操作权限组合而成。Super Admin 可以创建角色，也可以调整已有角色权限。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={Boolean(busy)} onClick={() => void load()}>
            <RefreshCwIcon data-icon="inline-start" />
            刷新
          </Button>
          {canManage ? (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <PlusIcon data-icon="inline-start" />
                  新建角色
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>创建角色</DialogTitle>
                </DialogHeader>
                <RoleFormFields form={form} onChange={setForm} includeCode />
                <DialogFooter>
                  <Button disabled={busy === "create"} onClick={() => void createRole()}>创建角色</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </section>

      {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">{error}</div> : null}

      <section className="grid gap-4 lg:grid-cols-2">
        {roles.map((role) => (
          <Card key={role.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{role.name}</CardTitle>
                  <CardDescription>{role.code} - {role.description}</CardDescription>
                </div>
                {canManage ? (
                  <Button size="sm" variant="outline" onClick={() => openEditor(role)}>
                    <PencilIcon data-icon="inline-start" />
                    编辑
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {role.permissions.map((permission) => (
                <Badge key={permission.code} variant="secondary">{permission.code}</Badge>
              ))}
            </CardContent>
          </Card>
        ))}
      </section>

      <Dialog open={Boolean(editingRole)} onOpenChange={(open) => !open && setEditingRole(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑角色权限</DialogTitle>
          </DialogHeader>
          <RoleFormFields form={editForm} onChange={setEditForm} />
          <DialogFooter>
            <Button disabled={Boolean(editingRole && busy === `edit-${editingRole.id}`)} onClick={() => void updateRole()}>
              保存角色
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoleFormFields(props: { form: RoleForm; onChange: (next: RoleForm) => void; includeCode?: boolean }) {
  const { form, onChange, includeCode } = props;
  return (
    <FieldGroup>
      {includeCode ? (
        <FormField label="角色代码">
          <Input value={form.code} onChange={(event) => onChange({ ...form, code: event.target.value })} />
        </FormField>
      ) : null}
      <FormField label="角色名称">
        <Input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} />
      </FormField>
      <FormField label="说明">
        <Input value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} />
      </FormField>
      <Field>
        <FieldLabel>权限代码</FieldLabel>
        <Textarea rows={6} value={form.permissionCodes} onChange={(event) => onChange({ ...form, permissionCodes: event.target.value })} />
        <FieldDescription>多个权限用英文逗号分隔，例如 module.product, page.product.digitalization, action.product.edit。</FieldDescription>
      </Field>
    </FieldGroup>
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

function parsePermissionCodes(value: string): string[] {
  return value.split(/\s*,\s*/).map((code) => code.trim()).filter(Boolean);
}
