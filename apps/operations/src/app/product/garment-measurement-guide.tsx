"use client";

import { useEffect, useMemo, useState } from "react";
import { MousePointer2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  deriveMeasurementGuideLines,
  imageDataForegroundMask,
  type MeasurementGuideLine
} from "./garment-measurement-geometry";
import type { ManualMeasurementLine } from "./manual-measurement-lines";

type GuideMeasurement = {
  key: string;
  label: string;
  value: string;
  aiValue?: string;
};

const GUIDE_CANVAS_SIZE = 256;

export function GarmentMeasurementGuide(props: {
  category: string;
  subcategory: string;
  imageUrl: string;
  measurements: GuideMeasurement[];
  manualLines?: ManualMeasurementLine[];
  aiLines?: ManualMeasurementLine[];
  onManualCalibrate?: () => void;
  manualCalibrateLabel?: string;
  manualCalibrateDisabled?: boolean;
}) {
  const [detectedLines, setDetectedLines] = useState<MeasurementGuideLine[] | null>(null);
  const [imageFrame, setImageFrame] = useState({ left: 0, top: 0, width: 100, height: 100 });
  const fallbackLines = useMemo(
    () => deriveMeasurementGuideLines({
      mask: new Uint8Array(GUIDE_CANVAS_SIZE * GUIDE_CANVAS_SIZE),
      width: GUIDE_CANVAS_SIZE,
      height: GUIDE_CANVAS_SIZE,
      category: props.category,
      subcategory: props.subcategory
    }),
    [props.category, props.subcategory]
  );

  useEffect(() => {
    let active = true;
    setDetectedLines(null);
    setImageFrame({ left: 0, top: 0, width: 100, height: 100 });
    if (!props.imageUrl) return () => { active = false; };

    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = GUIDE_CANVAS_SIZE;
        canvas.height = GUIDE_CANVAS_SIZE;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.clearRect(0, 0, GUIDE_CANVAS_SIZE, GUIDE_CANVAS_SIZE);
        const scale = Math.min(GUIDE_CANVAS_SIZE / image.naturalWidth, GUIDE_CANVAS_SIZE / image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        const left = (GUIDE_CANVAS_SIZE - width) / 2;
        const top = (GUIDE_CANVAS_SIZE - height) / 2;
        context.drawImage(image, left, top, width, height);
        const pixels = context.getImageData(0, 0, GUIDE_CANVAS_SIZE, GUIDE_CANVAS_SIZE);
        const lines = deriveMeasurementGuideLines({
          mask: imageDataForegroundMask(pixels.data),
          width: GUIDE_CANVAS_SIZE,
          height: GUIDE_CANVAS_SIZE,
          category: props.category,
          subcategory: props.subcategory
        });
        if (active) {
          setImageFrame({
            left: left / GUIDE_CANVAS_SIZE * 100,
            top: top / GUIDE_CANVAS_SIZE * 100,
            width: width / GUIDE_CANVAS_SIZE * 100,
            height: height / GUIDE_CANVAS_SIZE * 100
          });
          setDetectedLines(lines);
        }
      } catch {
        if (active) setDetectedLines(null);
      }
    };
    image.onerror = () => { if (active) setDetectedLines(null); };
    image.src = props.imageUrl;
    return () => { active = false; };
  }, [props.category, props.imageUrl, props.subcategory]);

  const visibleKeys = new Set(props.measurements.map((measurement) => measurement.key));
  const manualLines = new Map((props.manualLines ?? []).map((line) => [line.key, line]));
  const aiLines = new Map((props.aiLines ?? []).map((line) => [line.key, line]));
  const displayManualLines = new Map((props.manualLines ?? []).map((line) => [line.key, fitLineToImageFrame(line, imageFrame)]));
  const displayAiLines = new Map((props.aiLines ?? []).map((line) => [line.key, fitLineToImageFrame(line, imageFrame)]));
  const lines = (detectedLines ?? fallbackLines)
    .filter((line) => visibleKeys.has(line.key))
    .map((line) => displayManualLines.get(line.key) ?? displayAiLines.get(line.key) ?? line);
  const values = new Map(props.measurements.map((measurement) => [measurement.key, measurement]));

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold">尺寸位置示意</h4>
          <p className="text-xs text-muted-foreground">虚线根据当前服装轮廓定位。位置不准时，可在测量板原图上手动连接起点和终点。</p>
        </div>
        {props.onManualCalibrate ? (
          <Button type="button" size="sm" variant="outline" className="shrink-0" disabled={props.manualCalibrateDisabled} onClick={props.onManualCalibrate}>
            <MousePointer2Icon data-icon="inline-start" />{props.manualCalibrateLabel ?? "手动连线校准"}
          </Button>
        ) : <span className="shrink-0 text-[11px] font-medium text-blue-700">虚线 = 测量线</span>}
      </div>
      <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded border bg-white">
        {props.imageUrl ? <img src={props.imageUrl} alt="尺寸位置参考商品图" className="absolute inset-0 size-full object-contain opacity-65" /> : null}
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" role="img" aria-label="服装平铺尺寸测量位置示意">
          {lines.map((line) => {
            const measurement = values.get(line.key);
            const value = measurement?.value || measurement?.aiValue || "?";
            const manual = manualLines.has(line.key);
            const aiLocated = !manual && aiLines.has(line.key);
            const stroke = manual ? "#15803d" : aiLocated ? "#2563eb" : "#64748b";
            return (
              <g key={line.key}>
                <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke={stroke} strokeWidth="0.9" strokeDasharray="2 1.5" />
                <circle cx={line.x1} cy={line.y1} r="1.1" fill="#ffffff" stroke={stroke} strokeWidth="0.7" />
                <circle cx={line.x2} cy={line.y2} r="1.1" fill="#ffffff" stroke={stroke} strokeWidth="0.7" />
                <text x={line.labelX} y={line.labelY} textAnchor="middle" fontSize="3.2" fontWeight="700" fill="#1e3a8a" paintOrder="stroke" stroke="#ffffff" strokeWidth="1.4">
                  {measurement?.label ?? line.key} {value} cm
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-3">
        {props.measurements.map((measurement) => (
          <div key={measurement.key} className="flex justify-between gap-2 border-b py-1">
            <span className="text-muted-foreground">
              {measurement.label}
              {manualLines.has(measurement.key)
                ? <span className="ml-1 text-green-700">人工连线</span>
                : aiLines.has(measurement.key)
                  ? <span className="ml-1 text-blue-700">AI定位</span>
                  : null}
            </span>
            <span className="font-medium tabular-nums">{measurement.value || measurement.aiValue || "待确认"}{measurement.value || measurement.aiValue ? " cm" : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function fitLineToImageFrame(
  line: ManualMeasurementLine,
  frame: { left: number; top: number; width: number; height: number }
): ManualMeasurementLine {
  const x = (value: number) => frame.left + value / 100 * frame.width;
  const y = (value: number) => frame.top + value / 100 * frame.height;
  return {
    ...line,
    x1: x(line.x1),
    y1: y(line.y1),
    x2: x(line.x2),
    y2: y(line.y2),
    labelX: x(line.labelX),
    labelY: y(line.labelY)
  };
}
