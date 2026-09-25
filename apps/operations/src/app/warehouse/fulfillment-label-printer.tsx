"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  buildFulfillmentLabelPayload,
  DEFAULT_PRINT_AGENT_URL,
  DEFAULT_PRINTER_NAME,
  isSafariBrowser,
  isSupportedAgentPlatform,
  MACOS_PRINT_AGENT_DOWNLOAD_URL,
  PRINT_AGENT_DOWNLOAD_URL,
  printerList,
  selectDeliPrinter,
  type LocalPrinter
} from "../local-label-print";
import { renderFulfillmentLabels, type FulfillmentLabelInput, type FulfillmentLabelSheet } from "./fulfillment-label-raster";
import { t } from "@/i18n/runtime";

/**
 * Prints 60×40 mm labels on the store's Deli DL-720C, for one order or for a
 * whole morning's worth.
 *
 * Batch printing exists because the work is batched: a packer finishes thirty
 * parcels and then labels thirty parcels. Opening a dialog, detecting the
 * printer and pressing print thirty times is the same work done thirty times
 * over, and it is where labels get skipped.
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
    if (path === "/print/label") throw new Error(t("打印请求没有返回，可能已经出纸。请先看一眼打印机，不要直接重复打印。"));
    if (isSafariBrowser(navigator.userAgent)) throw new Error(t("Safari 连不上打印助手。请用 Chrome 打开作业台再打印。"));
    throw new Error(t("打印助手未连接。请先启动打印助手；浏览器询问本地网络访问时选择允许。"));
  }
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(body.message || body.error || t("打印助手返回错误。"));
  return body;
}

export function FulfillmentLabelPrinter({ labels, onClose }: { labels: FulfillmentLabelInput[]; onClose: () => void }) {
  const [printers, setPrinters] = useState<LocalPrinter[]>([]);
  const [printer, setPrinter] = useState(DEFAULT_PRINTER_NAME);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sheets, setSheets] = useState<Array<{ input: FulfillmentLabelInput; sheet: FulfillmentLabelSheet }>>([]);
  const multi = labels.length > 1;

  useEffect(() => {
    try {
      // Flattened, because the roll is flat: every sheet of every order comes
      // off the printer in this order, and the run has to be able to say which
      // parcel it stopped on.
      setSheets(labels.flatMap((input) => renderFulfillmentLabels(input).map((sheet) => ({ input, sheet }))));
      setError("");
    } catch (caught) {
      setSheets([]);
      setError((caught as Error).message);
    }
  }, [labels]);

  async function detect() {
    setBusy("detect");
    setReady(false);
    setError("");
    try {
      const health = await agentRequest("/health");
      if (!health.capabilities?.includes("online_saler_raster_v1")) {
        throw new Error(t("打印助手版本过旧。请关闭后下载并启动新版。"));
      }
      if (!isSupportedAgentPlatform(health.platform)) {
        throw new Error(t("请在连接 Deli DL-720C 的电脑上打开这个页面（Windows 或 Mac）。"));
      }
      const list = printerList((await agentRequest("/printers")).printers);
      setPrinters(list);
      const name = selectDeliPrinter(list, printer);
      if (!list.find((item) => item.name === name && item.available !== false)) {
        throw new Error(t("没有找到可用的 Deli DL-720C。请检查 USB、驱动、纸卷和打印队列。"));
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

  async function print(only?: { input: FulfillmentLabelInput; sheet: FulfillmentLabelSheet }) {
    if (!ready || busy || !sheets.length) return;
    const run = only ? [only] : sheets;
    setBusy("print");
    setError("");
    setNotice("");
    let sent = 0;
    let lastOrder = "";
    try {
      for (const entry of run) {
        const payload = buildFulfillmentLabelPayload({ ...entry.input, printerName: printer });
        payload.label_payload.raster = entry.sheet.raster;
        await agentRequest("/print/label", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        sent += 1;
        lastOrder = entry.input.orderNumber;
        setNotice(t("已发送 {sent}/{total} 张。", { sent, total: run.length }));
      }
      setNotice(t("{total} 张已全部发送。每单第 1 张贴在包裹上，其余随包裹带走。", { total: run.length }));
    } catch (caught) {
      // Naming the order it stopped on matters more than the sheet number: the
      // packer has to know which parcel to go back to.
      setError(t("已发送 {sent} 张后停止，最后印出的是 {order}。{message}", { sent, order: lastOrder || t("（没有一张印出）"), message: (caught as Error).message }));
    } finally {
      setBusy("");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
        <DialogTitle>{multi ? t("打印 {count} 单的面单", { count: labels.length }) : t("打印包裹面单")}</DialogTitle>
        <DialogDescription>
          {t("60×40 mm 不干胶 · Deli DL-720C · 每单连着打几张：路由、顾客、拣货清单")}
        </DialogDescription>

        <div className="flex flex-wrap items-center gap-3 rounded border bg-muted/30 p-3 text-sm">
          <strong>{printer}</strong>
          <span>{ready ? t("已连接") : t("未检测")}</span>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void detect()}>
            {busy === "detect" ? t("检测中…") : t("检测")}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={PRINT_AGENT_DOWNLOAD_URL} download="direct-loop-print-agent.zip">{t("下载打印助手（Windows）")}</a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={MACOS_PRINT_AGENT_DOWNLOAD_URL} download="direct-loop-print-agent-macos.zip">{t("下载打印助手（Mac）")}</a>
          </Button>
        </div>

        {sheets.length ? (
          <div className="grid gap-3 bg-muted/40 p-4 sm:grid-cols-2">
            {sheets.map((entry) => (
              <figure key={`${entry.input.packageCode}:${entry.sheet.index}`} className="m-0">
                <img
                  src={entry.sheet.preview}
                  width={480}
                  height={320}
                  className="h-auto w-full border bg-white"
                  alt={t("第 {index} 张，共 {total} 张", { index: entry.sheet.index, total: entry.sheet.total })}
                />
                <figcaption className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{multi ? `${entry.input.orderNumber} · ` : ""}{entry.sheet.index}/{entry.sheet.total} · {SHEET_LABEL[entry.sheet.kind]()}</span>
                  <button
                    type="button"
                    className="underline disabled:no-underline disabled:opacity-50"
                    disabled={!!busy || !ready}
                    onClick={() => void print(entry)}
                  >
                    {t("只打这一张")}
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="bg-amber-50 p-4 text-sm text-amber-900">
            {t("这些单还没有包裹号，所以还没有面单可打。包裹号是打包完成时生成的，而且要先指定履约点——没有目的地就没有路由贴纸。先去「每日打单配送」指定履约点，再打包。")}
          </p>
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
            {t("先启动打印助手，再点「检测」。和 ERP 共用一个助手，不要同时开两个。")}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button disabled={!!busy || !ready || !sheets.length} onClick={() => void print()}>
            {busy === "print" ? t("发送中…") : t("打印全部 {total} 张", { total: sheets.length })}
          </Button>
          <Button variant="outline" disabled={!!busy} onClick={onClose}>{t("关闭")}</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("每单第 1 张贴在包裹上，其余随包裹带走。每张都印着订单号和张数，掉了也能对回来。面单只是贴纸，重打多少次都不影响订单。")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
