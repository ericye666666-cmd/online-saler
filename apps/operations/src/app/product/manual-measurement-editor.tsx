"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CheckIcon, MousePointer2Icon, RotateCcwIcon, ScanLineIcon, Undo2Icon } from "lucide-react";

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
  manualMeasurementLineIssue,
  measurementLengthCm,
  measurementPointFromClient,
  upsertManualMeasurementLine,
  validMeasurementBoardCalibration,
  type MeasurementBoardCalibration,
  type ManualMeasurementLine,
  type MeasurementPoint
} from "./manual-measurement-lines";

const BOARD_CALIBRATION_STORAGE_KEY = "operations.product.measurement-board-calibration.v1";
const BOARD_CORNER_LABELS = ["左上角", "右上角", "右下角", "左下角"] as const;

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
  initialAiLines?: ManualMeasurementLine[];
  initialBoardCalibration?: MeasurementBoardCalibration | null;
  onOpenChange: (open: boolean) => void;
  onApply: (manualLines: ManualMeasurementLine[], resolvedLines: ManualMeasurementLine[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeKey, setActiveKey] = useState("");
  const [lines, setLines] = useState<ManualMeasurementLine[]>([]);
  const [start, setStart] = useState<MeasurementPoint | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [boardCalibration, setBoardCalibration] = useState<MeasurementBoardCalibration | null>(null);
  const [boardCalibrationSource, setBoardCalibrationSource] = useState<"AI" | "SAVED" | "MANUAL" | null>(null);
  const [calibrationPoints, setCalibrationPoints] = useState<MeasurementPoint[]>([]);
  const [calibratingBoard, setCalibratingBoard] = useState(false);
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
    const manualLines = props.initialLines.map((line) => ({ ...line, source: "MANUAL" as const }));
    const manualKeys = new Set(manualLines.map((line) => line.key));
    const mergedLines = [
      ...(props.initialAiLines ?? []).filter((line) => !manualKeys.has(line.key)).map((line) => ({ ...line, source: "AI" as const })),
      ...manualLines
    ];
    setActiveKey(nextKey);
    setLines(mergedLines);
    setStart(null);
    setCalibrationPoints([]);
    setError("");
    setValues(Object.fromEntries(props.measurements.map((item) => [
      item.key,
      mergedLines.find((line) => line.key === item.key)?.valueCm || item.value || item.aiValue || ""
    ])));
  }, [props.initialAiLines, props.initialLines, props.measurements, props.open]);

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
      const aiCalibration = props.initialBoardCalibration && validMeasurementBoardCalibration(props.initialBoardCalibration)
        ? props.initialBoardCalibration
        : null;
      const savedCalibration = aiCalibration ? null : readSavedBoardCalibration(width / height);
      setBoardCalibration(aiCalibration ?? savedCalibration);
      setBoardCalibrationSource(aiCalibration ? "AI" : savedCalibration ? "SAVED" : null);
      setCalibratingBoard(!aiCalibration && !savedCalibration);
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
  }, [props.imageUrl, props.initialBoardCalibration, props.open]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const source = imageCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !source || !context || loading) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0);
    if (boardCalibration) drawBoardCalibration(context, canvas, boardCalibration);
    if (calibratingBoard && calibrationPoints.length) drawCalibrationProgress(context, canvas, calibrationPoints);
    if (!calibratingBoard) {
      for (const line of lines) drawLine(context, canvas, line, labels.get(line.key) ?? line.key, line.key === activeMeasurement?.key);
      if (start) drawStart(context, canvas, start);
    }
  }, [activeMeasurement?.key, boardCalibration, calibratingBoard, calibrationPoints, labels, lines, loading, start]);

  useEffect(() => {
    if (!boardCalibration || !props.open) return;
    setLines((current) => {
      const recalculated = recalculateLines(current, boardCalibration);
      setValues((currentValues) => ({
        ...currentValues,
        ...Object.fromEntries(recalculated.map((line) => [line.key, line.valueCm]))
      }));
      return recalculated;
    });
  }, [boardCalibration, props.open]);

  function selectMeasurement(key: string) {
    setActiveKey(key);
    setStart(null);
    setError("");
  }

  function addPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (loading) return;
    const point = measurementPointFromClient(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    if (calibratingBoard) {
      addBoardCalibrationPoint(point);
      return;
    }
    if (!activeMeasurement) return;
    if (!boardCalibration) {
      setError("请先校准测量板四角，再连接衣服尺寸。");
      return;
    }
    if (!start) {
      setStart(point);
      setError("");
      return;
    }
    const lineIssue = manualMeasurementLineIssue(activeMeasurement.key, boardCalibration, start, point);
    if (lineIssue) {
      setError(lineIssue);
      setStart(null);
      return;
    }
    const measuredValue = measurementLengthCm(boardCalibration, start, point);
    if (measuredValue === null) {
      setError("无法根据测量板计算这条线，请重新校准板面后再试。");
      setStart(null);
      return;
    }
    const valueCm = formatCentimeters(measuredValue);
    const line = createManualMeasurementLine({
      key: activeMeasurement.key,
      start,
      end: point,
      valueCm,
      imageId: props.imageId
    });
    setValues((current) => ({ ...current, [activeMeasurement.key]: valueCm }));
    setLines((current) => upsertManualMeasurementLine(current, line));
    setStart(null);
    setError("");
  }

  function addBoardCalibrationPoint(point: MeasurementPoint) {
    const nextPoints = [...calibrationPoints, point];
    if (nextPoints.length < 4) {
      setCalibrationPoints(nextPoints);
      setError("");
      return;
    }
    const calibration = calibrationFromPoints(nextPoints);
    if (!validMeasurementBoardCalibration(calibration)) {
      setCalibrationPoints([]);
      setError("板面四角无效，请按左上、右上、右下、左下的顺序重新点击。");
      return;
    }
    setBoardCalibration(calibration);
    setBoardCalibrationSource("MANUAL");
    setCalibrationPoints([]);
    setCalibratingBoard(false);
    setStart(null);
    setError("");
    const source = imageCanvasRef.current;
    if (source) saveBoardCalibration(calibration, source.width / source.height);
  }

  function beginBoardCalibration() {
    setCalibratingBoard(true);
    setCalibrationPoints([]);
    setStart(null);
    setError("");
  }

  function updateValue(value: string) {
    if (!activeMeasurement) return;
    setValues((current) => ({ ...current, [activeMeasurement.key]: value }));
    setLines((current) => current.map((line) => line.key === activeMeasurement.key
      ? { ...line, valueCm: value, source: "MANUAL" }
      : line));
  }

  function redrawActive() {
    if (!activeMeasurement) return;
    setLines((current) => current.filter((line) => line.key !== activeMeasurement.key));
    setStart(null);
    setError("");
  }

  function apply() {
    if (!boardCalibration || calibratingBoard) {
      setError("请先完成测量板四角校准。");
      return;
    }
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
    props.onApply(lines.filter((line) => line.source !== "AI"), lines);
    props.onOpenChange(false);
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-1rem)] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>手动连线校准尺寸</DialogTitle>
          <DialogDescription>AI先找测量板四角和服装测量点，系统按 120 × 160 cm 板面校正透视并换算厘米。员工只需调整错误点位；AI原始点不会被覆盖。</DialogDescription>
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
            <div className={cn("space-y-2 rounded-md border p-3", calibratingBoard ? "border-amber-400 bg-amber-50" : "border-emerald-300 bg-emerald-50/60")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">测量板透视校准</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {calibratingBoard
                      ? `请点击${BOARD_CORNER_LABELS[calibrationPoints.length] ?? "四角"}（${Math.min(calibrationPoints.length + 1, 4)}/4）。`
                      : boardCalibrationSource === "AI"
                        ? "AI 已找到四个板面校准点，请检查绿色边框；不准时点击重新校准。"
                        : boardCalibrationSource === "MANUAL"
                          ? "已使用本次人工校准的四个板角建立坐标。"
                          : "已按固定机位保存的板角建立坐标；不准时点击重新校准。"}
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={beginBoardCalibration}>
                  <ScanLineIcon data-icon="inline-start" />{boardCalibration ? "重新校准" : "校准板面"}
                </Button>
              </div>
              {calibratingBoard && calibrationPoints.length ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => setCalibrationPoints((current) => current.slice(0, -1))}>
                  <Undo2Icon data-icon="inline-start" />撤销上一个板角
                </Button>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {props.measurements.map((measurement) => {
                const completed = lines.some((line) => line.key === measurement.key);
                return (
                  <Button
                    key={measurement.key}
                    type="button"
                    variant={activeMeasurement?.key === measurement.key ? "default" : "outline"}
                    className="justify-between"
                    disabled={calibratingBoard || !boardCalibration}
                    onClick={() => selectMeasurement(measurement.key)}
                  >
                    <span>{measurement.label}</span>
                    {completed ? <CheckIcon className="size-4" /> : null}
                  </Button>
                );
              })}
            </div>

            {activeMeasurement && !calibratingBoard ? (
              <div className="space-y-3 rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">{activeMeasurement.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {activeLine?.source === "AI"
                      ? "AI 已先定位起点和终点；不准时点击重画本项。"
                      : activeLine
                        ? "已按人工点位和板面坐标换算，可重画或修正数值。"
                        : start ? "已选起点，请点击终点。" : "请先点击起点，再点击终点。"}
                  </p>
                  {activeMeasurement.key === "shoulderWidthCm" ? (
                    <p className="mt-1 text-xs font-medium text-amber-700">从左侧肩袖接缝连接到右侧肩袖接缝；不要从领口开始。</p>
                  ) : null}
                </div>
                <label className="block space-y-1 text-sm">
                  <span>测量板换算（cm）</span>
                  <Input inputMode="decimal" value={values[activeMeasurement.key] ?? ""} onChange={(event) => updateValue(event.target.value)} />
                </label>
                  {activeMeasurement.aiValue ? <p className="text-xs text-muted-foreground">AI 原值：{activeMeasurement.aiValue} cm{activeLine?.source === "AI" ? " · AI点位" : ""}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={!start} onClick={() => setStart(null)}><Undo2Icon data-icon="inline-start" />撤销起点</Button>
                  <Button type="button" size="sm" variant="outline" disabled={!activeLine && !start} onClick={redrawActive}><RotateCcwIcon data-icon="inline-start" />重画本项</Button>
                </div>
              </div>
            ) : null}

            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground"><MousePointer2Icon className="mr-1 inline size-3.5" />连线规则</p>
              <p className="mt-1">肩宽必须连接左右肩缝端点，不是领口到单侧肩；胸宽、腰宽连接两侧端点；衣长纵向连接起止点；袖长从肩缝连接到袖口。</p>
            </div>
            {error ? <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>取消</Button>
          <Button type="button" disabled={!boardCalibration || calibratingBoard} onClick={apply}><CheckIcon data-icon="inline-start" />应用人工连线</Button>
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
  const lineColor = line.source === "AI" ? "#2563eb" : "#15803d";
  context.save();
  context.strokeStyle = lineColor;
  context.fillStyle = "#ffffff";
  context.lineWidth = Math.max(active ? 4 : 3, canvas.width / (active ? 360 : 420));
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
  context.fillStyle = line.source === "AI" ? "#1e3a8a" : "#166534";
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

function calibrationFromPoints(points: MeasurementPoint[]): MeasurementBoardCalibration {
  return {
    topLeft: points[0]!,
    topRight: points[1]!,
    bottomRight: points[2]!,
    bottomLeft: points[3]!
  };
}

function readSavedBoardCalibration(aspectRatio: number): MeasurementBoardCalibration | null {
  try {
    const raw = window.localStorage.getItem(BOARD_CALIBRATION_STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as {
      aspectRatio?: number;
      calibration?: MeasurementBoardCalibration;
    };
    if (!Number.isFinite(saved.aspectRatio) || Math.abs((saved.aspectRatio ?? 0) - aspectRatio) > 0.01) {
      return null;
    }
    return saved.calibration && validMeasurementBoardCalibration(saved.calibration)
      ? saved.calibration
      : null;
  } catch {
    return null;
  }
}

function saveBoardCalibration(calibration: MeasurementBoardCalibration, aspectRatio: number) {
  try {
    window.localStorage.setItem(BOARD_CALIBRATION_STORAGE_KEY, JSON.stringify({
      aspectRatio,
      calibration
    }));
  } catch {
    // Calibration still applies to the current session if browser storage is unavailable.
  }
}

function recalculateLines(
  lines: ManualMeasurementLine[],
  calibration: MeasurementBoardCalibration
): ManualMeasurementLine[] {
  return lines.map((line) => {
    const length = measurementLengthCm(
      calibration,
      { x: line.x1, y: line.y1 },
      { x: line.x2, y: line.y2 }
    );
    return length === null ? line : { ...line, valueCm: formatCentimeters(length) };
  });
}

function formatCentimeters(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function drawBoardCalibration(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  calibration: MeasurementBoardCalibration
) {
  const points = [
    calibration.topLeft,
    calibration.topRight,
    calibration.bottomRight,
    calibration.bottomLeft
  ];
  context.save();
  context.strokeStyle = "#059669";
  context.fillStyle = "#059669";
  context.lineWidth = Math.max(3, canvas.width / 500);
  context.setLineDash([14, 10]);
  context.beginPath();
  points.forEach((point, index) => {
    const canvasPoint = toCanvasPoint(canvas, point);
    if (index === 0) context.moveTo(canvasPoint.x, canvasPoint.y);
    else context.lineTo(canvasPoint.x, canvasPoint.y);
  });
  const first = toCanvasPoint(canvas, points[0]!);
  context.lineTo(first.x, first.y);
  context.stroke();
  context.setLineDash([]);
  points.forEach((point) => {
    const canvasPoint = toCanvasPoint(canvas, point);
    context.beginPath();
    context.arc(canvasPoint.x, canvasPoint.y, Math.max(6, canvas.width / 220), 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 2;
    context.stroke();
  });
  context.restore();
}

function drawCalibrationProgress(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  points: MeasurementPoint[]
) {
  context.save();
  context.strokeStyle = "#d97706";
  context.fillStyle = "#d97706";
  context.lineWidth = Math.max(3, canvas.width / 500);
  context.setLineDash([14, 10]);
  context.beginPath();
  points.forEach((point, index) => {
    const canvasPoint = toCanvasPoint(canvas, point);
    if (index === 0) context.moveTo(canvasPoint.x, canvasPoint.y);
    else context.lineTo(canvasPoint.x, canvasPoint.y);
  });
  context.stroke();
  context.setLineDash([]);
  context.font = `700 ${Math.max(16, canvas.width / 55)}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  points.forEach((point, index) => {
    const canvasPoint = toCanvasPoint(canvas, point);
    context.beginPath();
    context.arc(canvasPoint.x, canvasPoint.y, Math.max(11, canvas.width / 100), 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ffffff";
    context.fillText(String(index + 1), canvasPoint.x, canvasPoint.y);
    context.fillStyle = "#d97706";
  });
  context.restore();
}

function toCanvasPoint(canvas: HTMLCanvasElement, point: MeasurementPoint) {
  return {
    x: point.x / 100 * canvas.width,
    y: point.y / 100 * canvas.height
  };
}
