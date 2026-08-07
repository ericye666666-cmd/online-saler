export type MeasurementGuideLine = {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
};

type GeometryInput = {
  mask: Uint8Array;
  width: number;
  height: number;
  category: string;
  subcategory: string;
};

type Bounds = { left: number; right: number; top: number; bottom: number };

export function deriveMeasurementGuideLines(input: GeometryInput): MeasurementGuideLine[] {
  const bounds = foregroundBounds(input.mask, input.width, input.height);
  if (!bounds) return fallbackLines(input.category, input.subcategory);
  const pants = input.category === "PANTS" || input.category === "SHORT" || input.subcategory === "KIDS_PANTS";
  return pants ? pantsLines(input, bounds) : upperBodyLines(input, bounds);
}

export function imageDataForegroundMask(data: Uint8ClampedArray): Uint8Array {
  const mask = new Uint8Array(data.length / 4);
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4;
    const alpha = data[offset + 3] ?? 0;
    const distanceFromWhite = Math.max(
      255 - (data[offset] ?? 255),
      255 - (data[offset + 1] ?? 255),
      255 - (data[offset + 2] ?? 255)
    );
    mask[index] = alpha > 20 && (alpha < 250 || distanceFromWhite > 18) ? 1 : 0;
  }
  return mask;
}

function upperBodyLines(input: GeometryInput, bounds: Bounds): MeasurementGuideLine[] {
  const { width, height, mask, subcategory } = input;
  const subjectHeight = bounds.bottom - bounds.top + 1;
  const subjectWidth = bounds.right - bounds.left + 1;
  const hooded = subcategory === "HOODIES";
  const centerX = Math.round((bounds.left + bounds.right) / 2);
  const shoulderY = detectShoulderY(mask, width, bounds, hooded);
  const [torsoLeft, torsoRight] = detectTorsoBounds(mask, width, bounds, shoulderY);
  const chestY = Math.round(shoulderY + (bounds.bottom - shoulderY) * 0.2);
  const lengthStartY = hooded ? shoulderY : Math.max(bounds.top, shoulderY - Math.round(subjectHeight * 0.04));
  const cuff = detectSleeveCuff(mask, width, height, bounds, shoulderY, torsoLeft, torsoRight);

  return [
    line("shoulderWidthCm", torsoLeft, shoulderY, torsoRight, shoulderY, centerX, shoulderY - subjectHeight * 0.055, width, height),
    line("chestWidthCm", torsoLeft, chestY, torsoRight, chestY, centerX, chestY - subjectHeight * 0.045, width, height),
    line("lengthCm", centerX, lengthStartY, centerX, bounds.bottom, centerX + subjectWidth * 0.09, (lengthStartY + bounds.bottom) / 2, width, height),
    line("sleeveLengthCm", cuff.side === "right" ? torsoRight : torsoLeft, shoulderY, cuff.x, cuff.y, (cuff.x + (cuff.side === "right" ? torsoRight : torsoLeft)) / 2, (shoulderY + cuff.y) / 2 - subjectHeight * 0.035, width, height),
    line("waistCm", torsoLeft, shoulderY + (bounds.bottom - shoulderY) * 0.55, torsoRight, shoulderY + (bounds.bottom - shoulderY) * 0.55, centerX, shoulderY + (bounds.bottom - shoulderY) * 0.5, width, height),
    line("hipCm", torsoLeft, shoulderY + (bounds.bottom - shoulderY) * 0.72, torsoRight, shoulderY + (bounds.bottom - shoulderY) * 0.72, centerX, shoulderY + (bounds.bottom - shoulderY) * 0.67, width, height)
  ];
}

