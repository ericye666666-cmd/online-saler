import assert from "node:assert/strict";
import {
  buildCalibrationBody,
  calibrationValidationIssues,
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
    category: { value: "DRESSES" },
    subcategory: { value: "SHORT_DRESSES_SKIRTS" },
    primaryColor: { value: "BLACK" },
    audience: { value: "WOMEN" },
    kidsAgeRange: { value: "NOT_APPLICABLE" },
    brandLabel: { value: "Mock Brand" },
    sizeLabel: { value: "M" },
    pattern: { value: "SOLID" },
    sleeveType: { value: "SHORT" }
  }
};

const fromAi = formFromProductAndAi(product, job);
assert.equal(fromAi.title, "Black Short Sleeve Dress");
assert.equal(fromAi.category, "DRESSES");
assert.equal(fromAi.subcategory, "SHORT_DRESSES_SKIRTS");
assert.equal(fromAi.audience, "WOMEN");
assert.equal(fromAi.brand, "Mock Brand");
assert.equal(fromAi.tagSize, "M");
assert.equal(fromAi.sizeLabel, "M");

const fromPersistedProduct = formFromProductAndAi(
  { ...product, pattern: "STRIPED", sleeveType: "LONG" },
  job
);
assert.equal(fromPersistedProduct.pattern, "STRIPED");
assert.equal(fromPersistedProduct.sleeveType, "LONG");

const missingPhoto = workspaceReadiness({ product: { status: "DRAFT" }, image: null, job: null, form: fromAi });
assert.equal(missingPhoto.needsPhoto, true);
assert.equal(missingPhoto.canSaveAndNext, false);

const missingMeasurements = workspaceReadiness({ product, image, job, form: fromAi });
assert.equal(missingMeasurements.hasAi, true);
assert.equal(missingMeasurements.canSaveAndNext, false);

const selectedSizeButMissingPrice = calibrationValidationIssues(
  {
    ...fromAi,
    sizeLabel: "XS",
    lengthCm: "60",
    chestWidthCm: "60",
    shoulderWidthCm: "40",
    sleeveLengthCm: "20",
    defects: "None"
  },
  { hasPhoto: true, hasAi: true }
);
assert.ok(selectedSizeButMissingPrice.some((issue) => issue.field === "priceKsh"));
assert.ok(!selectedSizeButMissingPrice.some((issue) => issue.field === "sizeLabel"));

const completeForm = {
  ...fromAi,
  lengthCm: "92",
  chestWidthCm: "48",
  shoulderWidthCm: "39",
  sleeveLengthCm: "22",
  waistCm: "42",
  hipCm: "51",
  conditionGrade: "GOOD",
  priceKsh: "850",
  defects: "None"
};
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
  form: {
    ...completeForm,
    tagSize: "UK 12",
    description: "Black short sleeve dress.",
    defects: "small stain on cuff"
  }
});
assert.deepEqual(body.measurements, [
  { type: "LENGTH", valueCm: 92 },
  { type: "CHEST_WIDTH", valueCm: 48 },
  { type: "SHOULDER_WIDTH", valueCm: 39 },
  { type: "SLEEVE_LENGTH", valueCm: 22 },
  { type: "WAIST", valueCm: 42 },
  { type: "HIP", valueCm: 51 }
]);
assert.equal(body.subcategory, "SHORT_DRESSES_SKIRTS");
assert.equal(body.gender, "WOMEN");
assert.equal(body.priceKsh, 850);
assert.equal(body.tagSize, "UK 12");
assert.equal(body.description, "Black short sleeve dress.");
assert.equal(body.fitType, "UNKNOWN");
assert.equal(body.stretchLevel, "UNKNOWN");
assert.equal(body.fabricWeight, "UNKNOWN");
assert.equal(body.defects[0].description, "small stain on cuff");

const pantsForm = {
  ...completeForm,
  category: "PANTS",
  subcategory: "MEN_JEANS",
  lengthCm: "101",
  chestWidthCm: "",
  waistCm: "42",
  hipCm: "52",
  thighWidthCm: "31",
  legOpeningCm: "22",
  inseamCm: "72"
};
const pantsReady = workspaceReadiness({ product, image, job, form: pantsForm });
assert.equal(pantsReady.canSaveAndNext, true);
const pantsBody = buildCalibrationBody({ employeeId: "employee-1", extractionId: "ai-1", form: pantsForm });
assert.deepEqual(pantsBody.measurements, [
  { type: "OUTSEAM", valueCm: 101 },
  { type: "WAIST", valueCm: 42 },
  { type: "HIP", valueCm: 52 },
  { type: "THIGH_WIDTH", valueCm: 31 },
  { type: "LEG_OPENING", valueCm: 22 },
  { type: "INSEAM", valueCm: 72 }
]);

const pantsWithoutHip = workspaceReadiness({ product, image, job, form: { ...pantsForm, hipCm: "" } });
assert.equal(pantsWithoutHip.canSaveAndNext, false);

const sleevelessForm = { ...completeForm, sleeveType: "SLEEVELESS", sleeveLengthCm: "" };
assert.equal(workspaceReadiness({ product, image, job, form: sleevelessForm }).canSaveAndNext, true);

const nonApparelForm = {
  ...completeForm,
  category: "BAG",
  subcategory: "LADIES_BAGS",
  lengthCm: "",
  chestWidthCm: "",
  shoulderWidthCm: "",
  sleeveLengthCm: "",
  waistCm: "",
  hipCm: ""
};
assert.equal(workspaceReadiness({ product, image, job, form: nonApparelForm }).canSaveAndNext, true);
assert.deepEqual(
  buildCalibrationBody({ employeeId: "employee-1", extractionId: "ai-1", form: nonApparelForm }).measurements,
  []
);

const kidsForm = {
  ...completeForm,
  audience: "KIDS",
  kidsAgeRange: "NOT_APPLICABLE"
};
const missingKidsAge = workspaceReadiness({ product, image, job, form: kidsForm });
assert.equal(missingKidsAge.canSaveAndNext, false);
assert.equal(missingKidsAge.label, "Check required fields");
assert.equal(missingKidsAge.reasons.length, 1);

const noDefectsBody = buildCalibrationBody({
  employeeId: "employee-1",
  extractionId: "ai-1",
  form: completeForm
});
assert.deepEqual(noDefectsBody.defects, []);

assert.throws(() =>
  buildCalibrationBody({
    employeeId: "employee-1",
    extractionId: "ai-1",
    form: { ...emptyWorkspaceForm(), lengthCm: "", chestWidthCm: "48" }
  })
);

console.log("Operations workspace flow tests passed");
