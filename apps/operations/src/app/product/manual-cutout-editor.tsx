"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { EraserIcon, LoaderCircleIcon, PaintbrushIcon, RotateCcwIcon, SaveIcon, Undo2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Tool = "erase" | "restore";

export function ManualCutoutEditor(props: {
  open: boolean;
  originalUrl: string;
  cutoutUrl: string;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (image: Blob) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialImageRef = useRef<ImageData | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const drawingRef = useRef(false);
  const [tool, setTool] = useState<Tool>("erase");
  const [brushSize, setBrushSize] = useState(56);
  const [whitePreview, setWhitePreview] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [historyCount, setHistoryCount] = useState(0);

  useEffect(() => {
    if (!props.open || !props.originalUrl || !props.cutoutUrl) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([loadImage(props.originalUrl), loadImage(props.cutoutUrl)])
      .then(([original, cutout]) => {
        if (cancelled) return;
        const maximumSide = 1600;
        const scale = Math.min(1, maximumSide / Math.max(cutout.naturalWidth, cutout.naturalHeight));
        const width = Math.max(1, Math.round(cutout.naturalWidth * scale));
        const height = Math.max(1, Math.round(cutout.naturalHeight * scale));
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("浏览器无法打开图片编辑画布。");
        context.clearRect(0, 0, width, height);
        context.drawImage(cutout, 0, 0, width, height);

        const originalCanvas = document.createElement("canvas");
        originalCanvas.width = width;
        originalCanvas.height = height;
        const originalContext = originalCanvas.getContext("2d");
        if (!originalContext) throw new Error("浏览器无法读取原图。");
        originalContext.drawImage(original, 0, 0, width, height);
        originalCanvasRef.current = originalCanvas;
        initialImageRef.current = context.getImageData(0, 0, width, height);
        historyRef.current = [];
        setHistoryCount(0);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "无法打开修边工具。"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.cutoutUrl, props.open, props.originalUrl]);

  function startDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context || loading || props.saving) return;
    historyRef.current = [...historyRef.current.slice(-3), context.getImageData(0, 0, canvas.width, canvas.height)];
    setHistoryCount(historyRef.current.length);
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    paint(event);
  }

  function paint(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const radius = Math.max(3, (brushSize / rect.width) * canvas.width * 0.5);

    context.save();
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.clip();
    if (tool === "erase") {
      context.clearRect(x - radius, y - radius, radius * 2, radius * 2);
    } else if (originalCanvasRef.current) {
      context.globalCompositeOperation = "source-over";
      context.drawImage(originalCanvasRef.current, 0, 0);
    }
    context.restore();
  }

  function stopDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function undo() {
    const previous = historyRef.current.pop();
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!previous || !canvas || !context) return;
    context.putImageData(previous, 0, 0);
    setHistoryCount(historyRef.current.length);
  }

  function reset() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !initialImageRef.current) return;
    context.putImageData(initialImageRef.current, 0, 0);
    historyRef.current = [];
    setHistoryCount(0);
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setError("");
    const blob = await canvasBlob(canvas);
    if (!blob) {
      setError("无法导出修正版图片。");
      return;
    }
    try {
      await props.onSave(blob);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法保存修正版抠图。");
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(open) => !props.saving && props.onOpenChange(open)}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>手工修边</DialogTitle>
          <DialogDescription>擦掉残留的测量板和刻度；衣服被误删时切换“恢复衣服”。这里只修改透明边界，不重画商品。</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant={tool === "erase" ? "default" : "outline"} onClick={() => setTool("erase")}>
            <EraserIcon data-icon="inline-start" />擦除残留
          </Button>
          <Button type="button" size="sm" variant={tool === "restore" ? "default" : "outline"} onClick={() => setTool("restore")}>
            <PaintbrushIcon data-icon="inline-start" />恢复衣服
          </Button>
          <label className="flex min-w-48 flex-1 items-center gap-2 text-xs text-muted-foreground">
            笔刷
            <input className="min-w-24 flex-1" type="range" min="12" max="160" step="4" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
          </label>
          <Button type="button" size="sm" variant="outline" disabled={!historyCount} onClick={undo}><Undo2Icon data-icon="inline-start" />撤销</Button>
          <Button type="button" size="sm" variant="outline" onClick={reset}><RotateCcwIcon data-icon="inline-start" />重置</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setWhitePreview((value) => !value)}>{whitePreview ? "查看透明底" : "查看白底"}</Button>
        </div>

        <div className={cn("relative flex min-h-72 items-center justify-center overflow-hidden rounded-md border", whitePreview ? "bg-white" : "bg-muted")}>
          {loading ? <LoaderCircleIcon className="size-8 animate-spin text-muted-foreground" /> : null}
          <canvas
            ref={canvasRef}
            className={cn("max-h-[62vh] max-w-full touch-none object-contain", loading && "hidden")}
            onPointerDown={startDrawing}
            onPointerMove={paint}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            aria-label="抠图修边画布"
          />
        </div>
        <p className="text-xs text-muted-foreground">建议先用较大的笔刷擦除四周板尺，再放大检查袖口、领口和下摆。保存后系统会重新生成白底图和两版优化主图。</p>
        {error ? <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={props.saving} onClick={() => props.onOpenChange(false)}>取消</Button>
          <Button type="button" disabled={loading || props.saving} onClick={() => void save()}>
            {props.saving ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
            保存修正版
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片读取失败，请刷新页面后重试。"));
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
