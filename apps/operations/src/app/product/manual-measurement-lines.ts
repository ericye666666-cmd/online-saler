import type { MeasurementGuideLine } from "./garment-measurement-geometry";
import {
  MEASUREMENT_BOARD_WIDTH_CM,
  measurementLengthCm,
  measurementPointOnBoardCm,
  validMeasurementBoardCalibration,
  type MeasurementBoardCalibration,
  type MeasurementPoint
} from "@online-saler/business-rules";

export {
  measurementLengthCm,
  validMeasurementBoardCalibration,
  type MeasurementBoardCalibration,
  type MeasurementPoint
};

export type ManualMeasurementLine = MeasurementGuideLine & {
  valueCm: string;
  imageId: string;
  source?: "AI" | "MANUAL";
};

export type AIMeasurementSeed = {
  calibration: MeasurementBoardCalibration | null;
  lines: ManualMeasurementLine[];
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
    imageId: input.imageId,
    source: "MANUAL"
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

export function manualMeasurementLineIssue(
  key: string,
  calibration: MeasurementBoardCalibration,
  start: MeasurementPoint,
  end: MeasurementPoint
): string | null {
  if (key !== "shoulderWidthCm") return null;
  const boardStart = measurementPointOnBoardCm(calibration, start);
  const boardEnd = measurementPointOnBoardCm(calibration, end);
  if (!boardStart || !boardEnd) return "无法按测量板坐标确认肩宽线。";
  const left = Math.min(boardStart.x, boardEnd.x);
  const right = Math.max(boardStart.x, boardEnd.x);
  if (left >= MEASUREMENT_BOARD_WIDTH_CM / 2 || right <= MEASUREMENT_BOARD_WIDTH_CM / 2) {
    return "肩宽必须从左侧肩袖接缝横跨衣服中心连接到右侧肩袖接缝，不能从领口量到单侧肩。";
  }
  if (Math.abs(boardStart.y - boardEnd.y) > 20) {
    return "肩宽两端应位于左右肩袖接缝，当前两点高低差过大，请重新连接。";
  }
  return null;
}

export function manualMeasurementValueUpdates(
  lines: ManualMeasurementLine[],
  allowedKeys: Iterable<string>
): Record<string, string> {
  const allowed = new Set(allowedKeys);
  return Object.fromEntries(
    lines
      .filter((line) => allowed.has(line.key))
      .map((line) => [line.key, line.valueCm])
  );
}

export function aiMeasurementSeed(
  output: unknown,
  imageId: string,
  allowedKeys: Iterable<string>
): AIMeasurementSeed {
  const root = record(output);
  const geometry = record(root?.measurementGeometry);
  if (!geometry || String(geometry.imageId ?? "") !== imageId) {
    return { calibration: null, lines: [] };
  }
  const calibration = boardCalibration(geometry.boardCorners);
  if (!calibration || !validMeasurementBoardCalibration(calibration)) {
    return { calibration: null, lines: [] };
  }
  const allowed = new Set(allowedKeys);
  const lineRecords = record(geometry.lines);
  const lines = Object.entries(lineRecords ?? {}).flatMap(([key, value]) => {
    if (!allowed.has(key)) return [];
    const line = record(value);
    const start = point(line?.start);
    const end = point(line?.end);
    if (!start || !end) return [];
    const valueCm = measurementLengthCm(calibration, start, end);
    if (valueCm === null) return [];
    return [{
      key,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      labelX: clamp((start.x + end.x) / 2),
      labelY: clamp((start.y + end.y) / 2 - 3),
      valueCm: formatCentimeters(valueCm),
      imageId,
      source: "AI" as const
    }];
  });
  return { calibration, lines };
}

function boardCalibration(value: unknown): MeasurementBoardCalibration | null {
  const corners = record(value);
  const topLeft = point(corners?.topLeft);
  const topRight = point(corners?.topRight);
  const bottomRight = point(corners?.bottomRight);
  const bottomLeft = point(corners?.bottomLeft);
  return topLeft && topRight && bottomRight && bottomLeft
    ? { topLeft, topRight, bottomRight, bottomLeft }
    : null;
}

function point(value: unknown): MeasurementPoint | null {
  const item = record(value);
  const x = Number(item?.x);
  const y = Number(item?.y);
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100
    ? { x, y }
    : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function formatCentimeters(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function clamp(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}
