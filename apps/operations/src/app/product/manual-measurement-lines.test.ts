import assert from "node:assert/strict";
import test from "node:test";
import {
  calibrationLinePayload,
  createManualMeasurementLine,
  manualMeasurementLineIssue,
  manualMeasurementValueUpdates,
  measurementLengthCm,
  measurementPointFromClient,
  upsertManualMeasurementLine,
  validMeasurementBoardCalibration
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

test("converts manual lines to centimeters after perspective-correct board calibration", () => {
  const calibration = {
    topLeft: { x: 25, y: 10 },
    topRight: { x: 75, y: 10 },
    bottomRight: { x: 90, y: 90 },
    bottomLeft: { x: 10, y: 90 }
  };

  assert.equal(validMeasurementBoardCalibration(calibration), true);
  assert.equal(measurementLengthCm(calibration, calibration.topLeft, calibration.topRight), 120);
  assert.equal(measurementLengthCm(calibration, calibration.topRight, calibration.bottomRight), 160);
  assert.equal(measurementLengthCm(calibration, calibration.topLeft, calibration.bottomRight), 200);
});

test("rejects degenerate board calibration instead of returning a misleading distance", () => {
  const calibration = {
    topLeft: { x: 20, y: 20 },
    topRight: { x: 20, y: 20 },
    bottomRight: { x: 20, y: 20 },
    bottomLeft: { x: 20, y: 20 }
  };

  assert.equal(validMeasurementBoardCalibration(calibration), false);
  assert.equal(measurementLengthCm(calibration, { x: 20, y: 20 }, { x: 80, y: 80 }), null);
});

test("rejects board corners clicked in the wrong order", () => {
  assert.equal(validMeasurementBoardCalibration({
    topLeft: { x: 25, y: 10 },
    topRight: { x: 10, y: 90 },
    bottomRight: { x: 90, y: 90 },
    bottomLeft: { x: 75, y: 10 }
  }), false);
});

test("rejects a one-sided collar-to-shoulder line as shoulder width", () => {
  const calibration = {
    topLeft: { x: 20, y: 10 },
    topRight: { x: 80, y: 10 },
    bottomRight: { x: 90, y: 90 },
    bottomLeft: { x: 10, y: 90 }
  };

  assert.match(
    manualMeasurementLineIssue("shoulderWidthCm", calibration, { x: 53, y: 25 }, { x: 72, y: 27 }) ?? "",
    /不能从领口量到单侧肩/
  );
  assert.equal(
    manualMeasurementLineIssue("shoulderWidthCm", calibration, { x: 35, y: 25 }, { x: 68, y: 27 }),
    null
  );
});

test("maps recalculated manual centimeters back to editable measurement fields", () => {
  const shoulder = createManualMeasurementLine({
    key: "shoulderWidthCm",
    start: { x: 25, y: 30 },
    end: { x: 75, y: 30 },
    valueCm: "60",
    imageId: "front"
  });
  const unknown = createManualMeasurementLine({
    key: "notAFormField",
    start: { x: 20, y: 20 },
    end: { x: 30, y: 30 },
    valueCm: "99",
    imageId: "front"
  });

  assert.deepEqual(
    manualMeasurementValueUpdates([shoulder, unknown], ["shoulderWidthCm", "chestWidthCm"]),
    { shoulderWidthCm: "60" }
  );
});
