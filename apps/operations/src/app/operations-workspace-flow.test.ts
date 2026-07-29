import assert from "node:assert/strict";
import {
  buildCalibrationBody,
  emptyWorkspaceForm,
  formFromProductAndAi,
  workspaceReadiness,
  type JsonRecord
} from "./operations-workspace-flow";

const product: JsonRecord = { id: "product-1", status: "CALIBRATION_PENDING" };
const image: JsonRecord = { id: "image-1" };
const job: JsonRecord = {
  extractionId: "ai-1",
  status: "SUCCEEDED",
  normalizedOutput: {
    title: { value: "Black Short Sleeve Dress" },
    category: { value: "DRESS" },
    primaryColor: { value: "BLACK" },
    brandLabel: { value: "Mock Brand" },
    sizeLabel: { value: "M" },
    pattern: { value: "SOLID" },
    sleeveType: { value: "SHORT" }
  }
};

const fromAi = formFromProductAndAi(product, job);
assert.equal(fromAi.title, "Black Short Sleeve Dress");
assert.equal(fromAi.brand, "Mock Brand");
assert.equal(fromAi.sizeLabel, "M");

const missingPhoto = workspaceReadiness({ product: { status: "DRAFT" }, image: null, job: null, form: fromAi });
assert.equal(missingPhoto.needsPhoto, true);
assert.equal(missingPhoto.canSaveAndNext, false);

const missingMeasurements = workspaceReadiness({ product, image, job, form: fromAi });
assert.equal(missingMeasurements.hasAi, true);
assert.equal(missingMeasurements.canSaveAndNext, false);

const completeForm = { ...fromAi, lengthCm: "92", chestWidthCm: "48", conditionGrade: "GOOD" };
const ready = workspaceReadiness({ product, image, job, form: completeForm });
assert.equal(ready.canSaveAndNext, true);
assert.equal(ready.label, "Ready to save");

const barcoded = workspaceReadiness({
  product: { ...product, status: "BARCODE_ASSIGNED" },
  image,
  job,
  form: completeForm
});
assert.equal(barcoded.canSaveAndNext, false);
assert.equal(barcoded.label, "Complete");

const body = buildCalibrationBody({
  employeeId: "employee-1",
  extractionId: "ai-1",
  form: { ...completeForm, defects: "small stain on cuff" }
});
assert.deepEqual(body.measurements, [
  { type: "LENGTH", valueCm: 92 },
  { type: "CHEST_WIDTH", valueCm: 48 }
]);
assert.equal(body.defects[0].description, "small stain on cuff");

assert.throws(() =>
  buildCalibrationBody({
    employeeId: "employee-1",
    extractionId: "ai-1",
    form: { ...emptyWorkspaceForm(), lengthCm: "", chestWidthCm: "48" }
  })
);

console.log("Operations workspace flow tests passed");
