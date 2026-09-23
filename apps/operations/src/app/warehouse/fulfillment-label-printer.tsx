"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  buildFulfillmentLabelPayload,
  DEFAULT_PRINT_AGENT_URL,
  DEFAULT_PRINTER_NAME,
  PRINT_AGENT_DOWNLOAD_URL,
  printerList,
  selectDeliPrinter,
  type LocalPrinter
} from "../local-label-print";
import { renderFulfillmentLabels, type FulfillmentLabelInput, type FulfillmentLabelSheet } from "./fulfillment-label-raster";
import { t } from "@/i18n/runtime";

/**
 * Prints one order's strip of 60×40 mm labels on the store's Deli DL-720C.
 *
 * The labels go one after another on the roll, so they are sent one request at
 * a time and the count of what actually left is reported. A run that stops
 * halfway says where it stopped rather than silently leaving a parcel with a
 * routing label and no picking list.
 *
 * Reprinting is deliberately easy and carries no state: these are stickers, not
 * records. Nothing downstream counts how many were printed.
 */
/** What each label in the strip is for, shown under its preview. */
const SHEET_LABEL: Record<FulfillmentLabelSheet["kind"], () => string> = {
  routing: () => t("贴包裹"),
  customer: () => t("顾客信息"),
  picking: () => t("拣货清单")
};

async function agentRequest(path: string, options?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(DEFAULT_PRINT_AGENT_URL + path, {
      ...options,
      signal: AbortSignal.timeout(path === "/print/label" ? 45000 : 8000)
    });
  } catch {
    throw new Error(path === "/print/label"
      ? t("打印请求没有返回，可能已经出纸。请先看一眼打印机，不要直接重复打印。")
      : t("打印助手未连接。请启动 Windows 打印助手；浏览器询问本地网络访问时选择允许。"));
  }
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(body.message || body.error || t("打印助手返回错误。"));
  return body;
}

export function FulfillmentLabelPrinter({ label, onClose }: { label: FulfillmentLabelInput; onClose: () => void }) {
  const [printers, setPrinters] = useState<LocalPrinter[]>([]);
  const [printer, setPrinter] = useState(DEFAULT_PRINTER_NAME);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sheets, setSheets] = useState<FulfillmentLabelSheet[]>([]);

  useEffect(() => {
    try {
      setSheets(renderFulfillmentLabels(label));
      setError("");
    } catch (caught) {
      setSheets([]);
      setError((caught as Error).message);
    }
  }, [label]);

  async function detect() {
    setBusy("detect");
    setReady(false);
    setError("");
    try {
      const health = await agentRequest("/health");
      if (!health.capabilities?.includes("online_saler_raster_v1")) {
        throw new Error(t("打印助手版本过旧。请关闭后下载并启动新版。"));
      }
      if (health.platform !== "windows") {
        throw new Error(t("请在连接 Deli DL-720C 的 Windows 电脑上打开这个页面。"));
      }
      const list = printerList((await agentRequest("/printers")).printers);
      setPrinters(list);
      const name = selectDeliPrinter(list, printer);
      if (!list.find((item) => item.name === name && item.available !== false)) {
        throw new Error(t("没有找到可用的 Deli DL-720C。请检查 USB、驱动、纸卷和 Windows 打印队列。"));
      }
      setPrinter(name);
      setReady(true);
      setNotice(t("打印助手已连接。"));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function print(only?: FulfillmentLabelSheet) {
    if (!ready || busy || !sheets.length) return;
    const run = only ? [only] : sheets;
    setBusy("print");
    setError("");
    setNotice("");
    let sent = 0;
    try {
      for (const sheet of run) {
        const payload = buildFulfillmentLabelPayload({ ...label, printerName: printer });
        payload.label_payload.raster = sheet.raster;
        await agentRequest("/print/label", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        sent += 1;
        setNotice(t("已发送 {sent}/{total} 张。", { sent, total: run.length }));
      }
      setNotice(t("{total} 张已全部发送。第 1 张贴在包裹上，其余随包裹带走。", { total: run.length }));
    } catch (caught) {
      setError(t("已发送 {sent} 张后停止。{message}", { sent, message: (caught as Error).message }));
    } finally {
      setBusy("");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
        <DialogTitle>{t("打印包裹面单")}</DialogTitle>
        <DialogDescription>
          {t("60×40 mm 不干胶 · Deli DL-720C · 连着打几张：路由、顾客、拣货清单")}
        </DialogDescription>

        <div className="flex flex-wrap items-center gap-3 rounded border bg-muted/30 p-3 text-sm">
          <strong>{printer}</strong>
          <span>{ready ? t("已连接") : t("未检测")}</span>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void detect()}>
            {busy === "detect" ? t("检测中…") : t("检测")}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={PRINT_AGENT_DOWNLOAD_URL} download="direct-loop-print-agent.zip">{t("下载打印助手")}</a>
          </Button>
        </div>

        {sheets.length ? (
          <div className="grid gap-3 bg-muted/40 p-4 sm:grid-cols-2">
            {sheets.map((sheet) => (
              <figure key={sheet.index} className="m-0">
                <img
                  src={sheet.preview}
                  width={480}
                  height={320}
                  className="h-auto w-full border bg-white"
                  alt={t("第 {index} 张，共 {total} 张", { index: sheet.index, total: sheet.total })}
                />
                <figcaption className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{sheet.index}/{sheet.total} · {SHEET_LABEL[sheet.kind]()}</span>
                  <button
                    type="button"
                    className="underline disabled:no-underline disabled:opacity-50"
                    disabled={!!busy || !ready}
                    onClick={() => void print(sheet)}
                  >
                    {t("只打这一张")}
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="bg-muted/40 p-4 text-sm">{t("无法生成面单，请检查包裹号。")}</p>
        )}

        {printers.length > 1 ? (
          <label className="block text-sm">
            {t("打印机")}
            <select
              className="mt-2 w-full rounded border p-2"
              value={printer}
              disabled={!!busy}
              onChange={(event) => {
                setPrinter(event.target.value);
                setReady(!!printers.find((item) => item.name === event.target.value && item.available !== false));
              }}
            >
              {printers.map((item) => (
                <option key={item.name} value={item.name} disabled={item.available === false}>
                  {item.name}{item.available === false ? t("（不可用）") : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {error ? <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="rounded bg-green-50 p-3 text-sm text-green-800">{notice}</p> : null}
        {!ready && !error ? (
          <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">
            {t("先启动 Windows 打印助手，再点「检测」。和 ERP 共用一个助手，不要同时开两个。")}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button disabled={!!busy || !ready || !sheets.length} onClick={() => void print()}>
            {busy === "print" ? t("发送中…") : t("打印全部 {total} 张", { total: sheets.length })}
          </Button>
          <Button variant="outline" disabled={!!busy} onClick={onClose}>{t("关闭")}</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("第 1 张贴在包裹上，其余随包裹带走。每张都印着订单号和张数，掉了也能对回来。面单只是贴纸，重打多少次都不影响订单。")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
