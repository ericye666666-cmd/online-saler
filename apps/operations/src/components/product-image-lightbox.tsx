"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon, ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { t } from "@/i18n/runtime";

/**
 * A product thumbnail that opens the full photo on top of the page.
 *
 * Clicking the small picture shows it as large as the screen allows, with the
 * title and barcode underneath. A garment with several photos gets left and
 * right arrows (and the arrow keys). The backdrop, Esc and the X close it; the
 * list underneath stays exactly where it was.
 */
export function ZoomableProductImage(props: {
  /** Every photo, the one on the thumbnail first. Empty means nothing to enlarge. */
  images: string[];
  title: string;
  barcode?: string | null;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const images = props.images.filter(Boolean);
  if (!images.length) return <div className={props.className}>{props.children}</div>;

  return (
    <>
      <button
        type="button"
        className={cn("cursor-zoom-in focus-visible:outline-2 focus-visible:outline-ring", props.className)}
        aria-label={t("查看大图")}
        title={t("查看大图")}
        onClick={() => { setIndex(0); setOpen(true); }}
      >
        {props.children}
      </button>
      <ProductImageLightbox
        open={open}
        onOpenChange={setOpen}
        images={images}
        index={index}
        onIndexChange={setIndex}
        title={props.title}
        barcode={props.barcode}
      />
    </>
  );
}

export function ProductImageLightbox(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: string[];
  index: number;
  onIndexChange: (index: number) => void;
  title: string;
  barcode?: string | null;
}) {
  const { images, index, onIndexChange } = props;
  const count = images.length;
  const current = Math.min(Math.max(0, index), Math.max(0, count - 1));
  const [failed, setFailed] = useState<string | null>(null);
  const src = images[current] ?? "";
  const step = (delta: number) => { if (count > 1) onIndexChange((current + delta + count) % count); };

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        className="flex max-h-[96dvh] w-[calc(100vw-1rem)] max-w-none flex-col gap-3 p-3 sm:max-w-[min(96vw,1100px)] sm:p-4"
        onKeyDown={onKeyDown}
      >
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {src && failed !== src ? (
            <img
              key={src}
              src={src}
              alt={props.title}
              decoding="async"
              className="max-h-[calc(96dvh-9rem)] w-auto max-w-full object-contain"
              onError={() => setFailed(src)}
            />
          ) : (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
              <ImageIcon className="size-8" />
              {t("图片缺失")}
            </div>
          )}
          {count > 1 ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full shadow"
                aria-label={t("上一张")}
                onClick={() => step(-1)}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full shadow"
                aria-label={t("下一张")}
                onClick={() => step(1)}
              >
                <ChevronRightIcon />
              </Button>
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pr-8">
          <div className="min-w-0">
            <DialogTitle className="break-words leading-snug">{props.title}</DialogTitle>
            <DialogDescription className="font-mono">{props.barcode || t("无条码")}</DialogDescription>
          </div>
          {count > 1 ? <span className="text-muted-foreground text-sm">{current + 1} / {count}</span> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
