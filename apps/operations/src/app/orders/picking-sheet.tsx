"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/i18n/runtime";
import { pickingSheetHtml, sortPickingLines, type PickingLine } from "./picking-sheet-print";

export { compareShelfCodes, pickingSheetHtml, sortPickingLines, type PickingLine } from "./picking-sheet-print";

/**
 * One sheet of paper that a picker carries round the racks.
 *
 * The orders are taken apart and the garments put back together in shelf order,
 * because a picker walks the racks once, not once per order. Picking straight
 * off the order list means walking A-01 → C-04 → A-01 again, and it is why a
 * thirty-order morning takes twice as long as it should.
 *
 * The destination travels with each line rather than heading a section: the
 * garments are sorted by where they are, not by where they are going, so two
 * consecutive lines can belong to different stores. Sorting has to happen once,
 * and it happens at the packing bench, from the destination printed on the line.
 */

/**
 * Prints through a hidden same-origin iframe rather than a new window: a popup
 * blocker cannot swallow it, and the app's own stylesheet cannot leak into it.
 */
export function PickingSheetDialog({ lines, onClose }: { lines: PickingLine[]; onClose: () => void }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [printedAt] = useState(() => new Date());
  const sorted = useMemo(() => sortPickingLines(lines), [lines]);
  const html = useMemo(() => pickingSheetHtml(sorted, printedAt), [sorted, printedAt]);
  const orderCount = useMemo(() => new Set(sorted.map((line) => line.orderNumber)).size, [sorted]);

  useEffect(() => {
    const frame = frameRef.current;
    const document_ = frame?.contentDocument;
    if (!document_) return;
    document_.open();
    document_.write(html);
    document_.close();
  }, [html]);

  function print() {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-4xl">
        <DialogTitle>{t("拣货单")}</DialogTitle>
        <DialogDescription>
          {t("{orders} 单 · {items} 件 · 按货架位排序。用普通打印机打 A4，或在打印对话框里选「另存为 PDF」。", { orders: orderCount, items: sorted.length })}
        </DialogDescription>
        <iframe ref={frameRef} title={t("拣货单预览")} className="h-[60vh] w-full rounded border bg-white" />
        <div className="flex flex-wrap gap-2">
          <Button onClick={print}><PrinterIcon data-icon="inline-start" />{t("打印")}</Button>
          <Button variant="outline" onClick={onClose}>{t("关闭")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
