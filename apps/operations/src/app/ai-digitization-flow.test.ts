import assert from "node:assert/strict";
import { getDigitizationFlowState, type JsonRecord } from "./ai-digitization-flow";

const employeeId = "00000000-0000-4000-8000-000000000001";
const productDraft: JsonRecord = { id: "product-1", status: "DRAFT", barcode: null };
const image: JsonRecord = { id: "image-1" };
const succeededJob: JsonRecord = { extractionId: "extraction-1", status: "SUCCEEDED" };
const runningJob: JsonRecord = { extractionId: "extraction-1", status: "RUNNING" };
const productCalibrated: JsonRecord = { id: "product-1", status: "CALIBRATED", barcode: null };
const productBarcoded: JsonRecord = { id: "product-1", status: "BARCODE_ASSIGNED", barcode: "DLFTEST1" };
const barcode: JsonRecord = { id: "product-1", status: "BARCODE_ASSIGNED", barcode: "DLFTEST1" };

assert.deepEqual(
  getDigitizationFlowState({ employeeId, product: null, image: null, job: null, barcode: null }).steps,
  {
    create: "Ready",
    image: "Pending",
    ai: "Pending",
    calibration: "Pending",
    barcode: "Pending"
  }
);

const afterCreate = getDigitizationFlowState({ employeeId, product: productDraft, image: null, job: null, barcode: null });
assert.equal(afterCreate.canCreateProduct, false);
assert.equal(afterCreate.canSaveImage, true);
assert.equal(afterCreate.canGenerateBarcode, false);
assert.equal(afterCreate.steps.create, "Done");
assert.equal(afterCreate.steps.image, "Ready");

const afterImage = getDigitizationFlowState({ employeeId, product: productDraft, image, job: null, barcode: null });
assert.equal(afterImage.canSaveImage, false);
assert.equal(afterImage.canRunMockAI, true);
assert.equal(afterImage.steps.image, "Done");
assert.equal(afterImage.steps.ai, "Ready");

const whileAiRuns = getDigitizationFlowState({ employeeId, product: productDraft, image, job: runningJob, barcode: null });
assert.equal(whileAiRuns.canConfirmCalibration, false);
assert.equal(whileAiRuns.steps.calibration, "Pending");

const afterAi = getDigitizationFlowState({ employeeId, product: productDraft, image, job: succeededJob, barcode: null });
assert.equal(afterAi.canRunMockAI, false);
assert.equal(afterAi.canConfirmCalibration, true);
assert.equal(afterAi.canGenerateBarcode, false);
assert.equal(afterAi.steps.ai, "Done");
assert.equal(afterAi.steps.calibration, "Ready");

const afterCalibration = getDigitizationFlowState({ employeeId, product: productCalibrated, image, job: succeededJob, barcode: null });
assert.equal(afterCalibration.canConfirmCalibration, false);
assert.equal(afterCalibration.canGenerateBarcode, true);
assert.equal(afterCalibration.steps.calibration, "Done");
assert.equal(afterCalibration.steps.barcode, "Ready");

const afterBarcode = getDigitizationFlowState({ employeeId, product: productBarcoded, image, job: succeededJob, barcode });
assert.equal(afterBarcode.canGenerateBarcode, false);
assert.equal(afterBarcode.steps.barcode, "Done");

const noEmployee = getDigitizationFlowState({ employeeId: "", product: productCalibrated, image, job: succeededJob, barcode: null });
assert.equal(noEmployee.canGenerateBarcode, false);

console.log("AI digitization flow gating tests passed");
