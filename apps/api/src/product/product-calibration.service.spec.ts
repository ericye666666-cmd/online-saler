import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  ConditionGrade,
  ProductFabricWeight,
  ProductFitType,
  ProductGender,
  ProductStatus,
  ProductStretchLevel,
  prisma
} from "@online-saler/database";
import { ProductCalibrationService } from "./product-calibration.service";
import { formatShoeSizeLabel } from "@online-saler/shared-types";
import type { CalibrateProductInput } from "./product-calibration.service";

const originals = {
  productFindUnique: prisma.product.findUnique,
  productUpdate: prisma.product.update,
  extractionFindFirst: prisma.aIExtraction.findFirst,
  decisionUpsert: prisma.aIFieldDecision.upsert,
  measurementUpdateMany: prisma.productMeasurement.updateMany,
  measurementUpsert: prisma.productMeasurement.upsert,
  defectDeleteMany: prisma.productDefect.deleteMany,
  defectCreate: prisma.productDefect.create,
  transaction: prisma.$transaction
};

afterEach(() => {
  prisma.product.findUnique = originals.productFindUnique;
  prisma.product.update = originals.productUpdate;
  prisma.aIExtraction.findFirst = originals.extractionFindFirst;
  prisma.aIFieldDecision.upsert = originals.decisionUpsert;
  prisma.productMeasurement.updateMany = originals.measurementUpdateMany;
  prisma.productMeasurement.upsert = originals.measurementUpsert;
  prisma.productDefect.deleteMany = originals.defectDeleteMany;
  prisma.productDefect.create = originals.defectCreate;
  prisma.$transaction = originals.transaction;
});

function shoeInput(): CalibrateProductInput {
  return {
    employeeId: "employee-1", extractionId: "extraction-1", title: "Blue kids sneakers",
    category: "KIDS", subcategory: "KIDS_SHOES", color: "BLUE", gender: ProductGender.KIDS,
    pattern: "STRIPED", sleeveType: "LONG", fitType: ProductFitType.REGULAR,
    stretchLevel: ProductStretchLevel.LOW, fabricWeight: ProductFabricWeight.HEAVY,
    material: "CANVAS", tags: ["CASUAL"], sizeLabel: "L", ukSizeLabel: "UK 6-8Y",
    tagSize: "EU 32", shoeSizeSystem: "EU", shoeType: "Sneakers", shoePairConfirmed: true,
    shoeConditionNotes: "Light sole wear; no visible separation.",
    conditionGrade: ConditionGrade.GOOD, priceKsh: 750,
    measurements: [{ type: "CHEST_WIDTH", valueCm: 42 }, { type: "INSOLE_LENGTH", valueCm: 20.5 }], defects: []
  };
}

it("formats original shoe sizes without converting, guessing or duplicating their system", () => {
  assert.equal(formatShoeSizeLabel("42", "EU"), "EU 42");
  assert.equal(formatShoeSizeLabel("EU42", "EU"), "EU 42");
  assert.equal(formatShoeSizeLabel("42 EU", "EU"), "EU 42");
  assert.equal(formatShoeSizeLabel("EUR 42", "EU"), "EU 42");
  assert.equal(formatShoeSizeLabel("US 8.5", "US_WOMEN"), "US Women 8.5");
  assert.equal(formatShoeSizeLabel("US Men 8.5", "US_MEN"), "US Men 8.5");
  assert.equal(formatShoeSizeLabel("USW 8.5", "US_WOMEN"), "US Women 8.5");
  assert.equal(formatShoeSizeLabel("EU EU 42", "EU"), null);
  assert.equal(formatShoeSizeLabel("UK 8", "EU"), null);
  assert.equal(formatShoeSizeLabel("L", "EU"), null);
  assert.equal(formatShoeSizeLabel("unknown 42", "EU"), null);
  assert.equal(formatShoeSizeLabel("42", "UNKNOWN"), null);
});

