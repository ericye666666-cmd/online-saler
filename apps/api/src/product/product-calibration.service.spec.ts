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

const originals = {
  productFindUnique: prisma.product.findUnique,
  productUpdate: prisma.product.update,
  extractionFindFirst: prisma.aIExtraction.findFirst,
  decisionUpsert: prisma.aIFieldDecision.upsert,
  measurementDeleteMany: prisma.productMeasurement.deleteMany,
  measurementCreate: prisma.productMeasurement.create,
  defectDeleteMany: prisma.productDefect.deleteMany,
  defectCreate: prisma.productDefect.create,
  transaction: prisma.$transaction
};

afterEach(() => {
  prisma.product.findUnique = originals.productFindUnique;
  prisma.product.update = originals.productUpdate;
  prisma.aIExtraction.findFirst = originals.extractionFindFirst;
  prisma.aIFieldDecision.upsert = originals.decisionUpsert;
  prisma.productMeasurement.deleteMany = originals.measurementDeleteMany;
  prisma.productMeasurement.create = originals.measurementCreate;
  prisma.productDefect.deleteMany = originals.defectDeleteMany;
  prisma.productDefect.create = originals.defectCreate;
  prisma.$transaction = originals.transaction;
});

describe("ProductCalibrationService", () => {
  it("persists final display attributes without overwriting AI source values", async () => {
    let productUpdate: Record<string, unknown> | undefined;
    const decisionUpdates: Array<Record<string, unknown>> = [];

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
    prisma.productMeasurement.deleteMany = (async () => ({ count: 0 })) as never;
    prisma.productMeasurement.create = (async ({ data }: { data: unknown }) => data) as never;
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
      sizeLabel: "M",
      conditionGrade: ConditionGrade.GOOD,
      priceKsh: 850,
      measurements: [{ type: "LENGTH", valueCm: 72 }],
      defects: []
    });

    assert.equal(productUpdate?.pattern, "STRIPED");
    assert.equal(productUpdate?.sleeveType, "LONG");
    assert.equal(productUpdate?.fitType, "REGULAR");
    assert.equal(productUpdate?.stretchLevel, "LOW");
    assert.equal(productUpdate?.fabricWeight, "HEAVY");
    assert.ok(decisionUpdates.some((update) => update.finalValueJson === "STRIPED"));
    assert.ok(decisionUpdates.some((update) => update.finalValueJson === "LONG"));
    assert.ok(decisionUpdates.some((update) => update.finalValueJson === "REGULAR"));
    assert.ok(decisionUpdates.some((update) => update.finalValueJson === "LOW"));
    assert.ok(decisionUpdates.some((update) => update.finalValueJson === "HEAVY"));
    assert.ok(decisionUpdates.every((update) => !("aiValueJson" in update)));
  });
});
