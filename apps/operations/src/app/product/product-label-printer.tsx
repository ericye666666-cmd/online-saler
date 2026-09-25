"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { buildLabelPrintPayload, DEFAULT_PRINT_AGENT_URL, DEFAULT_PRINTER_NAME, isSupportedAgentPlatform, MACOS_PRINT_AGENT_DOWNLOAD_URL, PRINT_AGENT_DOWNLOAD_URL, printerList, selectDeliPrinter, type LocalPrinter } from "../local-label-print";
import type { JsonRecord } from "../operations-workspace-flow";
import { renderProductLabel } from "./product-label-raster";
import { t } from "@/i18n/runtime";

type Product = JsonRecord & { id: string; barcode?: string | null; title?: string | null; labelPrintedAt?: string | null };
async function agentRequest(path: string, options?: RequestInit) {
  let response: Response;
  try { response = await fetch(DEFAULT_PRINT_AGENT_URL + path, { ...options, signal: AbortSignal.timeout(path === "/print/label" ? 45000 : 8000) }); }
  catch { throw new Error(path === "/print/label" ? t("打印请求未返回，可能已经出纸。请先检查打印机；不要直接重复打印。") : t("打印助手未连接。请关闭旧助手，下载并启动新版打印助手；浏览器询问本地网络访问时请选择允许。")); }
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(body.message || body.error || t("打印助手返回错误。"));
  return body;
}

