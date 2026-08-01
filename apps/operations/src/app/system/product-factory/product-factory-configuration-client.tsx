"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2Icon, CircleAlertIcon, PrinterIcon, RefreshCwIcon } from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Check = { key: string; label: string; status: string; secret: boolean; guidance: string; value: string | null };
type Response = { checks: Check[]; configured: number; total: number };

export function ProductFactoryConfigurationClient() {
  const { session } = useOperationsSession();
  const adminUserId = String(session?.adminUser?.id ?? "");
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!adminUserId) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api-proxy/operations/product-factory-admin/configuration?${new URLSearchParams({ adminUserId })}`);
      const body = await response.json() as Response & { message?: string };
      if (!response.ok) throw new Error(body.message ?? "无法读取服务器配置。");
      let printer: Check = { key: "PRINT_AGENT", label: "Deli 打印代理", status: "MISSING", secret: false, guidance: "启动员工电脑上的 Deli 打印代理，并确认 8719 端口可访问。", value: null };
      try {
        const local = await fetch("http://127.0.0.1:8719/health", { signal: AbortSignal.timeout(2500) });
        if (local.ok) printer = { ...printer, status: "CONFIGURED", guidance: "本机打印代理已连接。", value: "127.0.0.1:8719" };
      } catch {
        // A local printer agent is optional outside the employee workstation.
      }
      setChecks(body.checks.map((check) => check.key === "PRINT_AGENT" ? printer : check));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取配置。");
    } finally {
      setBusy(false);
    }
  }, [adminUserId]);

  useEffect(() => { void load(); }, [load]);
  const ready = checks.filter((check) => check.status === "CONFIGURED").length;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm text-muted-foreground">系统管理</p><h1 className="text-2xl font-semibold tracking-normal">商品工厂配置</h1><p className="mt-1 text-sm text-muted-foreground">检查 staging 服务、图片处理路由、员工账号与本机打印代理。密钥值不会显示。</p></div>
        <Button variant="outline" disabled={busy} onClick={() => void load()}><RefreshCwIcon data-icon="inline-start" />重新检查</Button>
      </header>
      {error ? <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      <div className="flex flex-wrap items-center gap-2"><Badge>{ready}/{checks.length} 已就绪</Badge><Badge variant={session?.adminUser?.linkedEmployeeId ? "default" : "destructive"}>{session?.adminUser?.linkedEmployeeId ? "已关联员工" : "未关联员工"}</Badge><span className="text-xs text-muted-foreground">当前账号：{session?.adminUser?.loginAccount}</span></div>
      <div className="divide-y rounded-md border">
        {checks.map((check) => {
          const ok = check.status === "CONFIGURED";
          return <div key={check.key} className="grid gap-2 p-4 sm:grid-cols-[minmax(180px,1fr)_auto_minmax(220px,2fr)] sm:items-center"><div className="flex min-w-0 items-center gap-2">{check.key === "PRINT_AGENT" ? <PrinterIcon className="size-4" /> : ok ? <CheckCircle2Icon className="size-4 text-emerald-600" /> : <CircleAlertIcon className="size-4 text-amber-600" />}<span className="font-medium">{check.label}</span></div><Badge variant={ok ? "default" : "secondary"}>{ok ? "已配置" : check.status === "CLIENT_CHECK" ? "需本机检查" : "缺失"}</Badge><div className="text-sm text-muted-foreground">{check.value && !check.secret ? <span className="mr-2 font-mono text-xs text-foreground">{check.value}</span> : null}{check.guidance}</div></div>;
        })}
      </div>
      <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/product/taxonomy">管理分类与属性</Link></Button><Button asChild variant="outline"><Link href="/system/accounts">检查员工账号</Link></Button></div>
    </div>
  );
}
