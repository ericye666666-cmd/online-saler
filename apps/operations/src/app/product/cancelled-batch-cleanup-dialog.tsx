"use client";

// ONE-OFF CLEANUP (2026-09-28). Deletes the items that earlier batch cancellations left as
// "Rejected". Remove this file, its button in product-center-client.tsx, and
// apps/api/src/operations/cancelled-batch-cleanup.ts once the owner has used it.

import { useEffect, useState } from "react";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n/runtime";

type CleanupSummary = {
  products: Array<{ productCode: string; title: string | null; batchCode: string }>;
  skipped: Array<{ productCode: string; reason: string }>;
};

type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const CONFIRM_WORD = "DELETE";
const ENDPOINT = "/operations/product-batches/cancelled-cleanup";

export function CancelledBatchCleanupButton(props: {
  ids: { adminUserId: string; employeeId: string };
  request: Request;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="outline" onClick={() => setOpen(true)}>
      <Trash2Icon data-icon="inline-start" />
      {t("清理整批取消留下的商品")}
    </Button>
    {open ? <CleanupDialog {...props} onClose={() => setOpen(false)} /> : null}
  </>;
}

function CleanupDialog(props: {
  ids: { adminUserId: string; employeeId: string };
  request: Request;
  onDone: () => void;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<CleanupSummary | null>(null);
  const [result, setResult] = useState<CleanupSummary | null>(null);
  const [confirmWord, setConfirmWord] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { ids, request } = props;

  useEffect(() => {
    let cancelled = false;
    request<CleanupSummary>(ENDPOINT, { method: "POST", body: JSON.stringify({ ...ids, dryRun: true }) })
      .then((summary) => { if (!cancelled) setPreview(summary); })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : t("读取失败。")); });
    return () => { cancelled = true; };
  }, [ids, request]);

  async function run() {
    if (!preview || saving || confirmWord.trim() !== CONFIRM_WORD) return;
    setSaving(true);
    setError("");
    try {
      setResult(await request<CleanupSummary>(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ ...ids, expectedCount: preview.products.length })
      }));
      props.onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("删除失败。"));
    } finally { setSaving(false); }
  }

  const summary = result ?? preview;
  const nothing = Boolean(preview && preview.products.length === 0);
  const danger = "rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm";

  return <Dialog open onOpenChange={(open) => { if (!open && !saving) props.onClose(); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{result ? t("已删除") : t("清理整批取消留下的商品")}</DialogTitle></DialogHeader>
      {!summary && !error ? <p className="text-muted-foreground text-sm">{t("正在读取…")}</p> : null}
      {summary ? <div className="flex flex-col gap-3 text-sm">
        {result
          ? <p>{t("已永久删除 {count} 件整批取消留下的商品。", { count: result.products.length })}</p>
          : nothing
            ? <p>{t("没有整批取消留下的商品需要清理。")}</p>
            : <div className={danger}>{t("以下 {count} 件是以前整批取消时留下的「已拒绝」商品，会被永久删除，就当没录过，删除后无法恢复。审核时被拒绝的商品不在这里，不会被删除。", { count: summary.products.length })}</div>}
        {!result && summary.products.length > 0 ? <ul className="max-h-60 overflow-y-auto rounded-md border p-2 font-mono text-xs">
          {summary.products.map((item) => <li key={item.productCode}>{item.productCode}{item.title ? ` · ${item.title}` : ""}</li>)}
        </ul> : null}
        {summary.skipped.length > 0 ? <div>
          <div className="text-muted-foreground">{t("{count} 件关联过顾客订单，保留不删：", { count: summary.skipped.length })}</div>
          <ul className="list-disc pl-5 text-xs">{summary.skipped.map((item) => <li key={item.productCode}>{item.productCode} · {item.reason}</li>)}</ul>
        </div> : null}
      </div> : null}
      {!result && preview && !nothing ? <Field>
        <FieldLabel htmlFor="cleanup-confirm">{t("输入 {word} 确认删除", { word: CONFIRM_WORD })}</FieldLabel>
        <Input id="cleanup-confirm" value={confirmWord} disabled={saving} autoComplete="off" onChange={(event) => setConfirmWord(event.target.value)} />
      </Field> : null}
      {error ? <div className={danger}>{error}</div> : null}
      <DialogFooter>
        {result || nothing
          ? <Button onClick={props.onClose}>{t("完成")}</Button>
          : <><Button variant="outline" disabled={saving} onClick={props.onClose}>{t("取消")}</Button><Button variant="destructive" disabled={saving || !preview || confirmWord.trim() !== CONFIRM_WORD} onClick={() => void run()}>{saving ? t("删除中…") : t("永久删除 {count} 件", { count: preview?.products.length ?? 0 })}</Button></>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