function pantsLines(input: GeometryInput, bounds: Bounds): MeasurementGuideLine[] {
  const { width, height } = input;
  const subjectWidth = bounds.right - bounds.left + 1;
  const subjectHeight = bounds.bottom - bounds.top + 1;
  const centerX = (bounds.left + bounds.right) / 2;
  const waistY = bounds.top + subjectHeight * 0.05;
  const hipY = bounds.top + subjectHeight * 0.23;
  return [
    line("waistCm", centerX - subjectWidth * 0.25, waistY, centerX + subjectWidth * 0.25, waistY, centerX, waistY - subjectHeight * 0.045, width, height),
    line("hipCm", centerX - subjectWidth * 0.34, hipY, centerX + subjectWidth * 0.34, hipY, centerX, hipY - subjectHeight * 0.045, width, height),
    line("lengthCm", bounds.right - subjectWidth * 0.12, waistY, bounds.right - subjectWidth * 0.12, bounds.bottom, bounds.right, (waistY + bounds.bottom) / 2, width, height),
    line("thighWidthCm", bounds.left + subjectWidth * 0.18, bounds.top + subjectHeight * 0.36, centerX, bounds.top + subjectHeight * 0.36, bounds.left + subjectWidth * 0.34, bounds.top + subjectHeight * 0.31, width, height),
    line("legOpeningCm", bounds.left + subjectWidth * 0.2, bounds.bottom, centerX - subjectWidth * 0.03, bounds.bottom, bounds.left + subjectWidth * 0.34, bounds.bottom - subjectHeight * 0.05, width, height),
    line("inseamCm", centerX, bounds.top + subjectHeight * 0.34, centerX, bounds.bottom, centerX + subjectWidth * 0.09, bounds.top + subjectHeight * 0.67, width, height)
  ];
}

function detectShoulderY(mask: Uint8Array, width: number, bounds: Bounds, hooded: boolean): number {
  const subjectHeight = bounds.bottom - bounds.top + 1;
  const start = Math.round(bounds.top + subjectHeight * (hooded ? 0.12 : 0.03));
  const end = Math.round(bounds.top + subjectHeight * (hooded ? 0.5 : 0.28));
  const spans = Array.from({ length: bounds.bottom + 1 }, (_, y) => rowSpan(mask, width, y));
  const window = Math.max(2, Math.round(subjectHeight * 0.025));
  let bestY = Math.round(bounds.top + subjectHeight * (hooded ? 0.33 : 0.13));
  let bestGrowth = Number.NEGATIVE_INFINITY;
  for (let y = start + window; y <= end - window; y += 1) {
    const before = averageSpan(spans, y - window, y - 1);
    const after = averageSpan(spans, y, y + window);
    const growth = after - before;
    if (growth > bestGrowth) {
      bestGrowth = growth;
      bestY = y;
    }
  }
  const minimum = bounds.top + subjectHeight * (hooded ? 0.22 : 0.05);
  const maximum = bounds.top + subjectHeight * (hooded ? 0.48 : 0.3);
  return Math.round(clamp(bestY, minimum, maximum));
}

function detectTorsoBounds(mask: Uint8Array, width: number, bounds: Bounds, shoulderY: number): [number, number] {
  const center = Math.round((bounds.left + bounds.right) / 2);
  const bottom = Math.round(bounds.top + (bounds.bottom - bounds.top) * 0.88);
  const interval = Math.max(1, bottom - shoulderY + 1);
  const occupancy: number[] = [];
  for (let x = bounds.left; x <= bounds.right; x += 1) {
    let count = 0;
    for (let y = shoulderY; y <= bottom; y += 1) count += mask[y * width + x] ?? 0;
    occupancy[x] = count / interval;
  }
  const threshold = 0.54;
  let left = center;
  let right = center;
  while (left > bounds.left && (occupancy[left - 1] ?? 0) >= threshold) left -= 1;
  while (right < bounds.right && (occupancy[right + 1] ?? 0) >= threshold) right += 1;
  const subjectWidth = bounds.right - bounds.left + 1;
  const detectedWidth = right - left + 1;
  if (detectedWidth < subjectWidth * 0.28 || detectedWidth > subjectWidth * 0.68) {
    return [Math.round(center - subjectWidth * 0.23), Math.round(center + subjectWidth * 0.23)];
  }
  return [left, right];
}

