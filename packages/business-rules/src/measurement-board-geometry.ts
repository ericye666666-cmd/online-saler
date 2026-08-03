export type MeasurementPoint = { x: number; y: number };

export type MeasurementBoardCalibration = {
  topLeft: MeasurementPoint;
  topRight: MeasurementPoint;
  bottomRight: MeasurementPoint;
  bottomLeft: MeasurementPoint;
};

export const MEASUREMENT_BOARD_WIDTH_CM = 120;
export const MEASUREMENT_BOARD_HEIGHT_CM = 160;

export function measurementLengthCm(
  calibration: MeasurementBoardCalibration,
  start: MeasurementPoint,
  end: MeasurementPoint
): number | null {
  const boardStart = measurementPointOnBoardCm(calibration, start);
  const boardEnd = measurementPointOnBoardCm(calibration, end);
  if (!boardStart || !boardEnd) return null;
  const distance = Math.hypot(boardEnd.x - boardStart.x, boardEnd.y - boardStart.y);
  if (!Number.isFinite(distance) || distance <= 0 || distance > 210) return null;
  return Math.round(distance * 2) / 2;
}

export function measurementPointOnBoardCm(
  calibration: MeasurementBoardCalibration,
  point: MeasurementPoint
): MeasurementPoint | null {
  const transform = boardTransform(calibration);
  return transform ? transformPoint(transform, point) : null;
}

export function validMeasurementBoardCalibration(calibration: MeasurementBoardCalibration): boolean {
  const points = [
    calibration.topLeft,
    calibration.topRight,
    calibration.bottomRight,
    calibration.bottomLeft
  ];
  if (points.some((point) => !validPoint(point))) return false;
  const area = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
  const topY = (calibration.topLeft.y + calibration.topRight.y) / 2;
  const bottomY = (calibration.bottomLeft.y + calibration.bottomRight.y) / 2;
  const leftX = (calibration.topLeft.x + calibration.bottomLeft.x) / 2;
  const rightX = (calibration.topRight.x + calibration.bottomRight.x) / 2;
  return area >= 500
    && topY < bottomY
    && leftX < rightX
    && boardTransform(calibration) !== null;
}

function boardTransform(calibration: MeasurementBoardCalibration): number[] | null {
  if (![calibration.topLeft, calibration.topRight, calibration.bottomRight, calibration.bottomLeft].every(validPoint)) {
    return null;
  }
  const source = [calibration.topLeft, calibration.topRight, calibration.bottomRight, calibration.bottomLeft];
  const destination = [
    { x: 0, y: 0 },
    { x: MEASUREMENT_BOARD_WIDTH_CM, y: 0 },
    { x: MEASUREMENT_BOARD_WIDTH_CM, y: MEASUREMENT_BOARD_HEIGHT_CM },
    { x: 0, y: MEASUREMENT_BOARD_HEIGHT_CM }
  ];
  const matrix: number[][] = [];
  const values: number[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const input = source[index]!;
    const output = destination[index]!;
    matrix.push([input.x, input.y, 1, 0, 0, 0, -output.x * input.x, -output.x * input.y]);
    values.push(output.x);
    matrix.push([0, 0, 0, input.x, input.y, 1, -output.y * input.x, -output.y * input.y]);
    values.push(output.y);
  }
  return solveLinearSystem(matrix, values);
}

function transformPoint(transform: number[], point: MeasurementPoint): MeasurementPoint | null {
  const denominator = transform[6]! * point.x + transform[7]! * point.y + 1;
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-8) return null;
  return {
    x: (transform[0]! * point.x + transform[1]! * point.y + transform[2]!) / denominator,
    y: (transform[3]! * point.x + transform[4]! * point.y + transform[5]!) / denominator
  };
}

function solveLinearSystem(matrix: number[][], values: number[]): number[] | null {
  const size = values.length;
  const rows = matrix.map((row, index) => [...row, values[index]!]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(rows[row]![column]!) > Math.abs(rows[pivot]![column]!)) pivot = row;
    }
    if (Math.abs(rows[pivot]![column]!) < 1e-10) return null;
    [rows[column], rows[pivot]] = [rows[pivot]!, rows[column]!];
    const divisor = rows[column]![column]!;
    for (let index = column; index <= size; index += 1) rows[column]![index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = rows[row]![column]!;
      for (let index = column; index <= size; index += 1) {
        rows[row]![index] -= factor * rows[column]![index]!;
      }
    }
  }
  return rows.map((row) => row[size]!);
}

function validPoint(point: MeasurementPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100;
}