export function ProductLabelPrinter({ products, initialIndex, onClose, onConfirm }: {
  products: Product[]; initialIndex: number; onClose: () => void; onConfirm: (products: Product[]) => Promise<void>;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [printers, setPrinters] = useState<LocalPrinter[]>([]);
  const [printer, setPrinter] = useState(DEFAULT_PRINTER_NAME);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sent, setSent] = useState<Record<string, "sent" | "uncertain">>(() => {
    const saved: Record<string, "sent" | "uncertain"> = {};
    if (typeof window !== "undefined") for (const item of products) {
      try { const value = sessionStorage.getItem(`label-print:${item.barcode}`); if (value === "sent" || value === "uncertain") saved[item.id] = value; } catch {}
    }
    return saved;
  });
  function recordSubmission(item: Product, status: "sent" | "uncertain") {
    setSent(previous => ({ ...previous, [item.id]: status }));
    try { sessionStorage.setItem(`label-print:${item.barcode}`, status); } catch {}
  }
  const [preview, setPreview] = useState("");
  const current = products[index]!;
  useEffect(() => {
    try { setPreview(renderProductLabel(buildLabelPrintPayload({ product: current, labelSize: "60x40" })).preview); }
    catch (e) { setPreview(""); setError(String((e as Error).message)); }
  }, [current]);

  async function detect() {
    setBusy("detect"); setReady(false); setError("");
    try {
      const health = await agentRequest("/health");
      if (!health.capabilities?.includes("online_saler_raster_v1")) throw new Error(t("检测到旧版打印助手。请关闭旧助手，再下载并启动新版；新版同时支持 ERP 与商城。"));
      if (!isSupportedAgentPlatform(health.platform)) throw new Error(t("请在连接 Deli DL-720C 的电脑上打开此页面（Windows 或 Mac）。"));
      const list = printerList((await agentRequest("/printers")).printers);
      setPrinters(list);
      const name = selectDeliPrinter(list, printer);
      const selected = list.find(p => p.name === name && p.available !== false);
      if (!selected) throw new Error(t("未找到可用的 Deli DL-720C。请检查 USB、驱动、纸张和打印队列。"));
      setPrinter(name); setReady(true); setNotice(t("打印助手已连接，可以打印。出纸并贴好后请单独确认。"));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  }
  async function print(items: Product[]) {
    if (!ready || busy || !items.length) return;
    setBusy("print"); setError(""); setNotice("");
    let completed = 0;
    try {
      for (const item of items) {
        const payload = buildLabelPrintPayload({ product: item, labelSize: "60x40", printerName: printer });
        payload.label_payload.raster = renderProductLabel(payload).raster;
        // Record uncertainty before transport: a timeout may occur after paper prints.
        recordSubmission(item, "uncertain");
        await agentRequest("/print/label", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        completed++;
        recordSubmission(item, "sent");
        setNotice(t("已发送 {completed}/{length} 张，请核对实际出纸。", { completed: completed, length: items.length }));
      }
    } catch (e) { setError(t("已成功发送 {completed} 张；后续已停止。{message}", { completed: completed, message: (e as Error).message })); }
    finally { setBusy(""); }
  }
  async function confirm(items: Product[]) {
    if (!window.confirm(t("请确认这 {length} 件商品的标签已经实际出纸、条码清晰并贴在对应商品上。", { length: items.length }))) return;
    setBusy("confirm"); setError("");
    try { await onConfirm(items); setNotice(t("已确认 {length} 件贴标完成。", { length: items.length })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  }
  const remaining = products.filter(p => !p.labelPrintedAt && !sent[p.id]);
  const unconfirmed = products.filter(p => !p.labelPrintedAt);
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90vh] overflow-auto sm:max-w-5xl">
    <DialogTitle>{t("商品标签打印 / 贴标确认")}</DialogTitle>
    <DialogDescription>{t("沿用 ERP 的 Deli DL-720C 本地直打方式，固定 60×40 mm 标签。")}</DialogDescription>
    <div className="flex flex-wrap items-center gap-3 rounded border bg-muted/30 p-3 text-sm">
      <strong>{printer}</strong><span>{ready ? t("已连接") : t("未检测 / 未就绪")}</span><span className="text-xs text-muted-foreground">{DEFAULT_PRINT_AGENT_URL}</span>
      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void detect()}>{busy === "detect" ? t("检测中…") : t("检测")}</Button>
      <Button size="sm" variant="outline" asChild><a href={PRINT_AGENT_DOWNLOAD_URL} download="direct-loop-print-agent.zip">{t("下载打印代理（Windows）")}</a></Button>
      <Button size="sm" variant="outline" asChild><a href={MACOS_PRINT_AGENT_DOWNLOAD_URL} download="direct-loop-print-agent-macos.zip">{t("下载打印代理（Mac）")}</a></Button>
    </div>
    <p className="text-sm text-muted-foreground">{t("下载后解压：Windows 双击 DirectLoopPrintAgent.exe。Mac 第一次使用时，解压后在“终端”粘贴运行一次 sh ~/Downloads/DirectLoopPrintAgent/install_macos.sh，之后每次开机自动启动，无需再操作。然后点击“检测”。与 ERP 共用一个代理。")}</p>
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded border p-4"><h3 className="mb-4 font-semibold">{t("标签预览")}</h3>
        <div className="flex min-h-72 items-center justify-center bg-muted/40 p-4">{preview ? <img src={preview} width={480} height={320} className="h-auto w-full border bg-white" alt={t("60×40 mm 实际打印内容：商品名、尺码、货架位和条码")} /> : <p>{t("无法生成标签，请检查商品条码。")}</p>}</div>
        <div className="mt-4 flex items-center justify-between"><Button variant="outline" disabled={index === 0 || !!busy} onClick={() => setIndex(index - 1)}>{t("上一张")}</Button><span>{index + 1} / {products.length}</span><Button variant="outline" disabled={index === products.length - 1 || !!busy} onClick={() => setIndex(index + 1)}>{t("下一张")}</Button></div>
      </section>
      <section className="space-y-4"><p className="rounded border p-3 text-sm">{t("模板：商城单件商品 · 60×40 mm · Code 128")}</p>
        <label className="block text-sm">{t("打印机")}<select className="mt-2 w-full rounded border p-2" value={printer} disabled={!!busy} onChange={event => { setPrinter(event.target.value); setReady(!!printers.find(p => p.name === event.target.value && p.available !== false)); }}>{printers.length ? printers.map(p => <option key={p.name} value={p.name} disabled={p.available === false}>{p.name}{p.available === false ? t("（不可用）") : ""}</option>) : <option>{printer}</option>}</select></label>
        {error ? <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="rounded bg-green-50 p-3 text-sm text-green-800">{notice}</p> : null}
        {!ready ? <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">{t("启动打印助手后点击“检测”。与 ERP 共用一个助手，请勿同时启动两个。")}</p> : null}
        <div className="max-h-40 overflow-auto rounded border">{products.map((p, i) => <button key={p.id} disabled={!!busy} onClick={() => setIndex(i)} className={`flex w-full justify-between gap-2 border-b p-2 text-left text-sm ${i === index ? "bg-muted" : ""}`}><span className="truncate">{i + 1}. {p.title || p.barcode}</span><span className="shrink-0">{p.labelPrintedAt ? t("已贴标") : sent[p.id] === "uncertain" ? t("结果待核对") : sent[p.id] ? t("已发送，待贴标") : t("待打印")}</span></button>)}</div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!!busy || !ready || !preview || !!sent[current.id] || !!current.labelPrintedAt} onClick={() => void print([current])}>{t("打印当前标签（第")} {index + 1}  {t("张）")}</Button>
          <Button disabled={!!busy || !ready || !remaining.length} onClick={() => void print(remaining)}>{t("打印剩余")} {remaining.length}  {t("张")}</Button>
          <Button variant="outline" disabled={!!busy || !ready || !preview} onClick={() => { if (window.confirm(t("重打会再出一张相同条码的标签，请确认需要补打。"))) void print([current]); }}>{t("重打当前标签")}</Button>
          <Button variant="outline" disabled={!!busy || !!current.labelPrintedAt} onClick={() => void confirm([current])}>{t("确认当前标签已贴好")}</Button>
          <Button variant="outline" disabled={!!busy || !unconfirmed.length} onClick={() => void confirm(unconfirmed)}>{t("确认全部已贴好")}</Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("打印不会生成新条码或重复入库。只有确认贴标后才计入完成；随后按货架位摆放。刷新后保留本窗口的发送记录，待核对的标签请检查出纸后再决定是否重打。")}</p>
      </section>
    </div>
  </DialogContent></Dialog>;
}
