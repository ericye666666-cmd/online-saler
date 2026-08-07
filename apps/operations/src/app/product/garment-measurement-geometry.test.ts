import assert from "node:assert/strict";
import test from "node:test";
import { deriveMeasurementGuideLines } from "./garment-measurement-geometry";

function fill(mask: Uint8Array, width: number, left: number, top: number, right: number, bottom: number) {
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) mask[y * width + x] = 1;
  }
}

test("hoodie shoulder and body length start below the hood", () => {
  const width = 100;
  const height = 100;
  const mask = new Uint8Array(width * height);
  fill(mask, width, 40, 8, 60, 39); // hood
  fill(mask, width, 25, 40, 75, 88); // body
  fill(mask, width, 10, 40, 24, 82); // left sleeve
  fill(mask, width, 76, 40, 92, 84); // right sleeve

  const lines = deriveMeasurementGuideLines({ mask, width, height, category: "JACKETS", subcategory: "HOODIES" });
  const shoulder = lines.find((line) => line.key === "shoulderWidthCm");
  const length = lines.find((line) => line.key === "lengthCm");

  assert.ok(shoulder);
  assert.ok(length);
  assert.ok(shoulder.y1 >= 39, `shoulder line must be below hood, received ${shoulder.y1}`);
  assert.ok(shoulder.x1 < 40 && shoulder.x2 > 60, "shoulder endpoints must span the torso rather than the hood");
  assert.equal(length.y1, shoulder.y1);
});

test("pants retain waist, hip, outseam and inseam guide lines", () => {
  const width = 100;
  const height = 100;
  const mask = new Uint8Array(width * height);
  fill(mask, width, 28, 8, 72, 35);
  fill(mask, width, 28, 36, 48, 92);
  fill(mask, width, 52, 36, 72, 92);

  const keys = deriveMeasurementGuideLines({ mask, width, height, category: "PANTS", subcategory: "MEN_JEANS" }).map((line) => line.key);
  assert.deepEqual(keys, ["waistCm", "hipCm", "lengthCm", "thighWidthCm", "legOpeningCm", "inseamCm"]);
});
