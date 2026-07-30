"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCwIcon } from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { accessRequest, adminQuery, type PermissionRecord } from "../access-client";

export default function PermissionsPage() {
  const { session } = useOperationsSession();
  const adminUserId = session?.adminUser?.id ?? "";
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!adminUserId) return;
    setBusy("load");
    setError("");
    try {
      setPermissions(await accessRequest<PermissionRecord[]>(`/operations/access/permissions?${adminQuery(adminUserId)}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取权限。");
    } finally {
      setBusy("");
    }
  }, [adminUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const modules = useMemo(() => [...new Set(permissions.map((permission) => permission.module))], [permissions]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">系统管理</p>
          <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">权限管理</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
            权限分为模块、页面和操作三层。前端只显示有权限的菜单，后端接口也会独立校验权限。
          </p>
        </div>
        <Button variant="outline" disabled={Boolean(busy)} onClick={() => void load()}>
          <RefreshCwIcon data-icon="inline-start" />
          刷新
        </Button>
      </section>
      {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">{error}</div> : null}
      <section className="grid gap-4">
        {modules.map((module) => (
          <Card key={module}>
            <CardHeader>
              <CardTitle>{module}</CardTitle>
              <CardDescription>模块级、页面级和操作级权限。</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>代码</TableHead>
                    <TableHead>粒度</TableHead>
                    <TableHead>页面</TableHead>
                    <TableHead>操作</TableHead>
                    <TableHead>说明</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissions.filter((permission) => permission.module === module).map((permission) => (
                    <TableRow key={permission.code}>
                      <TableCell className="font-mono text-xs">{permission.code}</TableCell>
                      <TableCell><Badge variant="secondary">{permission.scope}</Badge></TableCell>
                      <TableCell>{permission.page ?? "-"}</TableCell>
                      <TableCell>{permission.action ?? "-"}</TableCell>
                      <TableCell>{permission.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
