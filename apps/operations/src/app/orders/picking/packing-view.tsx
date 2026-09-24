"use client";

import { useState } from "react";
import { BoxIcon, PackageCheckIcon, PrinterIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { t } from "@/i18n/runtime";
import type { PackOrder } from "./picking-types";

/**
 * Sorting the trolley back into parcels.
 *
 * Picking is walked in shelf order across every order, which is what stops a
 * picker crossing the same aisle five times — but it means the trolley comes
 * back mixed, and nothing so far has said which garments belong in one bag.
 * This is that step: one card is one parcel, and the card carries the photos and
 * barcodes needed to find its garments among the rest of the trolley.
 *
 * It is on the phone because the same person does both. Sending them back to a
 * desk to answer "what goes together" is the point at which the trolley gets
 * guessed at.
 */

const PACKAGING = [
  ["BAG", "袋 Bag"],
  ["BOX", "箱 Box"],
  ["OTHER", "其他 Other"]
] as const;

export function PackingView({ orders, busy, onStart, onComplete, onLabel }: {
  orders: PackOrder[];
  busy: boolean;
  onStart: (order: PackOrder) => Promise<void>;
  onComplete: (order: PackOrder, packagingMethod: string, packageCount: number) => Promise<void>;
  onLabel: (order: PackOrder) => void;
}) {
  const toPack = orders.filter((order) => order.fulfillment?.status === "READY_TO_PACK");
  const packed = orders.filter((order) => order.fulfillment?.status === "PACKED");

  if (!toPack.length && !packed.length) {
    return (
      <div className="rounded-xl border p-6 text-center">
        <PackageCheckIcon className="mx-auto size-10 text-muted-foreground" />
        <p className="mt-2 font-medium text-lg">{t("没有分给你的包")}</p>
        {/* Packing is handed out, not taken. A packer staring at an empty screen
            while trolleys pile up behind them needs to know that is correct and
            who unblocks it. */}
        <p className="text-muted-foreground text-sm">{t("主管把拣好的车分给你之后，它才会出现在这里。手边有货但这里是空的，就去找主管分配。")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {toPack.map((order) => <PackCard key={order.id} order={order} busy={busy} onStart={onStart} onComplete={onComplete} />)}

      {packed.length ? (
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold text-sm text-muted-foreground">{t("已打包 · 等着贴面单")}</h2>
          {packed.map((order) => (
            <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
              <div>
                <p className="font-mono font-semibold">{order.fulfillment?.packageCode ?? t("未生成包裹号")}</p>
                <p className="text-muted-foreground text-sm">{order.orderNumber} · {t("{count} 件", { count: order.items.length })}</p>
              </div>
              {order.fulfillment?.packageCode ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onLabel(order)}>
                  <PrinterIcon data-icon="inline-start" />{t("打面单")}
                </Button>
              ) : (
                // No destination, no routing sticker. Saying so here beats a
                // print dialog that opens and then cannot print anything.
                <span className="text-destructive text-xs">{t("没有履约点，打不出面单")}</span>
              )}
            </div>
          ))}
          <p className="text-muted-foreground text-xs">
            {t("面单要在连着 Deli 打印机的那台 Windows 电脑上打。人在货架旁边的话，先都打包完，回去在「每日打单配送」里一次全部打出来。")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function PackCard({ order, busy, onStart, onComplete }: {
  order: PackOrder;
  busy: boolean;
  onStart: (order: PackOrder) => Promise<void>;
  onComplete: (order: PackOrder, packagingMethod: string, packageCount: number) => Promise<void>;
}) {
  const [packagingMethod, setPackagingMethod] = useState("BAG");
  const [packageCount, setPackageCount] = useState("1");
  const started = Boolean(order.fulfillment?.packingStartedAt);

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-lg">{order.destination}</p>
          <p className="font-mono text-muted-foreground text-sm">{order.orderNumber}</p>
        </div>
        <Badge variant="secondary">{t("{count} 件装一起", { count: order.items.length })}</Badge>
      </div>

      {/* Photos and barcodes, because the garments are somewhere in a mixed
          trolley and the order number alone will not find them. */}
      <div className="flex flex-col gap-2">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 rounded-lg border p-2">
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.title} className="size-16 shrink-0 rounded border bg-white object-contain" />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded border bg-muted text-muted-foreground text-xs">{t("无图")}</div>
            )}
            <div className="min-w-0">
              <p className="truncate font-medium">{item.title}</p>
              <p className="text-muted-foreground text-sm">
                {item.sizeLabel ? <>{item.sizeLabel} · </> : null}
                <span className="font-mono">{item.barcode || t("条码缺失")}</span>
              </p>
            </div>
          </div>
        ))}
      </div>

      {started ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <NativeSelect className="h-12 flex-1" value={packagingMethod} onChange={(event) => setPackagingMethod(event.target.value)}>
              {PACKAGING.map(([value, label]) => <NativeSelectOption key={value} value={value}>{t(label)}</NativeSelectOption>)}
            </NativeSelect>
            <Input
              className="h-12 w-24 text-center"
              inputMode="numeric"
              value={packageCount}
              onChange={(event) => setPackageCount(event.target.value.replace(/\D/g, "").slice(0, 2))}
              aria-label={t("包裹数量")}
            />
          </div>
          <Button
            className="h-12"
            disabled={busy || !Number(packageCount)}
            onClick={() => void onComplete(order, packagingMethod, Number(packageCount) || 1)}
          >
            <PackageCheckIcon data-icon="inline-start" />{t("完成打包")}
          </Button>
          <p className="text-muted-foreground text-xs">{t("一单装成两个包就填 2。完成后会生成包裹号，门店签收时扫的就是它。")}</p>
        </div>
      ) : (
        <Button className="h-12" disabled={busy} onClick={() => void onStart(order)}>
          <BoxIcon data-icon="inline-start" />{t("开始打包这一单")}
        </Button>
      )}
    </div>
  );
}
