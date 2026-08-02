import assert from "node:assert/strict";
import test from "node:test";
import {
  calibrationLinePayload,
  createManualMeasurementLine,
  measurementPointFromClient,
  upsertManualMeasurementLine
} from "./manual-measurement-lines";

test("creates a labelled manual measurement line and converts it to API coordinates", () => {
  const line = createManualMeasurementLine({
    key: "chestWidthCm",
    start: { x: 20, y: 42 },
    end: { x: 80, y: 42 },
    valueCm: "52",
    imageId: "front-original"
  });

  assert.equal(line.labelX, 50);
  assert.equal(line.labelY, 39);
  assert.deepEqual(calibrationLinePayload(line), {
    imageId: "front-original",
    start: { x: 0.2, y: 0.42 },
    end: { x: 0.8, y: 0.42 }
  });
});

test("normalizes pointer coordinates and replaces a line for the same measurement", () => {
  assert.deepEqual(measurementPointFromClient(250, 150, { left: 50, top: 50, width: 400, height: 200 }), {
    x: 50,
    y: 50
  });

  const first = createManualMeasurementLine({
    key: "lengthCm",
    start: { x: 50, y: 20 },
    end: { x: 50, y: 80 },
    valueCm: "60",
    imageId: "front"
  });
  const replacement = createManualMeasurementLine({
    key: "lengthCm",
    start: { x: 52, y: 22 },
    end: { x: 52, y: 84 },
    valueCm: "62",
    imageId: "front"
  });

  assert.deepEqual(upsertManualMeasurementLine([first], replacement), [replacement]);
});