function detectSleeveCuff(
  mask: Uint8Array,
  width: number,
  height: number,
  bounds: Bounds,
  shoulderY: number,
  torsoLeft: number,
  torsoRight: number
): { x: number; y: number; side: "left" | "right" } {
  const subjectWidth = bounds.right - bounds.left + 1;
  const candidates: Array<{ x: number; y: number; side: "left" | "right"; score: number }> = [];
  for (let y = shoulderY; y < Math.min(height, bounds.bottom + 1); y += 1) {
    for (let x = bounds.left; x <= bounds.right; x += 1) {
      if (!mask[y * width + x]) continue;
      const side = x < torsoLeft - subjectWidth * 0.04 ? "left" : x > torsoRight + subjectWidth * 0.04 ? "right" : null;
      if (!side) continue;
      const jointX = side === "left" ? torsoLeft : torsoRight;
      const score = Math.hypot(x - jointX, (y - shoulderY) * 1.1);
      candidates.push({ x, y, side, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? { x: torsoRight + subjectWidth * 0.2, y: shoulderY + (bounds.bottom - shoulderY) * 0.65, side: "right" };
}

function foregroundBounds(mask: Uint8Array, width: number, height: number): Bounds | null {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return right >= left && bottom >= top ? { left, right, top, bottom } : null;
}

function rowSpan(mask: Uint8Array, width: number, y: number): number {
  let left = width;
  let right = -1;
  for (let x = 0; x < width; x += 1) {
    if (!mask[y * width + x]) continue;
    left = Math.min(left, x);
    right = Math.max(right, x);
  }
  return right < left ? 0 : right - left + 1;
}

function averageSpan(values: number[], start: number, end: number): number {
  let sum = 0;
  let count = 0;
  for (let index = Math.max(0, start); index <= Math.min(values.length - 1, end); index += 1) {
    sum += values[index] ?? 0;
    count += 1;
  }
  return count ? sum / count : 0;
}

function line(
  key: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  labelX: number,
  labelY: number,
  width: number,
  height: number
): MeasurementGuideLine {
  return {
    key,
    x1: percent(x1, width),
    y1: percent(y1, height),
    x2: percent(x2, width),
    y2: percent(y2, height),
    labelX: percent(labelX, width),
    labelY: percent(labelY, height)
  };
}

function percent(value: number, total: number): number {
  return Math.round(clamp((value / total) * 100, 1, 99) * 10) / 10;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function fallbackLines(category: string, subcategory: string): MeasurementGuideLine[] {
  if (category === "PANTS" || category === "SHORT" || subcategory === "KIDS_PANTS") {
    return [
      { key: "waistCm", x1: 32, y1: 18, x2: 68, y2: 18, labelX: 50, labelY: 14 },
      { key: "hipCm", x1: 27, y1: 34, x2: 73, y2: 34, labelX: 50, labelY: 30 },
      { key: "lengthCm", x1: 76, y1: 18, x2: 76, y2: 90, labelX: 81, labelY: 56 },
      { key: "thighWidthCm", x1: 29, y1: 47, x2: 51, y2: 47, labelX: 40, labelY: 43 },
      { key: "legOpeningCm", x1: 34, y1: 89, x2: 50, y2: 89, labelX: 42, labelY: 85 },
      { key: "inseamCm", x1: 52, y1: 43, x2: 52, y2: 89, labelX: 57, labelY: 68 }
    ];
  }
  const shoulderY = subcategory === "HOODIES" ? 39 : 24;
  return [
    { key: "shoulderWidthCm", x1: 34, y1: shoulderY, x2: 66, y2: shoulderY, labelX: 50, labelY: shoulderY - 4 },
    { key: "chestWidthCm", x1: 27, y1: shoulderY + 10, x2: 73, y2: shoulderY + 10, labelX: 50, labelY: shoulderY + 6 },
    { key: "lengthCm", x1: 51, y1: shoulderY, x2: 51, y2: 88, labelX: 56, labelY: 62 },
    { key: "sleeveLengthCm", x1: 66, y1: shoulderY, x2: 87, y2: 68, labelX: 80, labelY: 52 },
    { key: "waistCm", x1: 34, y1: 63, x2: 66, y2: 63, labelX: 50, labelY: 59 },
    { key: "hipCm", x1: 30, y1: 74, x2: 70, y2: 74, labelX: 50, labelY: 70 }
  ];
}
