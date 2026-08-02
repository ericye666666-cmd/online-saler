"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CheckIcon, MousePointer2Icon, RotateCcwIcon, Undo2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  createManualMeasurementLine,
  measurementPointFromClient,
  upsertManualMeasurementLine,
  type ManualMeasurementLine,
  type MeasurementPoint
} from "./manual-measurement-lines";

type EditableMeasurement = {
  key: string;
  label: string;
  value: string;
  aiValue?: string;
};

export function ManualMeasurementEditor(props: {
  open: boolean;
  imageUrl: string;
  imageId: string;
  measurements: EditableMeasurement[];
  initialLines: ManualMeasurementLine[];
  onOpenChange: (open: boolean) => void;
  onApply: (lines: ManualMeasurementLine[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeKey, setActiveKey] = useState("");
  const [lines, setLines] = useState<ManualMeasurementLine[]>([]);
  const [start, setStart] = useState<MeasurementPoint | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeMeasurement = props.measurements.find((item) => item.key === activeKey) ?? props.measurements[0];
  const activeLine = lines.find((line) => line.key === activeMeasurement?.key);
  const labels = useMemo(
    () => new Map(props.measurements.map((measurement) => [measurement.key, measurement.label])),
    [props.measurements]
  );

  useEffect(() => {
    if (!props.open) return;
    const nextKey = props.measurements[0]?.key ?? "";
    setActiveKey(nextKey);
    setLines(props.initialLines);
    setStart(null);
    setError("");
    setValues(Object.fromEntries(props.measurements.map((item) => [
      item.key,
      props.initialLines.find((line) => line.key === item.key)?.valueCm || item.value || item.aiValue || ""
    ])));
  }, [props.initialLines, props.measurements, props.open]);

  useEffect(() => {
    if (!props.open || !props.imageUrl) return;
    let cancelled = false;
    setLoading(true);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      const maximumSide = 1600;
      const scale = Math.min(1, maximumSide / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const source = document.createElement("canvas");
      source.width = width;
      source.height = height;
      source.getContext("2d")?.drawImage(image, 0, 0, width, height);
      imageCanvasRef.current = source;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = width;
        canvas.height = height;
      }
      setLoading(false);
    };
    image.onerror = () => {
      if (!cancelled) {
        setLoading(false);
        setError("无法读取测量板原图，请刷新页面后重试。");
      }
    };
    image.src = props.imageUrl;
    return () => { cancelled = true; };
  }, [props.imageUrl, props.open]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const source = imageCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !source || !context || loading) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0);
    for (const line of lines) drawLine(context, canvas, line, labels.get(line.key) ?? line.key, line.key === activeMeasurement?.key);
    if (start) drawStart(context, canvas, start);
  }, [activeMeasurement?.key, labels, lines, loading, start]);

  function selectMeasurement(key: string) {
    setActiveKey(key);
    setStart(null);
    setError("");
  }

  function addPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!activeMeasurement || loading) return;
    const point = measurementPointFromClient(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    if (!start) {
      setStart(point);
      setError("");
      return;
    }
    const valueCm = values[activeMeasurement.key]?.trim() ?? "";
    const line = createManualMeasurementLine({
      key: activeMeasurement.key,
      start,
      end: point,
      valueCm,
      imageId: props.imageId
    });
    setLines((current) => upsertManualMeasurementLine(current, line));
    setStart(null);
    setError("");
  }

  function updateValue(value: string) {
    if (!activeMeasurement) return;
    setValues((current) => ({ ...current, [activeMeasurement.key]: value }));
    setLines((current) => current.map((line) => line.key === activeMeasurement.key ? { ...line, valueCm: value } : line));
  }

  function redrawActive() {
    if (!activeMeasurement) return;
    setLines((current) => current.filter((line) => line.key !== activeMeasurement.key));
    setStart(null);
    setError("");
  }

  function apply() {
    const invalid = lines.find((line) => !Number.isFinite(Number(line.valueCm)) || Number(line.valueCm) <= 0);
    if (invalid) {
      setActiveKey(invalid.key);
      setError(`${labels.get(invalid.key) ?? "该尺寸"}需要填写大于 0 的厘米值。`);
      return;
    }
    if (!lines.length) {
      setError("请至少选择一个尺寸并在原图上连接起点和终点。");
      return;
    }
    props.onApply(lines);
    props.onOpenChange(false);
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-1rem)] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>手动连线校准尺寸</DialogTitle>
          <DialogDescription>选择一个尺寸，在测量板原图上依次点击起点和终点，再确认厘米值。人工结果会保存，AI原始值不会被覆盖。</DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="relative flex min-h-72 items-center justify-center overflow-hidden rounded-md border bg-white">
            {loading ? <span className="text-sm text-muted-foreground">正在读取原图...</span> : null}
            <canvas
              ref={canvasRef}
              className={cn("max-h-[65vh] max-w-full touch-none cursor-crosshair object-contain", loading && "hidden")}
              onPointerDown={addPoint}
              aria-label="手动尺寸连线画布"
            />
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {props.measurements.map((measurement) => {
                const completed = lines.some((line) => line.key === measurement.key);
                return (
                  <Button
                    key={measurement.key}
                    type="button"
                    variant={activeMeasurement?.key === measurement.key ? "default" : "outline"}
                    className="justify-between"
                    onClick={() => selectMeasurement(measurement.key)}
                  >
                    <span>{measurement.label}</span>
                    {completed ? <CheckIcon className="size-4" /> : null}
                  </Button>
                );
              })}
            </div>

            {activeMeasurement ? (
              <div className="space-y-3 rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">{activeMeasurement.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {activeLine ? "已连线，可重画或修改数值。" : start ? "已选起点，请点击终点。" : "请先点击起点，再点击终点。"}
                  </p>
                </div>
                <label className="block space-y-1 text-sm">
                  <span>确认尺寸（cm）</span>
                  <Input inputMode="decimal" value={values[activeMeasurement.key] ?? ""} onChange={(event) => updateValue(event.target.value)} />
                </label>
                {activeMeasurement.aiValue ? <p className="text-xs text-muted-foreground">AI 原值：{activeMeasurement.aiValue} cm</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={!start} onClick={() => setStart(null)}><Undo2Icon data-icon="inline-start" />撤销起点</Button>
                  <Button type="button" size="sm" variant="outline" disabled={!activeLine && !start} onClick={redrawActive}><RotateCcwIcon data-icon="inline-start" />重画本项</Button>
                </div>
              </div>
            ) : null}

            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground"><MousePointer2Icon className="mr-1 inline size-3.5" />连线规则</p>
              <p className="mt-1">胸宽、肩宽、腰宽等横向连接两侧端点；衣长、裤长纵向连接起止点；袖长从肩点连接到袖口。</p>
            </div>
            {error ? <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>取消</Button>
          <Button type="button" onClick={apply}><CheckIcon data-icon="inline-start" />应用人工连线</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function drawLine(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  line: ManualMeasurementLine,
  label: string,
  active: boolean
) {
  const x1 = line.x1 / 100 * canvas.width;
  const y1 = line.y1 / 100 * canvas.height;
  const x2 = line.x2 / 100 * canvas.width;
  const y2 = line.y2 / 100 * canvas.height;
  context.save();
  context.strokeStyle = active ? "#1d4ed8" : "#64748b";
  context.fillStyle = "#ffffff";
  context.lineWidth = Math.max(3, canvas.width / 420);
  context.setLineDash([12, 8]);
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
  context.setLineDash([]);
  for (const [x, y] of [[x1, y1], [x2, y2]]) {
    context.beginPath();
    context.arc(x, y, Math.max(6, canvas.width / 180), 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  const text = `${label} ${line.valueCm || "?"} cm`;
  context.font = `700 ${Math.max(15, canvas.width / 55)}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "bottom";
  context.lineWidth = Math.max(4, canvas.width / 250);
  context.strokeStyle = "#ffffff";
  context.strokeText(text, (x1 + x2) / 2, (y1 + y2) / 2 - 8);
  context.fillStyle = active ? "#1e3a8a" : "#334155";
  context.fillText(text, (x1 + x2) / 2, (y1 + y2) / 2 - 8);
  context.restore();
}

function drawStart(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, point: MeasurementPoint) {
  context.save();
  context.beginPath();
  context.arc(point.x / 100 * canvas.width, point.y / 100 * canvas.height, Math.max(7, canvas.width / 170), 0, Math.PI * 2);
  context.fillStyle = "#16a34a";
  context.fill();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 3;
  context.stroke();
  context.restore();
}
