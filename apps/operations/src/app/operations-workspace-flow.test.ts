import assert from "node:assert/strict";
import {
  buildCalibrationBody,
  calibrationValidationIssues,
  emptyWorkspaceForm,
  formFromProductAndAi,
  normalizeWorkspaceForm,
  measurementFields,
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
    ukSizeLabel: { value: "UK 12" },
    pattern: { value: "SOLID" },
    sleeveType: { value: "SHORT" },
    fitType: { value: "RELAXED" },
    stretchLevel: { value: "LOW" },
    fabricWeight: { value: "LIGHT" },
    material: { value: "COTTON_BLEND" },
    tags: { value: ["CREW_NECK", "CASUAL"] }
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
assert.equal(fromAi.ukSizeLabel, "UK 12");
assert.equal(fromAi.fitType, "RELAXED");
assert.equal(fromAi.stretchLevel, "LOW");
assert.equal(fromAi.fabricWeight, "LIGHT");
assert.equal(fromAi.material, "COTTON_BLEND");
assert.deepEqual(fromAi.tags, ["CREW_NECK", "CASUAL"]);

const fromPersistedProduct = formFromProductAndAi(
  { ...product, pattern: "STRIPED", sleeveType: "LONG", fitType: "SLIM" },
  job
);
assert.equal(fromPersistedProduct.pattern, "STRIPED");
assert.equal(fromPersistedProduct.sleeveType, "LONG");
assert.equal(fromPersistedProduct.fitType, "SLIM");

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
    ukSizeLabel: "UK 12",
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
assert.equal(body.ukSizeLabel, "UK 12");
assert.equal(body.fitType, "RELAXED");
assert.equal(body.stretchLevel, "LOW");
assert.equal(body.fabricWeight, "LIGHT");
assert.equal(body.material, "COTTON_BLEND");
assert.deepEqual(body.tags, ["CREW_NECK", "CASUAL"]);
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

// Shoe AI may suggest a visible label, but cannot confirm a matching physical pair or shoe condition.
const shoeAi = {
  status: "SUCCEEDED",
  normalizedOutput: {
    ...job.normalizedOutput as JsonRecord,
    category: { value: "SHOES" },
    subcategory: { value: "KIDS_SHOES" },
    audience: { value: "KIDS" },
    sizeLabel: { value: "33" },
    shoeSizeSystem: { value: "EU" },
    shoeType: { value: "Kids' shoes" },
    shoePairConfirmed: { value: true },
    shoeConditionNotes: { value: "AI thinks these are unworn" },
    insoleLengthCm: { value: 21 }
  }
};
const shoeFromAi = formFromProductAndAi(product, shoeAi);
assert.equal(shoeFromAi.category, "SHOES");
assert.equal(shoeFromAi.tagSize, "33");
assert.equal(shoeFromAi.shoeSizeSystem, "EU");
assert.equal(shoeFromAi.sizeLabel, "EU 33");
assert.equal(shoeFromAi.ukSizeLabel, "");
assert.equal(shoeFromAi.shoePairConfirmed, false);
assert.equal(shoeFromAi.shoeConditionNotes, "");
assert.equal(shoeFromAi.insoleLengthCm, "");
assert.equal(shoeFromAi.fitType, "");
assert.equal(shoeFromAi.sleeveType, "");

const calibratedPair = {
  ...shoeFromAi,
  priceKsh: "1200",
  shoePairConfirmed: true,
  shoeConditionNotes: "Light sole wear; no separation or tears in lining.",
  defects: "None"
};
assert.deepEqual(calibrationValidationIssues(calibratedPair), []);
assert.equal(workspaceReadiness({ product, image, job: shoeAi, form: calibratedPair }).canSaveAndNext, true);
assert.deepEqual(measurementFields(calibratedPair), [{ key: "insoleLengthCm", type: "INSOLE_LENGTH", label: "鞋垫实测长度", required: false }]);
const shoeBody = buildCalibrationBody({
  employeeId: "employee-1", extractionId: "ai-1",
  form: { ...calibratedPair, sizeLabel: "L", ukSizeLabel: "UK 12", lengthCm: "62", chestWidthCm: "40", insoleLengthCm: "21.5" }
});
assert.equal(shoeBody.sizeLabel, "EU 33");
assert.equal(shoeBody.tagSize, "33");
assert.equal(shoeBody.shoeSizeSystem, "EU");
assert.equal(shoeBody.shoeType, "Kids' shoes");
assert.equal(shoeBody.shoePairConfirmed, true);
assert.equal(shoeBody.shoeConditionNotes, calibratedPair.shoeConditionNotes);
assert.equal(shoeBody.kidsAgeRange, undefined);
assert.equal(shoeBody.ukSizeLabel, undefined);
assert.equal(shoeBody.sleeveType, undefined);
assert.equal(shoeBody.fitType, undefined);
assert.equal(shoeBody.stretchLevel, undefined);
assert.equal(shoeBody.fabricWeight, undefined);
assert.deepEqual(shoeBody.measurements, [{ type: "INSOLE_LENGTH", valueCm: 21.5 }]);
assert.deepEqual(buildCalibrationBody({ employeeId: "employee-1", extractionId: "ai-1", form: calibratedPair }).measurements, []);

for (const [field, value] of [
  ["tagSize", ""], ["tagSize", "L"], ["tagSize", "UK 7"], ["shoeSizeSystem", ""], ["shoeSizeSystem", "GUESS"],
  ["shoeType", ""], ["shoeType", "Jacket"], ["shoeConditionNotes", ""], ["shoePairConfirmed", false],
  ["insoleLengthCm", "0"], ["insoleLengthCm", "not measured"]
] as const) {
  const issues = calibrationValidationIssues({ ...calibratedPair, [field]: value });
  assert.ok(issues.some((issue) => issue.field === field), `${field}=${String(value)} must require correction`);
}

const switchedToShoes = normalizeWorkspaceForm({ ...completeForm, category: "SHOES", subcategory: "MEN_SHOES" }, "DRESSES");
assert.equal(switchedToShoes.tagSize, "");
assert.equal(switchedToShoes.sizeLabel, "");
assert.equal(switchedToShoes.lengthCm, "");
assert.equal(switchedToShoes.chestWidthCm, "");
assert.equal(switchedToShoes.shoePairConfirmed, false);
assert.equal(switchedToShoes.kidsAgeRange, "NOT_APPLICABLE");
const switchedToClothing = normalizeWorkspaceForm({ ...calibratedPair, category: "TSHIRTS", subcategory: "TSHIRT" }, "SHOES");
assert.equal(switchedToClothing.sizeLabel, "");
assert.equal(switchedToClothing.tagSize, "");
assert.equal(switchedToClothing.shoeSizeSystem, "");
assert.equal(switchedToClothing.shoePairConfirmed, false);

const persistedShoe = formFromProductAndAi({
  ...product, category: "KIDS", subcategory: "KIDS_SHOES", gender: "KIDS", finalSizeLabel: "L",
  tagSize: "UK 2.5", shoeSizeSystem: "UK", shoeType: "Kids' shoes", shoePairConfirmed: true,
  shoeConditionNotes: "Soles checked by employee", measurements: [{ measurementType: "INSOLE_LENGTH", finalValueCm: "22" }]
}, shoeAi);
assert.equal(persistedShoe.category, "SHOES");
assert.equal(persistedShoe.sizeLabel, "UK 2.5");
assert.equal(persistedShoe.tagSize, "UK 2.5");
assert.equal(persistedShoe.shoePairConfirmed, true);
assert.equal(persistedShoe.shoeConditionNotes, "Soles checked by employee");
assert.equal(persistedShoe.insoleLengthCm, "22");

console.log("Operations workspace flow tests passed");
