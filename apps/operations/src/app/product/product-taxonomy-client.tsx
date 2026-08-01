"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlusIcon, RefreshCwIcon, SaveIcon, SettingsIcon } from "lucide-react";

import { useOperationsSession } from "@/components/admin/operations-access-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const API_PROXY_URL = "/api-proxy";
const GROUPS = ["CATEGORY", "SUBCATEGORY", "COLOR", "SIZE", "CONDITION", "DEFECT"] as const;
type Group = (typeof GROUPS)[number];
type Option = { code: string; displayName: string; parentCode?: string | null; sortOrder: number; active: boolean; productCount: number };
type Taxonomy = { source: string; sharedBy: string[]; groups: Record<Group, Option[]> };

const GROUP_LABELS: Record<Group, string> = {
  CATEGORY: "分类", SUBCATEGORY: "子分类", COLOR: "颜色", SIZE: "尺码", CONDITION: "成色", DEFECT: "瑕疵"
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_PROXY_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) as Record<string, unknown> : {};
  if (!response.ok) throw new Error(String(body.message ?? `Request failed: ${response.status}`));
  return body as T;
}

export function ProductTaxonomyClient() {
  const { session, hasPermission } = useOperationsSession();
  const adminUserId = String(session?.adminUser?.id ?? "");
  const canEdit = hasPermission("action.product.edit");
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [group, setGroup] = useState<Group>("CATEGORY");
  const [drafts, setDrafts] = useState<Record<string, Option>>({});
  const [newOption, setNewOption] = useState({ code: "", displayName: "", parentCode: "", sortOrder: "" });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!adminUserId) return;
    setBusy("load");
    setError("");
    try {
      const value = await api<Taxonomy>(`/operations/product-factory-admin/taxonomy?${new URLSearchParams({ adminUserId })}`);
      setTaxonomy(value);
      setDrafts(Object.fromEntries(GROUPS.flatMap((key) => value.groups[key].map((option) => [`${key}:${option.code}`, option]))));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取分类配置。");
    } finally {
      setBusy("");
    }
  }, [adminUserId]);

  useEffect(() => { void load(); }, [load]);
  const categoryOptions = useMemo(() => taxonomy?.groups.CATEGORY ?? [], [taxonomy]);

  async function save(option: Option) {
    setBusy(option.code);
    setError("");
    setNotice("");
    try {
      await api(`/operations/product-factory-admin/taxonomy/${group}/${encodeURIComponent(option.code)}`, {
        method: "PATCH",
        body: JSON.stringify({ adminUserId, displayName: option.displayName, parentCode: option.parentCode, sortOrder: Number(option.sortOrder), active: option.active })
      });
      setNotice(`${option.code} 已保存。`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法保存分类项。");
    } finally {
      setBusy("");
    }
  }

  async function createOption() {
    setBusy("create");
    setError("");
    setNotice("");
    try {
      await api("/operations/product-factory-admin/taxonomy/options", {
        method: "POST",
        body: JSON.stringify({ adminUserId, group, ...newOption, sortOrder: newOption.sortOrder ? Number(newOption.sortOrder) : undefined })
      });
      setNewOption({ code: "", displayName: "", parentCode: "", sortOrder: "" });
      setNotice("新分类项已加入。代码创建后不会改变。");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法新增分类项。");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">商品中心</p>
          <h1 className="text-2xl font-semibold tracking-normal">分类与属性</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">这里是 OpenAI 识别和批次人工校准的管理源。商城筛选自动读取已发布商品的实际值。</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href="/system/product-factory"><SettingsIcon data-icon="inline-start" />配置检查</Link></Button>
          <Button variant="outline" disabled={Boolean(busy)} onClick={() => void load()}><RefreshCwIcon data-icon="inline-start" />刷新</Button>
        </div>
      </header>

      {error ? <Message tone="danger">{error}</Message> : null}
      {notice ? <Message tone="neutral">{notice}</Message> : null}

      <Tabs value={group} onValueChange={(value) => setGroup(value as Group)}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          {GROUPS.map((key) => <TabsTrigger key={key} value={key} className="shrink-0">{GROUP_LABELS[key]} {taxonomy ? taxonomy.groups[key].length : ""}</TabsTrigger>)}
        </TabsList>
        {GROUPS.map((key) => (
          <TabsContent key={key} value={key} className="space-y-4 pt-3">
            {canEdit ? (
              <Card>
                <CardHeader><CardTitle>新增{GROUP_LABELS[key]}</CardTitle><CardDescription>代码用于历史数据和系统接口，创建后不可修改；不提供删除，只可停用。</CardDescription></CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Input aria-label="代码" placeholder="代码，例如 VINTAGE_COATS" value={newOption.code} onChange={(event) => setNewOption((value) => ({ ...value, code: event.target.value }))} />
                  <Input aria-label="显示名称" placeholder="员工看到的名称" value={newOption.displayName} onChange={(event) => setNewOption((value) => ({ ...value, displayName: event.target.value }))} />
                  {key === "SUBCATEGORY" ? <ParentSelect value={newOption.parentCode} categories={categoryOptions} onChange={(value) => setNewOption((current) => ({ ...current, parentCode: value }))} /> : <div className="hidden lg:block" />}
                  <Input aria-label="排序" inputMode="numeric" placeholder="排序" value={newOption.sortOrder} onChange={(event) => setNewOption((value) => ({ ...value, sortOrder: event.target.value }))} />
                  <Button disabled={busy === "create" || !newOption.code.trim() || !newOption.displayName.trim()} onClick={() => void createOption()}><PlusIcon data-icon="inline-start" />新增</Button>
                </CardContent>
              </Card>
            ) : null}

            <div className="divide-y rounded-md border">
              {(taxonomy?.groups[key] ?? []).map((option) => {
                const draftKey = `${key}:${option.code}`;
                const draft = drafts[draftKey] ?? option;
                return (
                  <div key={option.code} className="grid gap-3 p-3 sm:grid-cols-[minmax(120px,1fr)_minmax(160px,2fr)_100px_auto] sm:items-center">
                    <div className="min-w-0"><div className="truncate font-mono text-xs font-semibold">{option.code}</div><div className="mt-1 text-xs text-muted-foreground">商品 {option.productCount}</div></div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <Input aria-label={`${option.code} 显示名称`} disabled={!canEdit} value={draft.displayName} onChange={(event) => setDrafts((current) => ({ ...current, [draftKey]: { ...draft, displayName: event.target.value } }))} />
                      {key === "SUBCATEGORY" ? <ParentSelect disabled={!canEdit} value={draft.parentCode ?? ""} categories={categoryOptions} onChange={(value) => setDrafts((current) => ({ ...current, [draftKey]: { ...draft, parentCode: value || null } }))} /> : null}
                    </div>
                    <Input aria-label={`${option.code} 排序`} disabled={!canEdit} inputMode="numeric" value={String(draft.sortOrder)} onChange={(event) => setDrafts((current) => ({ ...current, [draftKey]: { ...draft, sortOrder: Number(event.target.value) } }))} />
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <label className="flex items-center gap-2 text-sm"><Checkbox disabled={!canEdit} checked={draft.active} onCheckedChange={(checked) => setDrafts((current) => ({ ...current, [draftKey]: { ...draft, active: checked === true } }))} />启用</label>
                      {canEdit ? <Button size="sm" variant="outline" disabled={busy === option.code} onClick={() => void save(draft)}><SaveIcon data-icon="inline-start" />保存</Button> : <Badge variant="secondary">只读</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ParentSelect({ value, categories, disabled, onChange }: { value: string; categories: Option[]; disabled?: boolean; onChange: (value: string) => void }) {
  return <NativeSelect aria-label="父分类" disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}><NativeSelectOption value="">通用</NativeSelectOption>{categories.map((option) => <NativeSelectOption key={option.code} value={option.code}>{option.displayName}</NativeSelectOption>)}</NativeSelect>;
}

function Message({ tone, children }: { tone: "danger" | "neutral"; children: React.ReactNode }) {
  return <div className={tone === "danger" ? "rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" : "rounded-md border bg-muted/30 p-3 text-sm"}>{children}</div>;
}
