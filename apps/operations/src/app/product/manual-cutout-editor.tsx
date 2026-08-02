"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  EraserIcon,
  LoaderCircleIcon,
  MousePointer2Icon,
  PaintbrushIcon,
  RotateCcwIcon,
  SaveIcon,
  ScissorsIcon,
  Undo2Icon
} from "lucide-react";

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

export type GuidedCutoutPoint = { x: number; y: number };
type EditorMode = "outline" | "refine";
type BrushTool = "erase" | "restore";

export function ManualCutoutEditor(props: {
  open: boolean;
  originalUrl: string;
  cutoutUrl: string;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onGuidedCutout: (points: GuidedCutoutPoint[]) => Promise<void>;
  onSave: (image: Blob) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const workingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialImageRef = useRef<ImageData | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const drawingRef = useRef(false);
  const [mode, setMode] = useState<EditorMode>("outline");
  const [tool, setTool] = useState<BrushTool>("erase");
  const [brushSize, setBrushSize] = useState(56);
  const [whitePreview, setWhitePreview] = useState(true);
  const [points, setPoints] = useState<GuidedCutoutPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [historyCount, setHistoryCount] = useState(0);

  const renderCanvas = useCallback((nextMode = mode, nextPoints = points) => {
    const canvas = canvasRef.current;
    const original = originalCanvasRef.current;
    const working = workingCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !original || !working) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(nextMode === "outline" ? original : working, 0, 0);
    if (nextMode !== "outline" || !nextPoints.length) return;

    context.save();
    context.lineWidth = Math.max(3, canvas.width / 350);
    context.strokeStyle = "#2563eb";
    context.fillStyle = "rgba(37, 99, 235, 0.10)";
    context.setLineDash([12, 8]);
    context.beginPath();
    nextPoints.forEach((point, index) => {
      const x = point.x * canvas.width;
      const y = point.y * canvas.height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    if (nextPoints.length >= 3) context.closePath();
    context.stroke();
    if (nextPoints.length >= 3) context.fill();
    context.setLineDash([]);
    nextPoints.forEach((point, index) => {
      const x = point.x * canvas.width;
      const y = point.y * canvas.height;
      context.beginPath();
      context.arc(x, y, Math.max(6, canvas.width / 180), 0, Math.PI * 2);
      context.fillStyle = index === 0 ? "#16a34a" : "#ffffff";
      context.fill();
      context.strokeStyle = index === 0 ? "#15803d" : "#2563eb";
      context.stroke();
    });
    context.restore();
  }, [mode, points]);

  useEffect(() => {
    if (!props.open || !props.originalUrl || !props.cutoutUrl) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setMode("outline");
    setPoints([]);
    Promise.all([loadImage(props.originalUrl), loadImage(props.cutoutUrl)])
      .then(([original, cutout]) => {
        if (cancelled) return;
        const maximumSide = 1600;
        const scale = Math.min(1, maximumSide / Math.max(original.naturalWidth, original.naturalHeight));
        const width = Math.max(1, Math.round(original.naturalWidth * scale));
        const height = Math.max(1, Math.round(original.naturalHeight * scale));
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = width;
        canvas.height = height;

        const originalCanvas = document.createElement("canvas");
        originalCanvas.width = width;
        originalCanvas.height = height;
        const originalContext = originalCanvas.getContext("2d");
        if (!originalContext) throw new Error("浏览器无法读取原图。");
        originalContext.drawImage(original, 0, 0, width, height);
        originalCanvasRef.current = originalCanvas;

        const workingCanvas = document.createElement("canvas");
        workingCanvas.width = width;
        workingCanvas.height = height;
        const workingContext = workingCanvas.getContext("2d", { willReadFrequently: true });
        if (!workingContext) throw new Error("浏览器无法打开图片编辑画布。");
        workingContext.clearRect(0, 0, width, height);
        workingContext.drawImage(cutout, 0, 0, width, height);
        workingCanvasRef.current = workingCanvas;
        initialImageRef.current = workingContext.getImageData(0, 0, width, height);
        historyRef.current = [];
        setHistoryCount(0);

        const displayContext = canvas.getContext("2d");
        displayContext?.clearRect(0, 0, width, height);
        displayContext?.drawImage(originalCanvas, 0, 0);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "无法打开修边工具。"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.cutoutUrl, props.open, props.originalUrl]);

  useEffect(() => {
    if (!loading) renderCanvas();
  }, [loading, mode, points, renderCanvas, whitePreview]);

  function addOutlinePoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (mode !== "outline" || loading || props.saving || points.length >= 60) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height)
    };
    setPoints((current) => [...current, point]);
    setError("");
  }

  function startDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (mode === "outline") {
      addOutlinePoint(event);
      return;
    }
    const working = workingCanvasRef.current;
    const context = working?.getContext("2d", { willReadFrequently: true });
    if (!working || !context || loading || props.saving) return;
    historyRef.current = [...historyRef.current.slice(-3), context.getImageData(0, 0, working.width, working.height)];
    setHistoryCount(historyRef.current.length);
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    paint(event);
  }

  function paint(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || mode !== "refine") return;
    const display = canvasRef.current;
    const working = workingCanvasRef.current;
    const context = working?.getContext("2d");
    if (!display || !working || !context) return;
    const rect = display.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * working.width;
    const y = ((event.clientY - rect.top) / rect.height) * working.height;
    const radius = Math.max(3, (brushSize / rect.width) * working.width * 0.5);

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
    renderCanvas("refine", points);
  }

  function stopDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function undo() {
    if (mode === "outline") {
      setPoints((current) => current.slice(0, -1));
      return;
    }
    const previous = historyRef.current.pop();
    const working = workingCanvasRef.current;
    const context = working?.getContext("2d");
    if (!previous || !working || !context) return;
    context.putImageData(previous, 0, 0);
    setHistoryCount(historyRef.current.length);
    renderCanvas("refine", points);
  }

  function reset() {
    if (mode === "outline") {
      setPoints([]);
      return;
    }
    const working = workingCanvasRef.current;
    const context = working?.getContext("2d");
    if (!working || !context || !initialImageRef.current) return;
    context.putImageData(initialImageRef.current, 0, 0);
    historyRef.current = [];
    setHistoryCount(0);
    renderCanvas("refine", points);
  }

  async function runGuidedCutout() {
    if (points.length < 6) {
      setError("请沿衣服外轮廓至少点击 6 个点，建议点击肩部、袖口和下摆转角。");
      return;
    }
    setError("");
    try {
      await props.onGuidedCutout(points);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "按轮廓自动抠图失败，请调整轮廓后重试。");
    }
  }

  async function save() {
    const working = workingCanvasRef.current;
    if (!working) return;
    setError("");
    const blob = await canvasBlob(working);
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
          <DialogTitle>手动抠图</DialogTitle>
          <DialogDescription>默认在原图上沿衣服外轮廓依次点选，系统会在轮廓内自动识别衣服。只调整透明边界，不生成或重画商品。</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant={mode === "outline" ? "default" : "outline"} onClick={() => setMode("outline")}>
            <MousePointer2Icon data-icon="inline-start" />点选轮廓
          </Button>
          <Button type="button" size="sm" variant={mode === "refine" ? "default" : "outline"} onClick={() => setMode("refine")}>
            <PaintbrushIcon data-icon="inline-start" />边缘细修
          </Button>
          {mode === "outline" ? (
            <span className="text-xs text-muted-foreground">已选 {points.length} 个点，建议 8–16 个</span>
          ) : (
            <>
              <Button type="button" size="sm" variant={tool === "erase" ? "default" : "outline"} onClick={() => setTool("erase")}>
                <EraserIcon data-icon="inline-start" />擦除残留
              </Button>
              <Button type="button" size="sm" variant={tool === "restore" ? "default" : "outline"} onClick={() => setTool("restore")}>
                <PaintbrushIcon data-icon="inline-start" />恢复衣服
              </Button>
              <label className="flex min-w-44 flex-1 items-center gap-2 text-xs text-muted-foreground">
                笔刷
                <input className="min-w-24 flex-1" type="range" min="12" max="160" step="4" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
              </label>
            </>
          )}
          <Button type="button" size="sm" variant="outline" disabled={mode === "outline" ? !points.length : !historyCount} onClick={undo}><Undo2Icon data-icon="inline-start" />撤销</Button>
          <Button type="button" size="sm" variant="outline" onClick={reset}><RotateCcwIcon data-icon="inline-start" />重置</Button>
          {mode === "refine" ? <Button type="button" size="sm" variant="outline" onClick={() => setWhitePreview((value) => !value)}>{whitePreview ? "查看透明底" : "查看白底"}</Button> : null}
        </div>

        <div className={cn("relative flex min-h-72 items-center justify-center overflow-hidden rounded-md border", mode === "refine" && !whitePreview ? "bg-muted" : "bg-white")}>
          {loading ? <LoaderCircleIcon className="size-8 animate-spin text-muted-foreground" /> : null}
          <canvas
            ref={canvasRef}
            className={cn("max-h-[62vh] max-w-full touch-none object-contain", mode === "outline" ? "cursor-crosshair" : "cursor-cell", loading && "hidden")}
            onPointerDown={startDrawing}
            onPointerMove={paint}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            aria-label={mode === "outline" ? "衣服轮廓点选画布" : "抠图修边画布"}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {mode === "outline"
            ? "沿衣服外边缘顺时针点击：领口或帽子、两侧肩部、袖口、下摆转角。蓝色区域应只包住衣服，不要包住四周刻度尺。"
            : "自动抠图后仍有少量残留时，用擦除或恢复笔刷细修。保存后会重新生成白底图和两版优化主图。"}
        </p>
        {error ? <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={props.saving} onClick={() => props.onOpenChange(false)}>取消</Button>
          {mode === "outline" ? (
            <Button type="button" disabled={loading || props.saving || points.length < 6} onClick={() => void runGuidedCutout()}>
              {props.saving ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <ScissorsIcon data-icon="inline-start" />}
              按轮廓自动抠图
            </Button>
          ) : (
            <Button type="button" disabled={loading || props.saving} onClick={() => void save()}>
              {props.saving ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
              保存细修版
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
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