it("persists a human-confirmed shoe pair and clears garment fields, retaining only human insole length", async () => {
  let saved: Record<string, unknown> = {};
  let cleared: Record<string, unknown> = {};
  const measured: Array<Record<string, unknown>> = [];
  const decisions: Array<Record<string, unknown>> = [];
  prisma.product.findUnique = (async () => ({ id: "product-1", status: ProductStatus.CALIBRATION_PENDING })) as never;
  prisma.aIExtraction.findFirst = (async () => ({ id: "extraction-1", fieldDecisions: [] })) as never;
  prisma.product.update = (async ({ data }: { data: Record<string, unknown> }) => { saved = data; return data; }) as never;
  prisma.productMeasurement.updateMany = (async (args: Record<string, unknown>) => { cleared = args; return { count: 1 }; }) as never;
  prisma.productMeasurement.upsert = (async ({ create }: { create: Record<string, unknown> }) => { measured.push(create); return create; }) as never;
  prisma.aIFieldDecision.upsert = (async ({ create }: { create: Record<string, unknown> }) => { decisions.push(create); return create; }) as never;
  prisma.productDefect.deleteMany = (async () => ({ count: 0 })) as never;
  prisma.$transaction = (async (operations: Promise<unknown>[]) => Promise.all(operations)) as never;
  await new ProductCalibrationService({ assertCanTransition: () => undefined } as never).calibrate("product-1", shoeInput());
  assert.equal(saved.category, "SHOES");
  assert.equal(saved.tagSize, "EU 32");
  assert.equal(saved.finalSizeLabel, "EU 32");
  assert.equal(saved.shoeSizeSystem, "EU");
  assert.equal(saved.shoeType, "Sneakers");
  assert.equal(saved.shoePairConfirmed, true);
  assert.equal(saved.shoeConditionNotes, "Light sole wear; no visible separation.");
  assert.equal(saved.kidsAgeRange, null);
  assert.equal(saved.ukSizeLabel, null);
  assert.equal(saved.sleeveType, "NOT_APPLICABLE");
  assert.equal(saved.fitType, "UNKNOWN");
  assert.equal(saved.stretchLevel, "UNKNOWN");
  assert.equal(saved.fabricWeight, "UNKNOWN");
  assert.deepEqual(cleared.where, { productId: "product-1", measurementType: { notIn: ["INSOLE_LENGTH"] } });
  assert.equal(measured.length, 1);
  assert.equal(measured[0].measurementType, "INSOLE_LENGTH");
  assert.equal(measured[0].finalSource, "HUMAN_ENTERED");
  assert.equal(measured[0].reviewedByEmployeeId, "employee-1");
  assert.ok(decisions.some((decision) => decision.fieldName === "shoePairConfirmed" && decision.finalValueJson === true && decision.source === "HUMAN_ENTERED"));
});

it("rejects missing shoe confirmation and ambiguous sizes before changing persisted data", async () => {
  let reads = 0;
  prisma.product.findUnique = (async () => { reads++; return null; }) as never;
  const service = new ProductCalibrationService({ assertCanTransition: () => undefined } as never);
  for (const invalid of [
    { shoePairConfirmed: false }, { shoeSizeSystem: undefined }, { tagSize: "" }, { tagSize: "L" },
    { tagSize: "UK 8" }, { shoeType: "INVALID" }, { shoeConditionNotes: " " }
  ]) {
    await assert.rejects(service.calibrate("product-1", { ...shoeInput(), ...invalid }), /Confirm/);
  }
  assert.equal(reads, 0);
});

