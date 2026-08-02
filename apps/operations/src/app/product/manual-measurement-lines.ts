import type { MeasurementGuideLine } from "./garment-measurement-geometry";

export type MeasurementPoint = { x: number; y: number };

export type ManualMeasurementLine = MeasurementGuideLine & {
  valueCm: string;
  imageId: string;
};

export function createManualMeasurementLine(input: {
  key: string;
  start: MeasurementPoint;
  end: MeasurementPoint;
  valueCm: string;
  imageId: string;
}): ManualMeasurementLine {
  const labelX = clamp((input.start.x + input.end.x) / 2);
  const labelY = clamp((input.start.y + input.end.y) / 2 - 3);
  return {
    key: input.key,
    x1: clamp(input.start.x),
    y1: clamp(input.start.y),
    x2: clamp(input.end.x),
    y2: clamp(input.end.y),
    labelX,
    labelY,
    valueCm: input.valueCm,
    imageId: input.imageId
  };
}

export function upsertManualMeasurementLine(
  lines: ManualMeasurementLine[],
  line: ManualMeasurementLine
): ManualMeasurementLine[] {
  return [...lines.filter((item) => item.key !== line.key), line];
}

export function measurementPointFromClient(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">
): MeasurementPoint {
  return {
    x: clamp(((clientX - rect.left) / rect.width) * 100),
    y: clamp(((clientY - rect.top) / rect.height) * 100)
  };
}

export function calibrationLinePayload(line: ManualMeasurementLine) {
  return {
    imageId: line.imageId,
    start: { x: line.x1 / 100, y: line.y1 / 100 },
    end: { x: line.x2 / 100, y: line.y2 / 100 }
  };
}

function clamp(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}
