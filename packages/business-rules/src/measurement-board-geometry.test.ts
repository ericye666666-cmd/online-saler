import assert from "node:assert/strict";
import test from "node:test";
import {
  measurementLengthCm,
  validMeasurementBoardCalibration
} from "./measurement-board-geometry";

test("converts image points through a perspective-correct 120 by 160 cm board", () => {
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

test("rejects invalid board corners", () => {
  const invalid = {
    topLeft: { x: 20, y: 20 },
    topRight: { x: 20, y: 20 },
    bottomRight: { x: 20, y: 20 },
    bottomLeft: { x: 20, y: 20 }
  };

  assert.equal(validMeasurementBoardCalibration(invalid), false);
  assert.equal(measurementLengthCm(invalid, { x: 20, y: 20 }, { x: 80, y: 80 }), null);
});