describe("ProductCalibrationService", () => {
  it("persists final display attributes without overwriting AI source values", async () => {
    let productUpdate: Record<string, unknown> | undefined;
    const decisionUpdates: Array<Record<string, unknown>> = [];
    const measurementUpdates: Array<Record<string, unknown>> = [];

    prisma.product.findUnique = (async () => ({ id: "product-1", status: ProductStatus.CALIBRATION_PENDING })) as never;
    prisma.aIExtraction.findFirst = (async () => ({
      id: "extraction-1",
      productId: "product-1",
      fieldDecisions: [
        { fieldName: "pattern", aiValueJson: "SOLID" },
        { fieldName: "sleeveType", aiValueJson: "SHORT" }
      ]
    })) as never;
    prisma.product.update = (({ data }: { data: Record<string, unknown> }) => {
      productUpdate = data;
      return Promise.resolve(data);
    }) as never;
    prisma.aIFieldDecision.upsert = (({ update }: { update: Record<string, unknown> }) => {
      decisionUpdates.push(update);
      return Promise.resolve(update);
    }) as never;
    prisma.productMeasurement.updateMany = (async () => ({ count: 0 })) as never;
    prisma.productMeasurement.upsert = (async ({ create, update }: { create: unknown; update: Record<string, unknown> }) => {
      measurementUpdates.push(update);
      return create;
    }) as never;
    prisma.productDefect.deleteMany = (async () => ({ count: 0 })) as never;
    prisma.productDefect.create = (async ({ data }: { data: unknown }) => data) as never;
    prisma.$transaction = (async (operations: Promise<unknown>[]) => Promise.all(operations)) as never;

    const service = new ProductCalibrationService({ assertCanTransition: () => undefined } as never);
    await service.calibrate("product-1", {
      employeeId: "employee-1",
      extractionId: "extraction-1",
      title: "Black jacket",
      category: "JACKETS",
      subcategory: "UNISEX_JACKETS",
      color: "BLACK",
      gender: ProductGender.UNISEX,
      pattern: "STRIPED",
      sleeveType: "LONG",
      fitType: ProductFitType.REGULAR,
      stretchLevel: ProductStretchLevel.LOW,
      fabricWeight: ProductFabricWeight.HEAVY,
      material: "COTTON_BLEND",
      tags: ["HOODED", "CASUAL"],
      sizeLabel: "M",
      ukSizeLabel: "UK M",
      conditionGrade: ConditionGrade.GOOD,
      priceKsh: 850,
      measurements: [{
        type: "LENGTH",
        valueCm: 72,
        manualLine: {
          imageId: "front-original",
          start: { x: 0.51, y: 0.24 },
          end: { x: 0.51, y: 0.88 }
        }
      }],
      defects: []
    });

    assert.equal(productUpdate?.pattern, "STRIPED");
    assert.equal(productUpdate?.sleeveType, "LONG");
    assert.equal(productUpdate?.fitType, "REGULAR");
    assert.equal(productUpdate?.stretchLevel, "LOW");
    assert.equal(productUpdate?.fabricWeight, "HEAVY");
    assert.equal(productUpdate?.material, "COTTON_BLEND");
    assert.deepEqual(productUpdate?.tags, ["HOODED", "CASUAL"]);
    assert.equal(productUpdate?.ukSizeLabel, "UK M");
    assert.ok(decisionUpdates.some((update) => update.finalValueJson === "STRIPED"));
    assert.ok(decisionUpdates.some((update) => update.finalValueJson === "LONG"));
    assert.ok(decisionUpdates.some((update) => update.finalValueJson === "REGULAR"));
    assert.ok(decisionUpdates.some((update) => update.finalValueJson === "LOW"));
    assert.ok(decisionUpdates.some((update) => update.finalValueJson === "HEAVY"));
    assert.ok(decisionUpdates.some((update) => update.finalValueJson === "COTTON_BLEND"));
    assert.ok(decisionUpdates.some((update) => JSON.stringify(update.finalValueJson) === JSON.stringify(["HOODED", "CASUAL"])));
    assert.ok(decisionUpdates.some((update) => update.finalValueJson === "UK M"));
    assert.ok(decisionUpdates.every((update) => !("aiValueJson" in update)));
    assert.ok(measurementUpdates.every((update) => !("aiValueCm" in update) && !("aiConfidence" in update)));
    assert.equal(measurementUpdates[0]?.manualLineImageId, "front-original");
    assert.equal(measurementUpdates[0]?.manualLineStartX, 0.51);
    assert.equal(measurementUpdates[0]?.manualLineStartY, 0.24);
    assert.equal(measurementUpdates[0]?.manualLineEndX, 0.51);
    assert.equal(measurementUpdates[0]?.manualLineEndY, 0.88);
  });
});
